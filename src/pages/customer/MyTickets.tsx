import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { rpc, DEMO } from '../../lib/supabase'
import { LS, fmtDateTime, fmtPhone, STATUS_LABEL } from '../../lib/util'
import { Card, Button, Field, Input, Alert, Badge } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import KakaoStart from '../../components/KakaoStart'
import { useMyTickets } from '../../lib/myTickets'
import { useMyOrders, orderActive, ORDER_LABEL, won } from '../../lib/orders'
import { fmtTime } from '../../lib/util'
import { useCustomer, LOGIN_ENABLED, type Customer } from '../../lib/customer'

interface Row { token: string; booth: string; status: string; ticket_no: number | null; slot_at: string | null; created_at: string; ahead?: number | null; est_wait_min?: number | null }

/** 내 접수·예약 — 이 기기에서 접수한 것 + 이름/전화로 찾기 */
export default function MyTickets() {
  const { slug = '' } = useParams()
  const mine: Row[] = useMyTickets(slug, DEMO ? 6000 : 20000)
  const orders = useMyOrders(slug, DEMO ? 4000 : 10000)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [found, setFound] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cust = useCustomer()
  const [acct, setAcct] = useState<Row[]>([])
  // 로그인했으면 계정에 묶인 접수 내역도 — 다른 폰에서 접수한 것까지 보인다
  useEffect(() => {
    if (!cust.loggedIn || DEMO) { setAcct([]); return }
    rpc<Row[]>('my_tickets', { p_event_slug: slug }).then(setAcct).catch(() => setAcct([]))
  }, [cust.loggedIn, slug])


  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { setFound(await rpc<Row[]>('find_my_tickets', { p_event_slug: slug, p_name: name, p_phone: phone })) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const tone = (s: string) => (({ waiting: 'blue', called: 'amber', checked_in: 'green', done: 'green', no_show: 'red', cancelled: 'gray' } as any)[s] ?? 'gray')
  const List = ({ rows }: { rows: Row[] }) => (
    <div className="space-y-2">
      {rows.map(r => (
        <Link key={r.token} to={`/t/${r.token}`} className="block rounded-xl bg-white p-4 ring-1 ring-gray-200 active:bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="font-bold">{r.booth}</div>
            <Badge tone={tone(r.status)}>{r.slot_at && r.status === 'waiting' ? '예약 완료' : STATUS_LABEL[r.status] ?? r.status}</Badge>
          </div>
          <div className="mt-1 text-sm text-gray-500">{r.slot_at ? `예약 ${fmtDateTime(r.slot_at)}` : r.status === 'called' ? `대기번호 ${r.ticket_no}번 · 지금 입장하세요` : r.status === 'waiting' && r.ahead != null ? `대기번호 ${r.ticket_no}번 · ${r.ahead > 0 ? `앞 ${r.ahead}팀${r.est_wait_min ? ` · 약 ${r.est_wait_min}분` : ''}` : '곧 차례예요'}` : `대기번호 ${r.ticket_no}번 · ${fmtDateTime(r.created_at)} 접수`}</div>
        </Link>
      ))}
    </div>
  )

  const all = [...mine, ...acct.filter(a => !mine.some(m => m.token === a.token))]
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-gray-50 px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-bold">내 것</h1>
      {orders.length > 0 && (
        <div className="mb-4 space-y-2">
          {orders.map(o => (
            <Link key={o.token} to={`/o/${o.token}`} className={`block rounded-xl p-4 ring-1 active:opacity-90 ${o.status === 'ready' ? 'bg-red-600 text-white ring-red-600' : 'bg-white ring-gray-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate font-bold">{o.place.name}</div>
                <span className={`shrink-0 text-sm font-bold ${o.status === 'ready' ? '' : orderActive(o) ? 'text-blue-700' : 'text-gray-500'}`}>{o.status === 'ready' ? '받으러 오세요' : ORDER_LABEL[o.status]}</span>
              </div>
              <div className={`mt-1 truncate text-sm ${o.status === 'ready' ? 'opacity-90' : 'text-gray-500'}`}>주문번호 {o.order_no}번 · {o.items.map(l => `${l.name} ${l.qty}`).join(', ')} · {won(o.total)} · {fmtTime(o.created_at)}</div>
            </Link>
          ))}
        </div>
      )}
      {all.length > 0 ? <List rows={all} /> : orders.length > 0 ? null : <Card><p className="text-sm text-gray-500">아직 줄 선 곳이나 주문이 없어요. 다른 폰으로 접수했다면 아래에서 찾을 수 있어요.</p></Card>}
      {LOGIN_ENABLED && cust.ready && <div className="mt-5">{cust.loggedIn ? <Account cust={cust} /> : <Card><KakaoStart cust={cust} note="이름·번호를 다시 안 적어도 되고, 폰을 바꿔도 내 것이 보여요" /></Card>}</div>}

      <details className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-gray-200" open={!!found}>
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">다른 폰으로 접수했나요? 이름·전화번호로 찾기</summary>
        <div className="h-3" />
        <form onSubmit={search} className="space-y-3">
          <Field label="접수할 때 쓴 이름"><Input value={name} onChange={e => setName(e.target.value)} required /></Field>
          <Field label="휴대폰번호"><Input value={phone} onChange={e => setPhone(fmtPhone(e.target.value))} inputMode="numeric" required /></Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy}>찾기</Button>
        </form>
        {found && (found.length ? <div className="mt-4"><List rows={found} /></div> : <div className="mt-4"><Alert kind="info">일치하는 내역이 없어요. 이름과 번호를 확인해 주세요.</Alert></div>)}
      </details>
      <CustomerNav slug={slug} active="my" />
    </div>
  )
}

/** 로그인한 손님의 내 정보 — 이름·번호·인원, 소식 받기(선택), 로그아웃 */
function Account({ cust }: { cust: Customer }) {
  const p = cust.profile
  const [edit, setEdit] = useState(!p?.phone)
  const [f, setF] = useState({ name: p?.name || cust.nameHint, phone: fmtPhone(p?.phone ?? ''), marketing_ok: p?.marketing_ok ?? false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await cust.save({ name: f.name.trim(), phone: f.phone, party: p?.party ?? 1, marketing_ok: f.marketing_ok }); setEdit(false) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  if (!edit && p) return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold text-gray-900">{p.name || '이름 없음'}</div>
          <div className="text-sm text-gray-500">{fmtPhone(p.phone)}</div>
        </div>
        <button type="button" onClick={() => setEdit(true)} className="shrink-0 text-sm font-semibold text-gray-700 underline">수정</button>
        <button type="button" onClick={() => cust.logout()} className="shrink-0 text-sm text-gray-500 underline">로그아웃</button>
      </div>
    </Card>
  )
  return (
    <Card>
      <form onSubmit={save} className="space-y-3">
        <Field label="이름"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required maxLength={20} autoComplete="name" /></Field>
        <Field label="휴대폰번호"><Input value={f.phone} onChange={e => setF({ ...f, phone: fmtPhone(e.target.value) })} placeholder="010-0000-0000" inputMode="numeric" required autoComplete="tel" /></Field>
        <label className="flex items-start gap-2.5 text-sm text-gray-700">
          <input type="checkbox" checked={f.marketing_ok} onChange={e => setF({ ...f, marketing_ok: e.target.checked })} className="mt-0.5 h-5 w-5 rounded" />
          <span>다음 행사 소식 받기 (선택)</span>
        </label>
        {err && <Alert kind="error">{err}</Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" loading={busy}>저장</Button>
          <button type="button" onClick={() => cust.logout()} className="text-sm text-gray-500 underline">로그아웃</button>
        </div>
      </form>
    </Card>
  )
}
