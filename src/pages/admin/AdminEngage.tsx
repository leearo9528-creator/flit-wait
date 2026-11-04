import { useEffect, useState } from 'react'
import { supabase, PUBLIC_BASE_URL } from '../../lib/supabase'
import { useAsync, fmtDateTime } from '../../lib/util'
import { Card, Button, Field, Input, Alert, Spinner, Empty, Badge } from '../../components/ui'
import type { DrawRow, EventRow, SurveyQuestion, VendorSubmissionRow } from '../../lib/types'

/** 참여 — 럭키드로우 / 만족도 설문 / 셀러 셀프 등록 (겨울 페어·연말 마켓용) */
export default function AdminEngage({ e, onSaved }: { e: EventRow; onSaved: () => void }) {
  return (
    <div className="space-y-4">
      <Vendors e={e} onSaved={onSaved} />
      <Draws e={e} />
      <SurveyEditor e={e} />
    </div>
  )
}

const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); const k = new Date(d.getTime() + 9 * 3600_000); return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}` }
const fromLocal = (s: string) => new Date(`${s}:00+09:00`).toISOString()

// ───────── 셀러 셀프 등록
function Vendors({ e, onSaved }: { e: EventRow; onSaved: () => void }) {
  const link = `${PUBLIC_BASE_URL}/v/${e.vendor_token}`
  const q = useAsync<VendorSubmissionRow[]>(async () => { const { data, error } = await supabase.from('vendor_submissions').select('*').eq('event_id', e.id).order('created_at', { ascending: false }); if (error) throw error; return data as VendorSubmissionRow[] }, [e.id])
  useEffect(() => { const i = setInterval(q.reload, 20000); return () => clearInterval(i) }, [q.reload])
  const [msg, setMsg] = useState<string | null>(null)
  async function toggle() { const { error } = await supabase.from('events').update({ vendor_open: !e.vendor_open }).eq('id', e.id); setMsg(error ? error.message : null); onSaved() }
  async function approve(id: string) { const { error } = await supabase.rpc('admin_vendor_approve', { p_submission: id }); setMsg(error ? error.message : '승인했어요. 지도 탭에서 핀 자리를 잡아 주세요.'); q.reload() }
  async function reject(id: string) { await supabase.from('vendor_submissions').update({ status: 'rejected' }).eq('id', id); q.reload() }
  const pending = q.data?.filter(v => v.status === 'pending') ?? []
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 font-bold">셀러·푸드트럭 셀프 등록 {pending.length > 0 && <Badge tone="amber">대기 {pending.length}</Badge>}</h3>
        <Button variant={e.vendor_open ? 'danger' : 'primary'} size="sm" className="!w-auto" onClick={toggle}>{e.vendor_open ? '등록 닫기' : '등록 열기'}</Button>
      </div>
      <p className="mb-3 text-xs text-gray-500">이 링크를 참가 업체 단톡방에 보내면 업체가 직접 이름·소개·메뉴·사진을 올려요. 승인하면 손님 지도·먹거리 목록에 바로 올라가요.</p>
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
        <code className="flex-1 truncate">{link}</code>
        <Button variant="secondary" size="sm" className="!w-auto" onClick={() => navigator.clipboard?.writeText(link)}>복사</Button>
      </div>
      {msg && <div className="mb-3"><Alert kind={msg.includes('했어요') ? 'success' : 'error'}>{msg}</Alert></div>}
      {q.loading && <Spinner />}
      {q.data?.length === 0 && <Empty>아직 등록한 업체가 없어요.</Empty>}
      <ul className="divide-y">
        {q.data?.map(v => (
          <li key={v.id} className="flex items-center gap-3 py-2.5">
            {v.image_url ? <img src={v.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-gray-100" />}
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-500">{{ market: '마켓', food: '먹거리', booth: '체험', other: '기타' }[v.kind]} · {v.contact} · {fmtDateTime(v.created_at)}</div>
              <div className="truncate font-semibold">{v.name}</div>
              {(v.description || v.menu.length > 0) && <div className="truncate text-xs text-gray-500">{v.description}{v.menu.length ? ` · ${v.menu.map(m => m.name).join(', ')}` : ''}</div>}
            </div>
            {v.status === 'pending' ? <><Button size="sm" className="!w-auto" onClick={() => approve(v.id)}>승인</Button><Button variant="ghost" size="sm" className="!w-auto text-red-600" onClick={() => reject(v.id)}>반려</Button></>
              : <Badge tone={v.status === 'approved' ? 'green' : 'gray'}>{v.status === 'approved' ? '승인됨' : '반려'}</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ───────── 럭키드로우
function Draws({ e }: { e: EventRow }) {
  const q = useAsync<DrawRow[]>(async () => { const { data, error } = await supabase.from('draws').select('*').eq('event_id', e.id).order('created_at'); if (error) throw error; return data as DrawRow[] }, [e.id])
  const counts = useAsync<Record<string, number>>(async () => {
    const { data, error } = await supabase.from('draw_entries').select('draw_id, draws!inner(event_id)').eq('draws.event_id', e.id); if (error) throw error
    const m: Record<string, number> = {}; for (const r of data as any[]) m[r.draw_id] = (m[r.draw_id] ?? 0) + 1; return m
  }, [e.id])
  useEffect(() => { const i = setInterval(counts.reload, 15000); return () => clearInterval(i) }, [counts.reload])
  const [f, setF] = useState({ title: '', prize: '', description: '', winners_count: 1, require_stamp: false, draw_at: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const [winners, setWinners] = useState<Record<string, { name: string; phone: string }[]>>({})
  async function add(ev: React.FormEvent) {
    ev.preventDefault(); if (!f.title.trim()) return
    const { error } = await supabase.from('draws').insert({ event_id: e.id, title: f.title.trim(), prize: f.prize || null, description: f.description || null, winners_count: Math.max(1, +f.winners_count || 1), require_stamp: f.require_stamp, draw_at: f.draw_at ? fromLocal(f.draw_at) : null, status: 'open' })
    if (error) { setMsg(error.message); return }
    setF({ title: '', prize: '', description: '', winners_count: 1, require_stamp: false, draw_at: '' }); q.reload()
  }
  async function pick(d: DrawRow) {
    if (!confirm(`'${d.title}' 추첨을 실행할까요? ${d.winners_count}명을 무작위로 뽑아요. (다시 실행하면 결과가 바뀌어요)`)) return
    const { data, error } = await supabase.rpc('admin_draw_pick', { p_draw: d.id })
    if (error) { setMsg(error.message); return }
    setWinners({ ...winners, [d.id]: data }); q.reload()
  }
  async function showWinners(d: DrawRow) {
    const { data } = await supabase.from('draw_entries').select('name,phone').eq('draw_id', d.id).eq('won', true)
    setWinners({ ...winners, [d.id]: (data ?? []) as any })
  }
  async function setStatus(d: DrawRow, status: DrawRow['status']) { await supabase.from('draws').update({ status }).eq('id', d.id); q.reload() }
  async function remove(d: DrawRow) { if (!confirm('삭제할까요? 응모 내역도 같이 지워져요.')) return; await supabase.from('draws').delete().eq('id', d.id); q.reload() }
  return (
    <Card>
      <h3 className="mb-1 font-bold">럭키드로우 {q.data ? `(${q.data.length})` : ''}</h3>
      <p className="mb-3 text-xs text-gray-500">손님은 행사 홈 → 럭키드로우에서 이름·휴대폰으로 응모해요. 추첨은 여기서 버튼 한 번. 당첨자 이름·번호는 기획자만 보고, 손님 화면엔 가려서 나가요.</p>
      <form onSubmit={add} className="mb-4 grid gap-3 rounded-xl bg-gray-50 p-4 md:grid-cols-4">
        <div className="md:col-span-2"><Field label="제목"><Input value={f.title} onChange={x => setF({ ...f, title: x.target.value })} placeholder="예: 크리스마스 럭키드로우" /></Field></div>
        <Field label="경품"><Input value={f.prize} onChange={x => setF({ ...f, prize: x.target.value })} placeholder="예: 에어팟" /></Field>
        <Field label="당첨 인원"><Input type="number" min={1} value={f.winners_count} onChange={x => setF({ ...f, winners_count: +x.target.value })} /></Field>
        <div className="md:col-span-2"><Field label="설명 (선택)"><Input value={f.description} onChange={x => setF({ ...f, description: x.target.value })} placeholder="예: 당첨자는 17시 메인 무대에서 발표" /></Field></div>
        <Field label="응모 마감·추첨 시각 (선택)"><Input type="datetime-local" value={f.draw_at} onChange={x => setF({ ...f, draw_at: x.target.value })} /></Field>
        <label className="flex items-center gap-2 pb-2 text-sm md:mt-6"><input type="checkbox" checked={f.require_stamp} onChange={x => setF({ ...f, require_stamp: x.target.checked })} /> 스탬프 완주자만</label>
        <div className="md:col-span-4"><Button type="submit" className="!w-auto px-6">추첨 만들기</Button></div>
      </form>
      {msg && <div className="mb-3"><Alert kind="error">{msg}</Alert></div>}
      {q.loading && <Spinner />}
      {q.data?.length === 0 && <Empty>추첨이 없어요.</Empty>}
      <ul className="space-y-3">
        {q.data?.map(d => (
          <li key={d.id} className="rounded-xl border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={d.status === 'open' ? 'green' : d.status === 'drawn' ? 'blue' : 'gray'}>{{ draft: '숨김', open: '응모 중', closed: '마감', drawn: '추첨 완료' }[d.status]}</Badge>
              <div className="min-w-0 flex-1"><div className="font-semibold">{d.title}{d.prize ? ` · ${d.prize} × ${d.winners_count}` : ''}</div><div className="text-xs text-gray-500">응모 {counts.data?.[d.id] ?? 0}명{d.draw_at ? ` · ${fmtDateTime(d.draw_at)}` : ''}{d.require_stamp ? ' · 완주자만' : ''}</div></div>
              {d.status === 'open' && <Button variant="secondary" size="sm" className="!w-auto" onClick={() => setStatus(d, 'closed')}>마감</Button>}
              {d.status === 'closed' && <Button variant="secondary" size="sm" className="!w-auto" onClick={() => setStatus(d, 'open')}>다시 열기</Button>}
              {d.status !== 'drawn' ? <Button size="sm" className="!w-auto" onClick={() => pick(d)}>추첨 실행</Button> : <Button variant="secondary" size="sm" className="!w-auto" onClick={() => winners[d.id] ? setWinners({ ...winners, [d.id]: undefined as any }) : showWinners(d)}>당첨자 보기</Button>}
              <Button variant="ghost" size="sm" className="!w-auto text-red-600" onClick={() => remove(d)}>삭제</Button>
            </div>
            {winners[d.id] && (
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">{winners[d.id].map((w, i) => <li key={i} className="rounded-lg bg-amber-50 px-3 py-1 ring-1 ring-amber-200">{w.name} · <a href={`tel:${w.phone}`} className="underline">{w.phone}</a></li>)}</ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ───────── 만족도 설문
const DEFAULT_Q: SurveyQuestion[] = [
  { id: 'q1', type: 'rating', label: '오늘 행사, 전체적으로 어떠셨어요?' },
  { id: 'q2', type: 'choice', label: '가장 좋았던 건?', options: ['마켓·셀러', '먹거리', '공연', '체험 부스', '분위기'] },
  { id: 'q3', type: 'choice', label: '다음에 또 오실 건가요?', options: ['꼭 올게요', '아마도', '글쎄요'] },
  { id: 'q4', type: 'text', label: '아쉬웠던 점이나 바라는 점이 있다면' },
  // 표준 4문항 — 데이터 리포트의 '외지 방문 비율·연령·동반·유입 경로' 가 여기서 나온다. 라벨의 키워드(어디서·연령·누구와·알게)로 리포트가 찾으니 바꾸지 말 것
  { id: 'q_res', type: 'choice', label: '어디서 오셨어요?', options: ['시내(관내)', '도내 다른 시·군', '수도권', '그 외 지역'] },
  { id: 'q_age', type: 'choice', label: '연령대', options: ['10대', '20대', '30대', '40대', '50대 이상'] },
  { id: 'q_with', type: 'choice', label: '누구와 오셨어요?', options: ['가족(아이 동반)', '친구', '연인', '혼자', '단체'] },
  { id: 'q_via', type: 'choice', label: '어떻게 알게 되셨어요?', options: ['현수막·포스터', 'SNS', '지인', '뉴스·블로그', '지나가다'] },
]
function SurveyEditor({ e }: { e: EventRow }) {
  const q = useAsync<{ enabled: boolean; title: string; questions: SurveyQuestion[]; thanks: string | null } | null>(async () => { const { data, error } = await supabase.from('surveys').select('*').eq('event_id', e.id).maybeSingle(); if (error) throw error; return data }, [e.id])
  const sum = useAsync<any>(async () => { const { data, error } = await supabase.rpc('admin_survey_summary', { p_event: e.id }); if (error) throw error; return data }, [e.id])
  const [f, setF] = useState<{ enabled: boolean; title: string; questions: SurveyQuestion[]; thanks: string } | null>(null)
  useEffect(() => { if (!q.loading && !f) setF(q.data ? { enabled: q.data.enabled, title: q.data.title, questions: q.data.questions, thanks: q.data.thanks ?? '' } : { enabled: false, title: '오늘 행사, 어떠셨어요?', questions: DEFAULT_Q, thanks: '' }) }, [q.loading, q.data]) // eslint-disable-line
  const [msg, setMsg] = useState<string | null>(null)
  if (!f) return <Card><Spinner /></Card>
  async function save() {
    const { error } = await supabase.from('surveys').upsert({ event_id: e.id, enabled: f!.enabled, title: f!.title, questions: f!.questions, thanks: f!.thanks || null, updated_at: new Date().toISOString() })
    setMsg(error ? error.message : '저장했어요.'); sum.reload()
  }
  const setQ = (i: number, patch: Partial<SurveyQuestion>) => setF({ ...f, questions: f.questions.map((x, j) => j === i ? { ...x, ...patch } : x) })
  const link = `${PUBLIC_BASE_URL}/e/${e.slug}/survey`
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 font-bold">만족도 설문 {sum.data ? <Badge tone="blue">응답 {sum.data.responses}</Badge> : null}</h3>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.enabled} onChange={x => setF({ ...f, enabled: x.target.checked })} /> 설문 받기</label>
      </div>
      <p className="mb-3 text-xs text-gray-500">행사 홈에 카드로 떠요. 끝난 뒤 알림톡·문자로 보낼 링크: <code>{link}</code></p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="제목"><Input value={f.title} onChange={x => setF({ ...f, title: x.target.value })} /></Field>
        <Field label="제출 후 인사말"><Input value={f.thanks} onChange={x => setF({ ...f, thanks: x.target.value })} placeholder="답변 고마워요. 다음 행사에 꼭 반영할게요." /></Field>
      </div>
      <ul className="mt-3 space-y-2">
        {f.questions.map((qq, i) => (
          <li key={qq.id} className="grid gap-2 rounded-xl bg-gray-50 p-3 md:grid-cols-[110px_1fr_auto]">
            <select value={qq.type} onChange={x => setQ(i, { type: x.target.value as any, options: x.target.value === 'choice' ? (qq.options ?? ['좋았어요', '보통', '아쉬워요']) : undefined })} className="h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm"><option value="rating">별점 5점</option><option value="choice">선택</option><option value="text">주관식</option></select>
            <div className="space-y-1.5">
              <input value={qq.label} onChange={x => setQ(i, { label: x.target.value })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" placeholder="질문" />
              {qq.type === 'choice' && <input value={(qq.options ?? []).join(', ')} onChange={x => setQ(i, { options: x.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" placeholder="보기를 쉼표로 (예: 마켓, 공연, 먹거리)" />}
              {sum.data?.questions?.find((s: any) => s.id === qq.id) && <Summary s={sum.data.questions.find((s: any) => s.id === qq.id)} />}
            </div>
            <Button variant="ghost" size="sm" className="!w-auto text-red-600" onClick={() => setF({ ...f, questions: f.questions.filter((_, j) => j !== i) })}>삭제</Button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" className="!w-auto" onClick={() => setF({ ...f, questions: [...f.questions, { id: `q${Date.now().toString(36)}`, type: 'rating', label: '' }] })}>질문 추가</Button>
        <Button size="sm" className="!w-auto px-5" onClick={save}>저장</Button>
      </div>
      {msg && <div className="mt-3"><Alert kind={msg.includes('했어요') ? 'success' : 'error'}>{msg}</Alert></div>}
    </Card>
  )
}
function Summary({ s }: { s: any }) {
  if (s.type === 'text') return s.texts?.length ? <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-gray-600">{s.texts.map((t: string, i: number) => <li key={i}>· {t}</li>)}</ul> : null
  const dist: Record<string, number> = s.dist ?? {}; const total = Object.values(dist).reduce((a, b) => a + b, 0)
  if (!total) return null
  return <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">{s.type === 'rating' && <b>평균 {s.avg}점</b>}{Object.entries(dist).sort().map(([k, v]) => <span key={k} className="rounded bg-white px-1.5 py-0.5 ring-1 ring-gray-200">{s.type === 'rating' ? `${k}점` : k} {v}</span>)}</div>
}
