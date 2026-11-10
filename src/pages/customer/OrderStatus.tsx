import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { rpc, DEMO } from '../../lib/supabase'
import { useAsync, fmtTime } from '../../lib/util'
import { Alert, Button, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import DemoBanner from '../../components/DemoBanner'
import type { OrderPublic } from '../../lib/types'
import { rememberOrder, won } from '../../lib/orders'

/**
 * 내 주문 — 주문번호와 지금 단계. 준비되면 화면 전체가 '받으러 오세요' 로 바뀌고 진동한다.
 * 화면이 보이는 동안 5초마다 다시 읽는다 (알림톡은 다음 단계).
 */
const STEPS = [['placed', '주문 확인'], ['accepted', '준비 중'], ['ready', '준비 완료']] as const

export default function OrderStatus() {
  const { token = '' } = useParams()
  const { data: o, error, loading, reload } = useAsync<OrderPublic | null>(() => rpc('get_order', { p_token: token }), [token])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, DEMO ? 3000 : 5000)
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [token]) // eslint-disable-line
  // 다른 기기·링크로 열어도 '내 대기' 에 잡히게
  useEffect(() => { if (o) rememberOrder(token) }, [!!o]) // eslint-disable-line
  // 준비 완료로 바뀌는 순간 한 번 진동
  const prev = useRef<string | null>(null)
  useEffect(() => {
    if (o?.status === 'ready' && prev.current && prev.current !== 'ready') { try { navigator.vibrate?.([300, 150, 300]) } catch { /* 진동 없는 기기 */ } }
    if (o) prev.current = o.status
  }, [o?.status]) // eslint-disable-line

  if (loading && !o) return <Spinner />
  if (!o) return <div className="p-6"><Alert kind="error">{error ?? '주문을 찾을 수 없습니다.'}</Alert></div>
  const slug = o.event.slug
  const ready = o.status === 'ready', done = o.status === 'picked_up', cancelled = o.status === 'cancelled'
  const stepAt = STEPS.findIndex(s => s[0] === o.status)

  async function cancel() {
    setErr(null); setBusy(true)
    try { await rpc('cancel_order', { p_token: token }); setAsk(false); reload() }
    catch (e: any) { setErr(e.message); setAsk(false); reload() } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <DemoBanner />
      <div className={`px-5 pb-7 pt-6 ${ready ? 'bg-red-600 text-white' : cancelled ? 'bg-gray-100 text-gray-500' : done ? 'bg-gray-100 text-gray-900' : 'bg-blue-700 text-white'}`}>
        <Link to={`/e/${slug}/p/${o.place.id}`} className="text-sm font-semibold underline-offset-2 opacity-90">{o.place.name} ›</Link>
        <div className="mt-3 text-sm font-semibold opacity-90">주문번호</div>
        <div className="text-7xl font-bold leading-none tabular-nums">{o.order_no}</div>
        <div className="mt-4 text-2xl font-bold leading-snug">
          {ready ? '준비됐어요. 받으러 오세요' : done ? '받았어요. 맛있게 드세요' : cancelled ? '주문이 취소됐어요' : o.status === 'accepted' ? '만들고 있어요' : '가게에서 주문을 확인하고 있어요'}
        </div>
        <div className="mt-1 text-[15px] opacity-90">
          {ready ? `가게에 주문번호 ${o.order_no}번을 보여 주세요${o.pay_status === 'unpaid' ? ' · 결제는 가게에서' : ''}`
            : cancelled ? (o.cancel_reason ?? '')
            : done ? `${o.picked_at ? fmtTime(o.picked_at) : ''} 수령`
            : o.ahead ? `앞에 ${o.ahead}건이 있어요. 준비되면 이 화면이 바뀌어요` : '준비되면 이 화면이 바뀌어요'}
        </div>
      </div>

      {!cancelled && !done && (
        <ol className="flex items-center px-5 pt-5">
          {STEPS.map(([k, label], i) => (
            <li key={k} className="flex flex-1 items-center last:flex-none">
              <span className="flex flex-col items-center">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i <= stepAt ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'}`}>{i + 1}</span>
                <span className={`mt-1 whitespace-nowrap text-xs font-semibold ${i <= stepAt ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
              </span>
              {i < STEPS.length - 1 && <span className={`mx-2 mb-5 h-0.5 flex-1 ${i < stepAt ? 'bg-gray-900' : 'bg-gray-200'}`} />}
            </li>
          ))}
        </ol>
      )}

      <div className="px-5 pt-6">
        <h2 className="text-sm font-semibold text-gray-500">주문 내역 · {fmtTime(o.created_at)}</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {o.items.map(l => <li key={l.name} className="flex justify-between gap-3 py-2.5 text-[16px]"><span className="text-gray-900">{l.name} <span className="font-bold tabular-nums">× {l.qty}</span></span><span className="shrink-0 tabular-nums text-gray-600">{won(l.price * l.qty)}</span></li>)}
          <li className="flex justify-between py-3 text-[17px] font-bold text-gray-900"><span>합계</span><span className="tabular-nums">{won(o.total)}</span></li>
        </ul>
        {o.note && <p className="mt-1 text-sm text-gray-600">남긴 말: {o.note}</p>}
        {!cancelled && <p className="mt-2 text-sm text-gray-600">{o.pay_status === 'paid' ? '결제 완료' : '결제는 받을 때 가게에서 해요.'}</p>}

        {err && <div className="mt-4"><Alert kind="error">{err}</Alert></div>}
        <div className="mt-6 space-y-2">
          {!cancelled && !done && <Link to={`/e/${slug}/map?to=${o.place.id}`} className="flex h-12 items-center justify-center rounded-xl text-[15px] font-semibold text-gray-900 ring-1 ring-gray-300 active:bg-gray-50">가게 가는 길 보기</Link>}
          {o.can_cancel && !ask && <button type="button" onClick={() => setAsk(true)} className="block w-full py-3 text-center text-sm font-semibold text-gray-500 underline">주문 취소</button>}
          {o.can_cancel && ask && (
            <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-200">
              <div className="text-[15px] font-bold text-gray-900">주문을 취소할까요?</div>
              <div className="mt-3 flex gap-2"><Button variant="secondary" onClick={() => setAsk(false)}>아니요</Button><Button variant="danger" loading={busy} onClick={cancel}>취소할게요</Button></div>
            </div>
          )}
          {!o.can_cancel && !cancelled && !done && !ready && <p className="text-center text-xs text-gray-500">준비를 시작한 뒤에는 가게에 직접 말씀해 주세요.</p>}
          {(cancelled || done) && <Link to={`/e/${slug}/p/${o.place.id}`} className="flex h-12 items-center justify-center rounded-xl bg-gray-900 text-[15px] font-bold text-white">다시 주문하기</Link>}
        </div>
      </div>
      <CustomerNav slug={slug} active="my" />
    </div>
  )
}
