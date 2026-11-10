import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { rpc, DEMO, PUBLIC_BASE_URL } from '../../lib/supabase'
import { useAsync, fmtTime } from '../../lib/util'
import { Alert, Button, Input, Spinner } from '../../components/ui'
import DemoBanner from '../../components/DemoBanner'
import { CROWD_LABEL, PLACE_KIND_LABEL, type Crowd, type PlaceKind } from '../../lib/types'
import { won } from '../../lib/orders'

/**
 * 주최 화면 — 주최 담당자가 링크 하나로 여는 한 장 (로그인 없음).
 * 위: 지금 숫자 / 가운데: 긴급 공지 올리기·내리기 / 아래: 장소 혼잡도 누르기. 세팅(지도·부스·메뉴)은 플릿이 한다.
 */
type Board = {
  event: { name: string; slug: string; status: string }
  stats: { waiting: number; served: number; visits: number; orders: number; sales: number }
  notices: { id: string; title: string; body: string | null; urgent: boolean; publish_at: string }[]
  places: { id: string; name: string; kind: PlaceKind; crowd: Crowd | null; crowd_updated_at: string | null }[]
}
const QUICK = ['주차장이 만차예요', '잠시 운영을 멈춰요', '미아를 찾고 있어요', '오늘 운영을 마쳐요']

export default function HostBoard() {
  const { token = '' } = useParams()
  const { data, error, loading, reload } = useAsync<Board>(() => rpc('host_board', { p_token: token }), [token])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [urgent, setUrgent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, DEMO ? 5000 : 15000)
    return () => clearInterval(iv)
  }, [token]) // eslint-disable-line
  const call = async (fn: string, args: Record<string, unknown>) => { setErr(null); try { await rpc(fn, { p_token: token, ...args }) } catch (e: any) { setErr(e.message) } finally { reload() } }
  async function post(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await rpc('host_post_notice', { p_token: token, p_title: title, p_body: body || null, p_urgent: urgent }); setTitle(''); setBody(''); setSent(true); setTimeout(() => setSent(false), 2500) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false); reload() }
  }

  if (loading && !data) return <Spinner />
  if (!data) return <div className="p-6"><Alert kind="error">{error ?? '주최 화면을 열 수 없어요.'}</Alert></div>
  const s = data.stats
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-16">
      <DemoBanner />
      <header className="px-4 pb-2 pt-4">
        <div className="text-xs text-gray-500">주최 화면 · {data.event.status === 'open' ? '운영 중' : data.event.status === 'draft' ? '준비 중' : '종료'}</div>
        <h1 className="text-[22px] font-bold leading-tight text-gray-900">{data.event.name}</h1>
        <a href={`${PUBLIC_BASE_URL}/e/${data.event.slug}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-gray-600 underline">방문객 화면 보기</a>
      </header>

      <div className="grid grid-cols-3 gap-2 px-4 pt-2">
        <Stat label="지금 대기" value={`${s.waiting}팀`} />
        <Stat label="오늘 방문" value={`${s.visits.toLocaleString('ko-KR')}`} sub="화면을 연 횟수" />
        <Stat label="오늘 주문" value={`${s.orders}건`} sub={s.sales ? won(s.sales) : undefined} />
      </div>
      <p className="px-4 pt-1 text-xs text-gray-500">오늘 체험 이용 {s.served}팀 · 15초마다 새로 읽어요</p>

      <section className="px-4 pt-7">
        <h2 className="text-[17px] font-bold text-gray-900">공지 올리기</h2>
        <p className="text-xs text-gray-500">올리는 즉시 방문객 화면 맨 위에 떠요.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK.map(q => <button key={q} type="button" onClick={() => setTitle(q)} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 ring-1 ring-gray-300 active:bg-gray-50">{q}</button>)}
        </div>
        <form onSubmit={post} className="mt-3 space-y-2">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목 (예: 주차장이 만차예요)" maxLength={60} required />
          <Input value={body} onChange={e => setBody(e.target.value)} placeholder="덧붙일 말 (선택)" maxLength={300} />
          <label className="flex items-center gap-2.5 text-sm text-gray-700"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="h-5 w-5 rounded" />긴급으로 올리기 (빨간 띠로 맨 위에)</label>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy} disabled={title.trim().length < 2}>{sent ? '올렸어요' : '공지 올리기'}</Button>
        </form>

        {data.notices.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-200">
            {data.notices.map(n => (
              <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-gray-900">{n.urgent && <span className="mr-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">긴급</span>}{n.title}</div>
                  <div className="truncate text-xs text-gray-500">{fmtTime(n.publish_at)}{n.body ? ` · ${n.body}` : ''}</div>
                </div>
                <button type="button" onClick={() => call('host_end_notice', { p_notice: n.id })} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 active:bg-gray-50">내리기</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.places.length > 0 && (
        <section className="px-4 pt-7">
          <h2 className="text-[17px] font-bold text-gray-900">혼잡도</h2>
          <p className="text-xs text-gray-500">누르면 방문객 지도에 바로 보여요. 같은 걸 한 번 더 누르면 지워져요.</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {[...data.places].sort((a, b) => Number(b.kind === 'parking') - Number(a.kind === 'parking')).map(p => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><div className="truncate text-[16px] font-bold text-gray-900">{p.name}</div><div className="text-xs text-gray-500">{PLACE_KIND_LABEL[p.kind]}{p.crowd && p.crowd_updated_at ? ` · ${fmtTime(p.crowd_updated_at)}에 누름` : ''}</div></div>
                <div className="flex shrink-0 rounded-full bg-gray-100 p-0.5 text-sm font-bold">
                  {(['low', 'mid', 'high'] as Crowd[]).map(c => (
                    <button key={c} type="button" onClick={() => call('host_set_crowd', { p_place: p.id, p_crowd: p.crowd === c ? null : c })} aria-pressed={p.crowd === c}
                      className={`rounded-full px-3.5 py-2 ${p.crowd === c ? (c === 'low' ? 'bg-blue-700 text-white' : c === 'mid' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white') : 'text-gray-500'}`}>{p.kind === 'parking' && c === 'high' ? '만차' : CROWD_LABEL[c]}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="px-4 pt-8 text-center text-xs text-gray-400">지도·부스·메뉴를 바꾸려면 플릿에 알려 주세요 · 운영 플릿 (FLIT)</p>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl bg-gray-50 px-3 py-3 ring-1 ring-gray-200"><div className="text-xs font-semibold text-gray-500">{label}</div><div className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{value}</div>{sub && <div className="truncate text-[11px] text-gray-500">{sub}</div>}</div>
}
