// 운영안 → 자동 생성: 기획자가 붙여넣은 운영안 텍스트(또는 PDF 에서 뽑은 텍스트)를 Claude 가 읽어
// 지도 핀·타임테이블·공지·행사 안내·럭키드로우·설문 초안을 구조화 JSON 으로 돌려준다. DB 에는 쓰지 않는다 —
// 화면에서 미리 보고 "적용" 을 눌러야 들어간다 (적용은 브라우저가 RLS 로 직접 insert).
// 호출 조건: Authorization: Bearer <Supabase 세션 토큰> 이 그 행사 관리자여야 한다 (my_admin_scope 로 확인).
// 환경변수: ANTHROPIC_API_KEY (필수), ANTHROPIC_MODEL (선택)
export const config = { runtime: 'edge', regions: ['icn1'] }

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
const MAX_CHARS = 60_000

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '운영안을 두 문장으로 요약 (기획자에게 보여줄 확인용)' },
    places: {
      type: 'array', description: '지도 핀. 부스·먹거리·마켓·무대·편의시설(화장실)·안내소·주차장(parking)·셔틀 정류장(shuttle)·의무실(medical). 위치는 운영안에 배치 정보가 있을 때만 0~100 퍼센트로 추정, 없으면 격자로 적당히 펼친다',
      items: { type: 'object', properties: {
        kind: { type: 'string', enum: ['booth', 'food', 'market', 'stage', 'facility', 'info', 'parking', 'shuttle', 'medical', 'other'] },
        name: { type: 'string' }, description: { type: 'string' }, hours: { type: 'string', description: '운영 시간 예: 11:00~20:00' },
        x: { type: 'number' }, y: { type: 'number' },
        menu: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'string' } }, required: ['name'] } },
      }, required: ['kind', 'name', 'x', 'y'] },
    },
    programs: {
      type: 'array', description: '타임테이블. 시간은 행사 시작일 기준 ISO 8601(+09:00). 날짜가 운영안에 없으면 starts_at 의 날짜를 쓴다',
      items: { type: 'object', properties: {
        title: { type: 'string' }, kind: { type: 'string', enum: ['stage', 'event', 'workshop', 'other'] },
        description: { type: 'string' }, place_name: { type: 'string', description: 'places 중 하나의 name 과 정확히 같게 (장소가 있을 때만)' },
        starts_at: { type: 'string' }, ends_at: { type: 'string' },
      }, required: ['title', 'kind', 'starts_at', 'ends_at'] },
    },
    notices: {
      type: 'array', description: '손님에게 알릴 공지(안전·우천·주차·미아·분실물 등). 2~4개',
      items: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, pinned: { type: 'boolean' }, urgent: { type: 'boolean' } }, required: ['title', 'body'] },
    },
    info_text: { type: 'string', description: '행사 안내 (운영시간·주차·우천·반려동물 등). 줄바꿈으로 항목 구분, 운영안에 있는 것만' },
    contact_text: { type: 'string', description: '문의처 (운영안에 전화·카톡이 있으면)' },
    directions_text: { type: 'string', description: '오시는 길 — 대중교통·셔틀 운행·주차 안내. 운영안에 있는 것만, 줄바꿈으로 항목 구분' },
    draws: {
      type: 'array', description: '럭키드로우·경품 추첨이 운영안에 있을 때만',
      items: { type: 'object', properties: { title: { type: 'string' }, prize: { type: 'string' }, description: { type: 'string' }, draw_at: { type: 'string' }, winners_count: { type: 'integer' } }, required: ['title'] },
    },
    survey: {
      type: 'object', description: '만족도 설문 초안 3~4문항. rating 1개 + choice 1~2개 + text 1개',
      properties: { title: { type: 'string' }, questions: { type: 'array', items: { type: 'object', properties: {
        type: { type: 'string', enum: ['rating', 'choice', 'text'] }, label: { type: 'string' }, options: { type: 'array', items: { type: 'string' } },
      }, required: ['type', 'label'] } } }, required: ['title', 'questions'],
    },
    stamp: { type: 'object', description: '스탬프 투어가 운영안에 있을 때만', properties: { enabled: { type: 'boolean' }, reward_text: { type: 'string' }, spot_names: { type: 'array', items: { type: 'string' }, description: 'places 의 name 중에서' } } },
  },
  required: ['summary', 'places', 'programs', 'notices', 'survey'],
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } })

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: '서버에 ANTHROPIC_API_KEY 가 없어요. Vercel 환경변수에 넣고 다시 배포해 주세요.' }, 503)

  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: '로그인이 필요해요.' }, 401)

  let body: { event_id?: string; text?: string; event_name?: string; starts_at?: string; ends_at?: string }
  try { body = await req.json() } catch { return json({ error: 'JSON 본문이 필요해요.' }, 400) }
  const { event_id, event_name = '', starts_at = '', ends_at = '' } = body
  const text = (body.text ?? '').trim()
  if (!event_id || !text) return json({ error: 'event_id 와 text 가 필요해요.' }, 400)
  if (text.length < 40) return json({ error: '운영안이 너무 짧아요. 부스·시간표·안내가 들어 있는 글을 붙여 주세요.' }, 400)

  // 1) 이 토큰이 그 행사 관리자인지 — Supabase RPC 를 사용자 토큰으로 호출하면 RLS·auth 그대로 적용된다
  const base = process.env.VITE_SUPABASE_URL!, anon = process.env.VITE_SUPABASE_ANON_KEY!
  const sr = await fetch(`${base}/rest/v1/rpc/my_admin_scope`, { method: 'POST', headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' })
  if (!sr.ok) return json({ error: '로그인이 만료됐어요. 다시 로그인해 주세요.' }, 401)
  const scope = await sr.json() as { owner?: boolean; event_ids?: string[] }
  if (!scope?.owner && !(scope?.event_ids ?? []).includes(event_id)) return json({ error: '이 행사에 대한 권한이 없어요.' }, 403)

  // 2) Claude 에게 구조화 추출 — tool use 로 스키마를 강제한다
  const system = [
    '당신은 한국의 축제·플리마켓·야시장 운영 대행사 FLIT 의 운영 보조입니다. 기획자가 쓴 운영안(기획서·큐시트·부스 배치표 등)을 읽고,',
    '손님용 행사 앱에 넣을 데이터를 extract_plan 도구로 정리합니다. 규칙:',
    '- 운영안에 있는 것만 적는다. 없는 부스·시간·경품을 지어내지 않는다. 설문 문항만 예외로 일반적인 초안을 만든다.',
    '- 이름은 손님이 읽는 그대로, 짧게. 내부 담당자명·예산·단가 같은 내부 정보는 손님 화면에 넣지 않는다.',
    '- 시간은 +09:00 ISO 8601. 날짜가 없으면 행사 시작일을 쓴다. 종료 시간이 없으면 시작 +1시간.',
    '- 핀 좌표(x,y)는 0~100. 배치 정보가 "입구 쪽/무대 옆/안쪽" 정도면 대략 추정하고, 전혀 없으면 종류별로 겹치지 않게 펼친다.',
    '- 말투는 해요체, 느낌표·이모지 금지.',
  ].join('\n')
  const user = `행사명: ${event_name}\n행사 시작: ${starts_at}\n행사 종료: ${ends_at}\n\n=== 운영안 ===\n${text.slice(0, MAX_CHARS)}`

  const ar = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000, system,
      tools: [{ name: 'extract_plan', description: '운영안에서 뽑은 행사 앱 데이터', input_schema: SCHEMA }],
      tool_choice: { type: 'tool', name: 'extract_plan' },
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!ar.ok) {
    const t = await ar.text().catch(() => '')
    return json({ error: `AI 호출 실패 (${ar.status}). ${t.slice(0, 300)}` }, 502)
  }
  const out = await ar.json() as { content?: { type: string; name?: string; input?: unknown }[]; usage?: unknown }
  const tool = out.content?.find(c => c.type === 'tool_use' && c.name === 'extract_plan')
  if (!tool?.input) return json({ error: 'AI 가 구조화 결과를 돌려주지 않았어요. 운영안을 조금 더 자세히 써서 다시 시도해 주세요.' }, 502)
  return json({ plan: tool.input, model: MODEL, usage: out.usage })
}
