import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cachedRpc } from '../../lib/supabase'
import { useAsync, fmtDateTime, fmtDate, LS } from '../../lib/util'
import { Alert, Spinner, Badge } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import BizFooter from '../../components/BizFooter'

interface BoothCard {
  id: string; name: string; slug: string; mode: 'queue' | 'slot' | 'hybrid'; is_paused: boolean; location: string | null
  image_url: string | null; description: string | null; max_party_size: string | null; reserve_open_at: string | null
  waiting_teams: number; today_slots: number; today_left: number; total_left: number
}
interface EventSummary {
  event: { id: string; name: string; slug: string; status: string; notice: string | null; starts_at: string; ends_at: string; image_url: string | null }
  booths: BoothCard[]
}

const GRADS = ['from-rose-400 to-orange-300', 'from-sky-400 to-indigo-400', 'from-emerald-400 to-teal-300', 'from-violet-400 to-fuchsia-300', 'from-amber-400 to-yellow-300']

export default function EventHome() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync<EventSummary>(() => cachedRpc('event_summary', slug), [slug])
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 20000 + Math.random() * 5000)
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [slug]) // eslint-disable-line

  if (loading) return <Spinner />
  if (error || !data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>

  const { event, booths } = data
  const queues = booths.filter(b => b.mode === 'queue')
  const slotsB = booths.filter(b => b.mode !== 'queue')
  const closed = event.status !== 'open'
  const mine = booths.map(b => LS.get<{ token: string; at: number }>(`ticket:${b.slug}`) ?? LS.get<{ token: string; at: number }>(`resv:${b.slug}`))
    .filter((x): x is { token: string; at: number } => !!x && Date.now() - x.at < 7 * 86400_000)

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-gray-50 pb-24">
      {/* 히어로 */}
      <div className="relative h-56 overflow-hidden bg-gray-900">
        {event.image_url
          ? <img src={event.image_url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-[radial-gradient(ellipse_at_top_left,_#f59e0b_0%,_#111827_55%)]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-gray-950/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <div className="text-xs font-medium text-white/70">{fmtDate(event.starts_at)} ~ {fmtDate(event.ends_at)}</div>
          <h1 className="text-3xl font-black leading-tight">체험부스</h1>
          <div className="text-sm text-white/80">{event.name}</div>
        </div>
      </div>

      <div className="space-y-5 px-4 pt-4">
        {event.notice && <Alert kind="warn">{event.notice}</Alert>}
        {closed && <Alert kind="info">지금은 운영 시간이 아닙니다. 운영: {fmtDateTime(event.starts_at)} ~ {fmtDateTime(event.ends_at)}</Alert>}
        {mine.length > 0 && <Alert kind="info">접수한 대기·예약이 있어요. <Link to={`/t/${mine[0].token}`} className="font-semibold underline">내 현황 보기</Link></Alert>}

        {queues.length > 0 && (
          <section>
            <SectionTitle title="현장 대기" sub="QR로 줄 서고, 차례가 오면 카카오 알림톡으로 불러드려요" />
            <div className="space-y-3">
              {queues.map((b, i) => (
                <BoothTile key={b.id} b={b} to={`/q/${b.slug}`} grad={GRADS[i % GRADS.length]}
                  right={b.is_paused ? <Badge tone="red">일시중단</Badge> : <Big n={b.waiting_teams} unit="팀" label="현재 대기" />} />
              ))}
            </div>
          </section>
        )}

        {slotsB.length > 0 && (
          <section>
            <SectionTitle title="사전 예약" sub="회차를 골라 자리를 확보하세요 · 노쇼 자리는 현장 대기 순으로" />
            <div className="space-y-3">
              {slotsB.map((b, i) => {
                const openAt = b.reserve_open_at ? new Date(b.reserve_open_at) : null
                const notYet = !!openAt && openAt.getTime() > Date.now()
                const left = b.today_slots > 0 ? b.today_left : b.total_left
                return (
                  <BoothTile key={b.id} b={b} to={`/r/${b.slug}`} grad={GRADS[(i + 3) % GRADS.length]}
                    foot={b.mode === 'hybrid' && b.waiting_teams > 0 ? `현장 대기 ${b.waiting_teams}팀` : undefined}
                    right={notYet ? <Badge tone="gray">{fmtDateTime(openAt!.toISOString())} 오픈</Badge>
                      : b.total_left <= 0 ? <Badge tone="red">매진</Badge>
                      : <Big n={left} unit="석" label={b.today_slots > 0 ? '오늘 잔여' : '잔여'} />} />
                )
              })}
            </div>
          </section>
        )}

        <p className="pt-2 text-center text-xs text-gray-400">이 화면은 자동으로 갱신됩니다 · 운영 플릿 (FLIT)</p>
        <BizFooter className="!mt-2" />
      </div>
      <CustomerNav slug={event.slug} active="home" />
    </div>
  )
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return <div className="mb-2.5"><h2 className="text-lg font-bold">{title}</h2><p className="text-xs text-gray-500">{sub}</p></div>
}

function Big({ n, unit, label }: { n: number; unit: string; label: string }) {
  return <div className="text-right"><div className="text-3xl font-black tabular-nums leading-none">{n}<span className="ml-0.5 text-sm font-semibold text-gray-500">{unit}</span></div><div className="mt-0.5 text-[11px] text-gray-500">{label}</div></div>
}

function BoothTile({ b, to, grad, right, foot }: { b: BoothCard; to: string; grad: string; right: React.ReactNode; foot?: string }) {
  return (
    <Link to={to} className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition active:scale-[0.99]">
      <div className="flex">
        <div className={`relative h-28 w-28 shrink-0 overflow-hidden bg-gradient-to-br ${grad}`}>
          {b.image_url
            ? <img src={b.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <div className="flex h-full items-center justify-center text-4xl font-black text-white/80">{b.name.replace(/^쿠킹 클래스\s*·\s*/, '').slice(0, 1)}</div>}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 p-3.5">
          <div className="min-w-0">
            <div className="line-clamp-2 text-[15px] font-bold leading-tight">{b.name}</div>
            {b.description ? <div className="mt-1 line-clamp-2 text-xs leading-snug text-gray-500">{b.description}</div>
              : b.location && <div className="mt-1 text-xs text-gray-500">{b.location}</div>}
            {foot && <div className="mt-1 text-[11px] text-gray-400">{foot}</div>}
          </div>
          <div className="shrink-0">{right}</div>
        </div>
      </div>
    </Link>
  )
}
