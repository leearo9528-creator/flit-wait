import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { cachedRpc, rpc } from '../../lib/supabase'
import { useAsync, fmtPhone, me } from '../../lib/util'
import { Alert, Button, Field, Input, Spinner } from '../../components/ui'
import Who from '../../components/Who'
import { useCustomer } from '../../lib/customer'
import type { EventGuide } from '../../lib/types'
import { cart, cartLines, cartTotal, cartCount, rememberOrder, won, type Cart } from '../../lib/orders'

/** 주문 확인 — 담은 것 · 받는 사람 · 결제 방법을 한 화면에서 보고 주문을 넣는다. (1단계: 결제는 받을 때 가게에서) */
export default function OrderCheckout() {
  const { slug = '', placeId = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading } = useAsync<EventGuide>(() => cachedRpc('event_guide', slug), [slug])
  const [bag, setBag] = useState<Cart>(() => cart.get(placeId))
  const [name, setName] = useState(() => me.get().name)
  const [phone, setPhone] = useState(() => me.get().phone)
  const [note, setNote] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cust = useCustomer()
  const filled = useRef(false)
  useEffect(() => {
    const p = cust.profile
    if (filled.current || !cust.loggedIn) return
    filled.current = true
    if (p?.phone) { setName(p.name); setPhone(fmtPhone(p.phone)) }
    else if (!name && cust.nameHint) setName(cust.nameHint.slice(0, 20))
  }, [cust.loggedIn, cust.profile]) // eslint-disable-line

  if (loading && !data) return <Spinner />
  const p = data?.places.find(x => x.id === placeId)
  if (!data?.event || !p) return <div className="p-6"><Alert kind="error">{error ?? '가게를 찾을 수 없습니다.'}</Alert></div>
  const back = `/e/${slug}/p/${p.id}`
  const lines = cartLines(p.menu ?? [], bag)
  const total = cartTotal(lines)
  const dropped = Object.keys(bag).filter(k => bag[k] > 0 && !lines.some(l => l.name === k))   // 그새 품절·삭제된 메뉴
  const put = (n: string, d: number) => setBag(prev => { const q = Math.max(0, Math.min(20, (prev[n] ?? 0) + d)); const next = { ...prev, [n]: q }; if (!q) delete next[n]; cart.set(p.id, next); return next })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      const r = await rpc<{ token: string }>('place_order', { p_place: p!.id, p_name: name, p_phone: phone, p_items: lines.map(l => ({ name: l.name, qty: l.qty })), p_consent: consent, p_note: note || null })
      me.set({ name: name.trim(), phone, agreed: true })
      rememberOrder(r.token)
      cart.clear(p!.id)
      nav(`/o/${r.token}`, { replace: true })
    } catch (e: any) { setErr(e.message ?? '주문하지 못했어요. 다시 시도해 주세요.') } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 px-2 py-2 backdrop-blur">
        <Link to={back} aria-label="뒤로" className="flex h-10 w-10 items-center justify-center text-2xl text-gray-900">‹</Link>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-gray-900">{p.name}</h1>
      </header>

      {lines.length === 0
        ? <div className="px-4 pt-10 text-center"><p className="text-[15px] text-gray-600">담은 메뉴가 없어요.</p><Link to={back} className="mt-4 inline-block text-sm font-semibold underline">메뉴 보러 가기</Link></div>
        : (
        <form onSubmit={submit} className="space-y-6 px-4 pt-2">
          {!p.order_open || p.order_paused ? <Alert kind="warn">지금은 이 가게 주문이 잠시 멈춰 있어요.</Alert> : null}
          {dropped.length > 0 && <Alert kind="warn">{dropped.join(', ')} — 품절됐거나 메뉴에서 빠져서 뺐어요.</Alert>}
          <ul className="divide-y divide-gray-100">
            {lines.map(l => (
              <li key={l.name} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><div className="text-[16px] font-semibold text-gray-900">{l.name}</div><div className="text-sm tabular-nums text-gray-600">{won(l.price * l.qty)}</div></div>
                <div className="flex shrink-0 items-center rounded-full ring-1 ring-gray-300">
                  <button type="button" onClick={() => put(l.name, -1)} aria-label={`${l.name} 빼기`} className="flex h-10 w-10 items-center justify-center text-xl active:bg-gray-100">−</button>
                  <span className="w-6 text-center text-[15px] font-bold tabular-nums">{l.qty}</span>
                  <button type="button" onClick={() => put(l.name, 1)} aria-label={`${l.name} 더하기`} className="flex h-10 w-10 items-center justify-center text-xl active:bg-gray-100">+</button>
                </div>
              </li>
            ))}
            <li className="flex items-baseline justify-between py-4"><span className="text-[15px] font-semibold text-gray-600">합계 {cartCount(lines)}개</span><span className="text-2xl font-bold tabular-nums text-gray-900">{won(total)}</span></li>
          </ul>

          <div className="rounded-2xl bg-gray-50 px-4 py-3.5 ring-1 ring-gray-200">
            <div className="text-[15px] font-bold text-gray-900">결제는 받을 때 가게에서</div>
            <div className="mt-0.5 text-sm text-gray-600">준비되면 이 화면이 바뀌어요. 주문번호를 보여 주고 결제한 뒤 받으세요.</div>
          </div>

          <div className="space-y-3">
            <Who name={name} phone={phone} setName={setName} setPhone={setPhone} consent={consent} setConsent={setConsent} cust={cust} phoneHint="가게에서 주문을 확인할 때만 써요"
              privacy="주문 확인을 위해 이름·휴대폰번호를 수집·이용해요. 가게와 운영사(플릿)만 보고, 행사가 끝난 뒤 보존 기간이 지나면 지워요." />
            <Field label="가게에 남길 말 (선택)"><Input value={note} onChange={e => setNote(e.target.value)} maxLength={80} placeholder="예: 덜 맵게" /></Field>
          </div>

          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" size="lg" loading={busy} disabled={!consent || !p.order_open || !!p.order_paused} className="w-full">{won(total)} 주문하기</Button>
        </form>
      )}
    </div>
  )
}
