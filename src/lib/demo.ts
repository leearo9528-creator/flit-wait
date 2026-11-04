// 데모 모드 — 서버 없이 브라우저 안에서 돌아가는 가짜 Supabase. `/demo` 로 들어오면 켜진다.
// 용도: 마이그레이션·로그인 없이 관리자 화면과 손님 화면을 전부 눌러 보기 (영업 시연·내부 리뷰).
// 데이터는 localStorage 에 두고, '데모 초기화' 로 다시 깐다. 프로덕션 DB 는 전혀 안 건드린다.
// ⚠️ 기획자 흐름(e2e)에서 쓰는 /home/claude/fakesb.js 와 같은 논리 — 테이블 CRUD + RPC 스텁. 리포트 숫자는 샘플(가상).
export const DEMO_KEY = 'flit:demo'
export const isDemo = () => { try { return localStorage.getItem(DEMO_KEY) === '1' } catch { return false } }

type Row = Record<string, any>
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
const now = () => new Date().toISOString()
export const DEMO_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'demo@flitunion.com', aud: 'authenticated', role: 'authenticated', user_metadata: { name: '데모 기획자' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }

function load(): Record<string, Row[]> { try { return JSON.parse(localStorage.getItem(`${DEMO_KEY}:db`) || '{}') } catch { return {} } }
function save(db: Record<string, Row[]>) { try { localStorage.setItem(`${DEMO_KEY}:db`, JSON.stringify(db)) } catch {} }

export function makeDemoFetch(): typeof fetch {
  const db = load()
  const T = (n: string) => (db[n] ||= [])
  const persist = () => save(db)
  const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...headers } })

  const rpc: Record<string, (a: Row) => unknown> = {
    my_admin_scope: () => ({ owner: true, event_ids: T('events').map(e => e.id) }),
    create_my_event: ({ p_name, p_slug, p_starts_at, p_ends_at }) => {
      const id = uid()
      T('events').push({ id, name: p_name, slug: p_slug, starts_at: p_starts_at, ends_at: p_ends_at, status: 'draft', notice: null, privacy_text: '개인정보는 행사 종료 후 7일 내 삭제돼요.', data_retention_days: 7, image_url: null, map_image_url: null, map_note: null, lat: 37.3947, lng: 127.1112, vendor_token: 'demo-vendor', vendor_open: false, stamp_enabled: false, stamp_goal: null, stamp_reward_text: null, accent_color: null, info_text: null, contact_text: null, directions_text: null, created_at: now() })
      persist(); return id
    },
    gen_admin_code: () => 'FLIT-DEMO-0001',
    admin_purge_event: () => 0,
    track_view: () => null,
    admin_event_stats: () => ({ by_booth: [], by_hour: [], notifications: {} }),
    admin_vendor_approve: ({ p_submission }) => { const s = T('vendor_submissions').find(x => x.id === p_submission); if (!s) return null; const id = uid(); T('places').push({ id, event_id: s.event_id, kind: s.kind, name: s.name, description: s.description, menu: s.menu, image_url: s.image_url, x: 50, y: 50, sort_order: 999, booth_id: null, hours: null, lat: null, lng: null, crowd: null }); s.status = 'approved'; s.place_id = id; persist(); return id },
    admin_draw_pick: ({ p_draw }) => { const es = T('draw_entries').filter(e => e.draw_id === p_draw); es.forEach(e => e.won = false); const d = T('draws').find(x => x.id === p_draw); const n = Math.min(d?.winners_count ?? 1, es.length); es.slice(0, n).forEach(e => e.won = true); if (d) d.status = 'drawn'; persist(); return es.filter(e => e.won).map(e => ({ name: e.name, phone: e.phone })) },
    admin_survey_summary: ({ p_event }) => SAMPLE.survey(p_event, T),
    admin_event_report: ({ p_event }) => SAMPLE.report(p_event, T),
    admin_event_report_extra: ({ p_event }) => ({ survey: SAMPLE.survey(p_event, T), draws: T('draws').filter(d => d.event_id === p_event).map(d => ({ title: d.title, status: d.status, entries: T('draw_entries').filter(e => e.draw_id === d.id).length + 377, winners: d.winners_count })), vendors: { pending: T('vendor_submissions').filter(v => v.event_id === p_event && v.status === 'pending').length, approved: 28 } }),
    admin_event_dataset: ({ p_event }) => SAMPLE.dataset(p_event, T),
    // 손님용
    event_schedule: ({ p_slug }) => { const e = T('events').find(x => x.slug === p_slug); if (!e || e.status !== 'open') return null; return { event: { ...e, booth_count: T('booths').filter(b => b.event_id === e.id).length, survey_enabled: !!T('surveys').find(s => s.event_id === e.id)?.enabled, draw_open: T('draws').some(d => d.event_id === e.id && ['open', 'drawn'].includes(d.status)) }, programs: T('programs').filter(p => p.event_id === e.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(p => ({ ...p, place: p.place_id ? { id: p.place_id, name: T('places').find(x => x.id === p.place_id)?.name } : null })), notices: T('notices').filter(n => n.event_id === e.id).map((n): Row => ({ ...n, publish_at: n.publish_at ?? n.created_at })).sort((a, b) => Number(b.pinned) - Number(a.pinned)) } },
    event_guide: ({ p_slug }) => { const e = T('events').find(x => x.slug === p_slug); if (!e || e.status !== 'open') return null; return { event: e, places: T('places').filter(p => p.event_id === e.id).sort((a, b) => a.sort_order - b.sort_order).map(p => ({ ...p, menu: p.menu ?? [], booth: null })) } },
    event_summary: ({ p_slug }) => { const e = T('events').find(x => x.slug === p_slug); return e ? { event: e, booths: [] } : null },
    stamp_status: ({ p_slug, p_card }) => { const e = T('events').find(x => x.slug === p_slug); if (!e) return null; const card = T('stamp_cards').find(c => c.event_id === e.id && c.card_token === p_card); const spots = T('stamp_spots').filter(s => s.event_id === e.id).sort((a, b) => a.sort_order - b.sort_order); const got = new Set(T('stamps').filter(s => s.card_id === card?.id).map(s => s.spot_id)); const goal = e.stamp_goal ?? spots.length; return { enabled: e.stamp_enabled, goal, reward_text: e.stamp_reward_text, spots: spots.map(s => ({ id: s.id, name: s.name, collected: got.has(s.id) })), collected: got.size, count: got.size, completed: got.size >= goal, reward_code: got.size >= goal && card ? (card.reward_code ??= String(100000 + Math.floor(Math.random() * 900000))) : null } },
    stamp_collect: ({ p_slug, p_card, p_code }) => { const e = T('events').find(x => x.slug === p_slug); const spot = T('stamp_spots').find(s => s.event_id === e?.id && s.code === p_code); if (!e || !spot) throw new Error('이 QR 은 이 행사의 스탬프가 아니에요.'); let card = T('stamp_cards').find(c => c.event_id === e.id && c.card_token === p_card); if (!card) { card = { id: uid(), event_id: e.id, card_token: p_card, created_at: now() }; T('stamp_cards').push(card) } if (!T('stamps').some(s => s.card_id === card!.id && s.spot_id === spot.id)) T('stamps').push({ id: uid(), card_id: card.id, spot_id: spot.id, created_at: now() }); persist(); return { spot: spot.name, ...(rpc.stamp_status({ p_slug, p_card }) as object) } },
    draw_status: ({ p_slug, p_card }) => { const e = T('events').find(x => x.slug === p_slug); return T('draws').filter(d => d.event_id === e?.id && d.status !== 'draft').map(d => { const mine = T('draw_entries').find(x => x.draw_id === d.id && x.card_token === p_card); return { id: d.id, title: d.title, prize: d.prize, description: d.description, draw_at: d.draw_at, winners_count: d.winners_count, status: d.status, entered: !!mine, won: mine?.won ?? null, require_stamp: d.require_stamp ?? false, entries: T('draw_entries').filter(x => x.draw_id === d.id).length + 377 } }) },
    draw_enter: ({ p_draw, p_card, p_name, p_phone }) => { if (T('draw_entries').some(x => x.draw_id === p_draw && x.card_token === p_card)) throw new Error('이미 응모했어요.'); T('draw_entries').push({ id: uid(), draw_id: p_draw, card_token: p_card, name: p_name, phone: p_phone, won: null, created_at: now() }); persist(); return true },
    survey_get: ({ p_slug, p_card }) => { const e = T('events').find(x => x.slug === p_slug); const s = T('surveys').find(x => x.event_id === e?.id); if (!s) return { enabled: false, title: null, questions: [], thanks: null, done: false }; return { enabled: s.enabled, title: s.title, questions: s.questions, thanks: s.thanks ?? null, done: T('survey_responses').some(r => r.event_id === e!.id && r.card_token === p_card) } },
    survey_submit: ({ p_slug, p_card, p_answers }) => { const e = T('events').find(x => x.slug === p_slug); if (!e) throw new Error('행사 없음'); T('survey_responses').push({ id: uid(), event_id: e.id, card_token: p_card, answers: p_answers, created_at: now() }); persist(); return true },
    vendor_info: ({ p_token }) => { const e = T('events').find(x => x.vendor_token === p_token); return e ? { event_name: e.name, event_id: e.id, open: e.vendor_open, starts_at: e.starts_at, ends_at: e.ends_at } : null },
    vendor_submit: ({ p_token, p_kind, p_name, p_description, p_menu, p_image_url, p_contact }) => { const e = T('events').find(x => x.vendor_token === p_token); if (!e || !e.vendor_open) throw new Error('지금은 등록을 받지 않아요.'); const id = uid(); T('vendor_submissions').push({ id, event_id: e.id, kind: p_kind, name: p_name, description: p_description, menu: p_menu ?? [], image_url: p_image_url, contact: p_contact, status: 'pending', place_id: null, created_at: now() }); persist(); return id },
  }

  function parse(sp: URLSearchParams) {
    const f: { col: string; op: string; val: string }[] = []; let order: { col: string; asc: boolean } | null = null, limit: number | null = null
    for (const [k, v] of sp) {
      if (k === 'select' || k === 'on_conflict') continue
      if (k === 'order') { const [col, dir] = v.split('.'); order = { col, asc: dir !== 'desc' }; continue }
      if (k === 'limit') { limit = +v; continue }
      const m = v.match(/^(eq|in|is|not|neq)\.(.*)$/); if (m) f.push({ col: k, op: m[1], val: m[2] })
    }
    return { f, order, limit }
  }
  function apply(rows: Row[], { f, order, limit }: ReturnType<typeof parse>) {
    let out = rows.filter(r => f.every(({ col, op, val }) => {
      const c = r[col]
      if (op === 'eq') return String(c) === val
      if (op === 'neq') return String(c) !== val
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(c))
      if (op === 'is') return val === 'null' ? c == null : !!c === (val === 'true')
      if (op === 'not') { const m = val.match(/^(\w+)\.(.*)$/); if (m?.[1] === 'is') return m[2] === 'null' ? c != null : true; return true }
      return true
    }))
    if (order) out = [...out].sort((a, b) => (a[order!.col] > b[order!.col] ? 1 : a[order!.col] < b[order!.col] ? -1 : 0) * (order!.asc ? 1 : -1))
    if (limit) out = out.slice(0, limit)
    return out
  }

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const url = new URL(req.url); const path = url.pathname; const method = req.method
    const accept = req.headers.get('accept') ?? ''; const prefer = req.headers.get('prefer') ?? ''
    const body = async () => { try { return await req.json() } catch { return null } }
    if (path.startsWith('/auth/v1/user')) return json(DEMO_USER)
    if (path.startsWith('/auth/v1/token')) return json({ access_token: 'demo', refresh_token: 'demo', expires_in: 999999, expires_at: Math.floor(Date.now() / 1000) + 999999, token_type: 'bearer', user: DEMO_USER })
    if (path.startsWith('/auth/v1/logout')) { try { localStorage.removeItem(DEMO_KEY) } catch {} return json({}) }
    if (path.startsWith('/storage/v1/object/')) return json({ Key: path.replace('/storage/v1/object/', '') })
    if (path.startsWith('/rest/v1/rpc/')) { const fn = path.split('/rpc/')[1]; const b = (await body()) ?? {}; if (!rpc[fn]) return json({ message: `데모에는 ${fn} 이 없어요` }, 404); try { return json(rpc[fn](b) ?? null) } catch (e: any) { return json({ message: e.message, code: 'P0001' }, 400) } }
    if (path.startsWith('/rest/v1/')) {
      const table = path.split('/rest/v1/')[1]; const rows = T(table); const q = parse(url.searchParams)
      if (method === 'HEAD') { const n = apply(rows, q).length; return new Response('', { status: 200, headers: { 'Content-Range': `0-${Math.max(0, n - 1)}/${n}` } }) }
      if (method === 'GET') { const out = apply(rows, q); if (accept.includes('vnd.pgrst.object')) return out.length ? json(out[0]) : json({ message: 'no rows', code: 'PGRST116' }, 406); return json(out) }
      if (method === 'POST') {
        const b = await body(); const arr = Array.isArray(b) ? b : [b]
        const ins = arr.map(r => ({ id: uid(), created_at: now(), ...(table === 'stamp_spots' ? { code: Math.random().toString(16).slice(2, 14) } : {}), ...(table === 'notices' ? { publish_at: now(), urgent: false, pinned: false } : {}), ...(table === 'places' ? { x: 50, y: 50, sort_order: 0, crowd: null } : {}), ...(table === 'draws' ? { status: 'open' } : {}), ...r }))
        if (prefer.includes('resolution=merge-duplicates')) { for (const r of ins) { const i = rows.findIndex(x => table === 'surveys' ? x.event_id === r.event_id : x.id === r.id); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r) } } else rows.push(...ins)
        persist(); return accept.includes('vnd.pgrst.object') ? json(ins[0], 201) : json(ins, 201)
      }
      if (method === 'PATCH') { const b = await body(); const out = apply(rows, q); out.forEach(r => { if (table === 'places' && b && 'crowd' in b && b.crowd !== r.crowd) { r.crowd_updated_at = b.crowd ? now() : null; T('crowd_log').push({ id: uid(), event_id: r.event_id, place_id: r.id, crowd: b.crowd, at: now() }) } Object.assign(r, b) }); persist(); return json(out) }
      if (method === 'DELETE') { const out = apply(rows, q); out.forEach(r => rows.splice(rows.indexOf(r), 1)); persist(); return json(out) }
    }
    return new Response('not in demo', { status: 404 })
  }
}

/** 데모 리포트 숫자 — 성남 규모 가상치. 실DB 에선 전부 집계로 바뀐다 */
const SAMPLE = {
  report: (eventId: string, T: (n: string) => Row[]) => { const e = T('events').find(x => x.id === eventId) ?? {}; return { event: { ...e, stamp_enabled: true, stamp_goal: null }, views: { total: 1842, by_day: [{ day: '2026-12-20', count: 1013 }, { day: '2026-12-21', count: 829 }], by_page: [{ page: 'home', count: 1842 }, { page: 'map', count: 1204 }] }, tickets: { total: 412, queue: 305, reserved: 107, served: 361, people: 923, no_show: 38, avg_wait_min: 14, by_booth: [{ name: '석고방향제 만들기', mode: 'slot', total: 96, served: 88, people: 231, no_show: 8 }, { name: '페이스페인팅', mode: 'queue', total: 142, served: 127, people: 310, no_show: 12 }, { name: '키링 만들기', mode: 'queue', total: 104, served: 90, people: 228, no_show: 11 }, { name: '바디밸런스 체크', mode: 'mixed', total: 70, served: 56, people: 154, no_show: 7 }], by_day: [{ day: '2026-12-20', count: 230 }, { day: '2026-12-21', count: 182 }] }, stamps: { cards: 530, completed: 212, redeemed: 198, stamps: 1870, by_spot: T('stamp_spots').filter(s => s.event_id === eventId).map((s, i) => ({ name: s.name, count: [502, 455, 388, 401, 243, 176][i] ?? 120 })) }, content: { places: T('places').filter(p => p.event_id === eventId).length, programs: T('programs').filter(p => p.event_id === eventId).length, notices: T('notices').filter(p => p.event_id === eventId).length, urgent_notices: 1 }, notifications: { sent: 388, failed: 3 } } },
  survey: (eventId: string, T: (n: string) => Row[]) => { const s = T('surveys').find(x => x.event_id === eventId); const dist: Record<string, Record<string, number>> = { q1: { '5': 104, '4': 78, '3': 24, '2': 6, '1': 2 }, q_res: { '시내(관내)': 121, '도내 다른 시·군': 48, '수도권': 39, '그 외 지역': 6 }, q_age: { '10대': 18, '20대': 52, '30대': 77, '40대': 49, '50대 이상': 18 }, q_with: { '가족(아이 동반)': 98, '친구': 54, '연인': 41, '혼자': 15, '단체': 6 }, q_via: { '현수막·포스터': 67, 'SNS': 71, '지인': 48, '뉴스·블로그': 12, '지나가다': 16 } }; return { responses: 214 + T('survey_responses').filter(r => r.event_id === eventId).length, questions: (s?.questions ?? []).map((q: Row) => ({ id: q.id, label: q.label, type: q.type, avg: q.type === 'rating' ? 4.3 : null, dist: q.type === 'text' ? null : dist[q.id] ?? Object.fromEntries((q.options ?? []).map((o: string, i: number) => [o, [71, 58, 44, 33, 8][i] ?? 10])), texts: q.type === 'text' ? ['화장실이 멀어요', '푸드트럭 줄이 너무 길었어요', '포토존 좋았어요 내년에도', '주차가 힘들었어요 셔틀 더 자주'] : null })) } },
  dataset: (eventId: string, T: (n: string) => Row[]) => { const spots = T('stamp_spots').filter(s => s.event_id === eventId); const nm = (i: number) => spots[i]?.name ?? `지점 ${i + 1}`; const log = T('crowd_log').filter(l => l.event_id === eventId); return { views_by_hour: [11, 12, 13, 14, 15, 16, 17, 18, 19].map((h, i) => ({ hour: h, count: [90, 180, 260, 310, 290, 240, 210, 170, 92][i] })), journey: { cards: 530, cards_2plus: 471, dwell_median_min: 96, dwell_avg_min: 108, reach: spots.map((s, i) => ({ name: s.name, cards: [502, 455, 388, 401, 243, 176][i] ?? 120 })), first_spot: [{ name: nm(0), count: 318 }, { name: nm(1), count: 142 }], transitions: [{ from: nm(0), to: nm(1), count: 287 }, { from: nm(1), to: nm(2), count: 201 }, { from: nm(2), to: nm(3), count: 188 }], by_hour: [11, 12, 13, 14, 15, 16, 17, 18, 19].map((h, i) => ({ hour: h, count: [60, 190, 280, 320, 300, 260, 230, 160, 70][i] })) }, crowd: [{ name: '푸드존', kind: 'food', changes: 6 + log.length, high_min: 140, mid_min: 210 }, { name: '임시 주차장', kind: 'parking', changes: 4, high_min: 95, mid_min: 160 }], notices: T('notices').filter(n => n.event_id === eventId).map(n => ({ title: n.title, urgent: !!n.urgent, at: n.publish_at ?? n.created_at })), vendors: { submitted: 34 + T('vendor_submissions').filter(v => v.event_id === eventId).length, approved: 28 }, draws: T('draws').filter(d => d.event_id === eventId).map(d => ({ title: d.title, entries: 377, winners: d.winners_count })) } },
}

/** 데모 켜기: 플래그 + 세션 + 샘플 행사. 이미 켜져 있으면 데이터는 유지 */
export async function startDemo(reset = false) {
  if (reset) { localStorage.removeItem(`${DEMO_KEY}:db`) }
  localStorage.setItem(DEMO_KEY, '1')
  const ref = new URL(import.meta.env.VITE_SUPABASE_URL).host.split('.')[0]
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'demo', refresh_token: 'demo', expires_in: 999999, expires_at: Math.floor(Date.now() / 1000) + 999999, token_type: 'bearer', user: DEMO_USER }))
}
