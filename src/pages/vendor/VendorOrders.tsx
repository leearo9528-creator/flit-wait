import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { rpc, DEMO } from '../../lib/supabase'
import { useAsync, fmtTime, minutesSince, useTick } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import DemoBanner from '../../components/DemoBanner'
import type { VendorBoard, VendorOrder } from '../../lib/types'
import { won } from '../../lib/orders'

/**
 * 사장님 주문 화면 — 가게마다 비밀 링크 하나(/vo/<token>). 로그인 없이 본인 폰으로 쓴다.
 * 새 주문 → [접수] → [준비 완료](손님 화면이 '받으러 오세요' 로 바뀜) → [전달 완료]. 메뉴 탭에서 품절, 위에서 주문 잠시 멈춤.
 * 4초마다 다시 읽고, 새 주문이 오면 소리·진동으로 알린다 (소리는 화면을 한 번 눌러야 난다 — 브라우저 규칙).
 */
const REASONS = ['품절', '재료 소진', '영업 종료', '가게 사정']

export default function VendorOrders() {
  const { token = '' } = useParams()
  const { data, error, loading, reload } = useAsync<VendorBoard>(() => rpc('vendor_board', { p_token: token }), [token])
  const [tab, setTab] = useState<'orders' | 'menu' | 'done'>('orders')
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [sound, setSound] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  useTick(30000)
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, DEMO ? 3000 : 4000)
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [token]) // eslint-disable-line

  // 새 주문 알림 — 처음 읽은 것은 건너뛰고, 그 뒤 새로 생긴 'placed' 만
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!data) return
    const placed = data.orders.filter(o => o.status === 'placed').map(o => o.id)
    if (seen.current && placed.some(id => !seen.current!.has(id))) beep()
    seen.current = new Set([...(seen.current ?? []), ...data.orders.map(o => o.id)])
  }, [data]) // eslint-disable-line
  function beep() {
    try { navigator.vibrate?.([250, 120, 250]) } catch { /* 진동 없는 기기 */ }
    const ac = audio.current; if (!ac) return
    for (const [i, f] of [880, 1175, 880].entries()) {
      const o = ac.createOscillator(), g = ac.createGain()
      o.frequency.value = f; o.connect(g); g.connect(ac.destination)
      const t = ac.currentTime + i * 0.22
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      o.start(t); o.stop(t + 0.21)
    }
  }
  async function soundOn() {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      audio.current = audio.current ?? new AC(); await audio.current.resume(); setSound(true); beep()
      await (navigator as any).wakeLock?.request?.('screen')   // 화면이 꺼지지 않게 (되는 기기만)
    } catch { /* 소리를 못 쓰는 기기 — 진동만 */ setSound(true) }
  }

  async function act(o: VendorOrder, action: string, reason?: string) {
    setErr(null); setBusyId(o.id)
    try { await rpc('vendor_update_order', { p_token: token, p_order: o.id, p_action: action, p_reason: reason ?? null }); setCancelId(null) }
    catch (e: any) { setErr(e.message) } finally { setBusyId(null); reload() }
  }
  const call = async (fn: string, args: Record<string, unknown>) => { setErr(null); try { await rpc(fn, { p_token: token, ...args }) } catch (e: any) { setErr(e.message) } finally { reload() } }

  if (loading && !data) return <Spinner />
  if (!data) return <div className="p-6"><Alert kind="error">{error ?? '주문 화면을 열 수 없어요.'}</Alert></div>
  const active = data.orders.filter(o => o.status === 'placed' || o.status === 'accepted' || o.status === 'ready')
  const fresh = active.filter(o => o.status === 'placed'), making = active.filter(o => o.status === 'accepted'), waiting = active.filter(o => o.status === 'ready')
  const past = data.orders.filter(o => o.status === 'picked_up' || o.status === 'cancelled').reverse()
  const menu = data.place.menu ?? []

  const card = (o: VendorOrder) => (
    <li key={o.id} className={`rounded-2xl p-4 ring-1 ${o.status === 'placed' ? 'bg-blue-50 ring-blue-300' : o.status === 'ready' ? 'bg-gray-50 ring-gray-200' : 'bg-white ring-gray-300'}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-gray-900">{o.order_no}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] text-gray-700">{o.name}{o.phone_tail ? ` · ${o.phone_tail}` : ''}</span>
        <span className="shrink-0 text-xs tabular-nums text-gray-500">{fmtTime(o.created_at)} · {minutesSince(o.created_at)}분 전</span>
      </div>
      <ul className="mt-2 space-y-0.5">
        {o.items.map(l => <li key={l.name} className="flex justify-between text-[18px] font-semibold text-gray-900"><span>{l.name}</span><span className="tabular-nums">× {l.qty}</span></li>)}
      </ul>
      {o.note && <div className="mt-2 rounded-lg bg-white px-3 py-2 text-[15px] font-semibold text-gray-900 ring-1 ring-gray-300">“{o.note}”</div>}
      <div className="mt-2 flex items-center justify-between text-[15px]">
        <span className="font-bold tabular-nums text-gray-900">{won(o.total)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.pay_status === 'paid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 ring-1 ring-gray-400'}`}>{o.pay_status === 'paid' ? '결제 완료' : '받을 때 결제'}</span>
      </div>
      {cancelId === o.id
        ? <div className="mt-3">
            <div className="text-sm font-semibold text-gray-700">취소 이유를 골라 주세요 (손님 화면에 보여요)</div>
            <div className="mt-2 grid grid-cols-2 gap-2">{REASONS.map(r => <button key={r} type="button" disabled={busyId === o.id} onClick={() => act(o, 'cancel', r)} className="h-12 rounded-xl bg-white text-[15px] font-semibold text-red-700 ring-1 ring-red-300 active:bg-red-50">{r}</button>)}</div>
            <button type="button" onClick={() => setCancelId(null)} className="mt-2 w-full py-2 text-sm font-semibold text-gray-500 underline">취소 안 함</button>
          </div>
        : <div className="mt-3 flex gap-2">
            {o.status === 'placed' && <><Btn onClick={() => act(o, 'accept')} busy={busyId === o.id} main>접수</Btn><Btn onClick={() => setCancelId(o.id)} narrow>취소</Btn></>}
            {o.status === 'accepted' && <><Btn onClick={() => act(o, 'ready')} busy={busyId === o.id} main>준비 완료 · 손님 부르기</Btn><Btn onClick={() => setCancelId(o.id)} narrow>취소</Btn></>}
            {o.status === 'ready' && <><Btn onClick={() => act(o, 'picked')} busy={busyId === o.id} main>전달 완료</Btn><Btn onClick={() => act(o, 'back')} narrow>되돌리기</Btn></>}
          </div>}
    </li>
  )

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-16">
      <DemoBanner />
      <header className="sticky top-0 z-10 bg-white/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-gray-500">{data.event.name}</div>
            <h1 className="truncate text-[19px] font-bold leading-tight text-gray-900">{data.place.name}</h1>
          </div>
          <button type="button" onClick={() => call('vendor_set_paused', { p_paused: !data.paused })} aria-pressed={!data.paused}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ring-1 ${data.paused ? 'bg-red-600 text-white ring-red-600' : 'bg-white text-gray-900 ring-gray-300'}`}>{data.paused ? '멈춤 · 다시 받기' : '주문 받는 중'}</button>
        </div>
        <div className="mt-1 text-sm tabular-nums text-gray-600">오늘 전달 {data.stats.count}건 · {won(data.stats.total)}</div>
        <div className="mt-3 flex rounded-full bg-gray-100 p-0.5 text-sm font-semibold">
          {([['orders', `주문 ${active.length}`], ['menu', '메뉴 · 품절'], ['done', `지난 주문 ${past.length}`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-full py-2 tabular-nums ${tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{label}</button>
          ))}
        </div>
      </header>

      <div className="space-y-3 px-4 pt-2">
        {!data.enabled && <Alert kind="warn">이 가게는 아직 앱 주문이 꺼져 있어요. 운영사(플릿)에 문의해 주세요.</Alert>}
        {data.paused && <Alert kind="warn">주문을 잠시 멈췄어요. 손님 화면에 '잠시 멈춤' 으로 보여요.</Alert>}
        {!sound && <button type="button" onClick={soundOn} className="flex h-12 w-full items-center justify-center rounded-xl bg-gray-900 text-[15px] font-bold text-white">새 주문 소리 켜기</button>}
        {err && <Alert kind="error">{err}</Alert>}

        {tab === 'orders' && (active.length === 0
          ? <p className="py-20 text-center text-[15px] text-gray-400">들어온 주문이 없어요.<br />이 화면을 켜 두면 새 주문이 바로 떠요.</p>
          : <>
              {fresh.length > 0 && <Sec title={`새 주문 ${fresh.length}`}>{fresh.map(card)}</Sec>}
              {making.length > 0 && <Sec title={`준비 중 ${making.length}`}>{making.map(card)}</Sec>}
              {waiting.length > 0 && <Sec title={`손님 기다리는 중 ${waiting.length}`}>{waiting.map(card)}</Sec>}
            </>)}

        {tab === 'menu' && (
          <ul className="divide-y divide-gray-100">
            {menu.map(m => (
              <li key={m.name} className="flex items-center gap-3 py-3.5">
                <div className="min-w-0 flex-1"><div className={`text-[17px] font-semibold ${m.sold_out ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{m.name}</div><div className="text-sm tabular-nums text-gray-600">{m.price}</div></div>
                <button type="button" onClick={() => call('vendor_set_soldout', { p_name: m.name, p_sold: !m.sold_out })} aria-pressed={!!m.sold_out}
                  className={`h-11 shrink-0 rounded-full px-4 text-sm font-bold ring-1 ${m.sold_out ? 'bg-red-600 text-white ring-red-600' : 'bg-white text-gray-900 ring-gray-300'}`}>{m.sold_out ? '품절 · 다시 팔기' : '판매 중'}</button>
              </li>
            ))}
            {menu.length === 0 && <li className="py-16 text-center text-sm text-gray-400">등록된 메뉴가 없어요. 운영사(플릿)에 문의해 주세요.</li>}
          </ul>
        )}

        {tab === 'done' && (
          <ul className="divide-y divide-gray-100">
            {past.map(o => (
              <li key={o.id} className="flex items-center gap-3 py-3">
                <span className="w-9 shrink-0 text-xl font-bold tabular-nums text-gray-900">{o.order_no}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] text-gray-900">{o.items.map(l => `${l.name} ${l.qty}`).join(', ')}</div>
                  <div className="text-xs text-gray-500">{o.name} · {fmtTime(o.created_at)} · {o.status === 'cancelled' ? `취소 (${o.cancel_reason ?? ''})` : won(o.total)}</div>
                </div>
                <button type="button" onClick={() => act(o, 'back')} className="shrink-0 text-sm font-semibold text-gray-500 underline">되돌리기</button>
              </li>
            ))}
            {past.length === 0 && <li className="py-16 text-center text-sm text-gray-400">아직 끝난 주문이 없어요.</li>}
          </ul>
        )}
      </div>
    </div>
  )
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="pb-2 pt-1 text-sm font-bold text-gray-500">{title}</h2><ul className="space-y-3">{children}</ul></section>
}
function Btn({ children, onClick, busy, main, narrow }: { children: React.ReactNode; onClick: () => void; busy?: boolean; main?: boolean; narrow?: boolean }) {
  return <button type="button" onClick={onClick} disabled={busy}
    className={`h-14 rounded-xl text-[17px] font-bold active:scale-[0.98] disabled:opacity-60 ${main ? 'flex-1 bg-gray-900 text-white' : ''} ${narrow ? 'w-24 bg-white text-gray-700 ring-1 ring-gray-300' : ''}`}>{busy ? '…' : children}</button>
}
