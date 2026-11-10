import { Link } from 'react-router-dom'
import { DEMO } from '../lib/supabase'
import { fmtTime } from '../lib/util'
import { useMyTickets, isActive } from '../lib/myTickets'
import { useMyOrders, orderActive } from '../lib/orders'

/** 내 대기·예약·주문 띠 — 급한 것 하나만 크게 보여 주고, 더 있으면 '마이페이지 N건' 으로 묶는다 (지도·홈을 밀어내지 않게) */
export default function MyStrips({ slug }: { slug: string }) {
  const orders = useMyOrders(slug, DEMO ? 4000 : 10000).filter(orderActive)
  const tickets = useMyTickets(slug, DEMO ? 6000 : 20000).filter(isActive)
  type S = { key: string; to: string; name: string; text: string; hot: boolean }
  const all: S[] = [
    ...orders.map(o => ({ key: o.token, to: `/o/${o.token}`, name: o.place.name, hot: o.status === 'ready', text: o.status === 'ready' ? `${o.order_no}번 받으러 오세요` : o.status === 'accepted' ? `${o.order_no}번 준비 중` : `${o.order_no}번 주문 확인 중` })),
    ...tickets.map(r => ({ key: r.token, to: `/t/${r.token}`, name: r.booth, hot: r.status === 'called', text: r.status === 'called' ? '지금 입장하세요' : r.slot_at ? `${fmtTime(r.slot_at)} 회차` : r.ahead ? `앞 ${r.ahead}팀${r.est_wait_min ? ` · 약 ${r.est_wait_min}분` : ''}` : '곧 차례예요' })),
  ].sort((a, b) => Number(b.hot) - Number(a.hot))
  if (!all.length) return null
  const first = all[0], rest = all.length - 1
  return (
    <div className="flex gap-2">
      <Link to={first.to} className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-3 text-white ${first.hot ? 'bg-red-600' : 'bg-blue-700'}`}>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{first.name}</span>
        <span className="shrink-0 text-[15px] font-bold tabular-nums">{first.text}</span>
      </Link>
      {rest > 0 && <Link to={`/e/${slug}/my`} className={`flex shrink-0 items-center rounded-xl px-3 text-[15px] font-bold text-white ${all.slice(1).some(s => s.hot) ? 'bg-red-600' : 'bg-gray-900'}`}>+{rest}</Link>}
    </div>
  )
}
