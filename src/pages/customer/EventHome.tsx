import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { rpc, supabase } from '../../lib/supabase'
import { useAsync, fmtDateTime, LS } from '../../lib/util'
import { Page, Card, Alert, Spinner, Badge } from '../../components/ui'

interface BoothCard {
  id: string; name: string; slug: string; mode: 'queue' | 'slot' | 'hybrid'; is_paused: boolean; location: string | null
  max_party_size: string | null; reserve_open_at: string | null
  waiting_teams: number; today_slots: number; today_left: number; total_left: number
}
interface EventSummary {
  event: { id: string; name: string; slug: string; status: string; notice: string | null; starts_at: string; ends_at: string }
  booths: BoothCard[]
}

export default function EventHome() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync<EventSummary>(() => rpc('event_summary', { p_slug: slug }), [slug])

  useEffect(() => {
    const ch = supabase.channel(`event-${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booth_versions' }, () => reload())
      .subscribe()
    const iv = setInterval(reload, 12000)
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { supabase.removeChannel(ch); clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [slug]) // eslint-disable-line

  if (loading) return <Spinner />
  if (error || !data?.event) return <Page><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></Page>

  const { event, booths } = data
  const queues = booths.filter(b => b.mode === 'queue')
  const slotsB = booths.filter(b => b.mode !== 'queue')
  const closed = event.status !== 'open'

  // 내가 접수한 티켓 (이 기기)
  const mine = booths.map(b => LS.get<{ token: string; at: number }>(`ticket:${b.slug}`) ?? LS.get<{ token: string; at: number }>(`resv:${b.slug}`))
    .filter((x): x is { token: string; at: number } => !!x && Date.now() - x.at < 7 * 86400_000)

  return (
    <Page title="체험부스" sub={event.name}>
      {event.notice && <div className="mb-4"><Alert kind="warn">{event.notice}</Alert></div>}
      {closed && <div className="mb-4"><Alert kind="info">지금은 운영 시간이 아닙니다. 운영: {fmtDateTime(event.starts_at)} ~ {fmtDateTime(event.ends_at)}</Alert></div>}
      {mine.length > 0 && (
        <div className="mb-4">
          <Alert kind="info">접수한 대기·예약이 있어요. <Link to={`/t/${mine[0].token}`} className="font-semibold underline">내 현황 보기</Link></Alert>
        </div>
      )}

      {queues.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">현장 대기 · QR 접수 후 알림톡으로 호출</h2>
          <div className="space-y-2">
            {queues.map(b => (
              <Link key={b.id} to={`/q/${b.slug}`} className="block">
                <Card className="!p-4 active:bg-gray-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-bold">{b.name}</div>
                      {b.location && <div className="truncate text-xs text-gray-500">{b.location}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      {b.is_paused ? <Badge tone="red">일시중단</Badge> : (
                        <>
                          <div className="text-2xl font-bold tabular-nums leading-none">{b.waiting_teams}<span className="ml-0.5 text-sm font-medium text-gray-500">팀</span></div>
                          <div className="text-[11px] text-gray-500">현재 대기</div>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {slotsB.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">사전 예약 · 회차를 골라 자리 확보</h2>
          <div className="space-y-2">
            {slotsB.map(b => {
              const openAt = b.reserve_open_at ? new Date(b.reserve_open_at) : null
              const notYet = !!openAt && openAt.getTime() > Date.now()
              return (
                <Link key={b.id} to={`/r/${b.slug}`} className="block">
                  <Card className="!p-4 active:bg-gray-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-bold">{b.name}</div>
                        <div className="truncate text-xs text-gray-500">{b.location ?? ''}{b.max_party_size ? ` · 1회 최대 ${b.max_party_size}명` : ''}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        {notYet ? <Badge tone="gray">{fmtDateTime(openAt!.toISOString())} 오픈</Badge>
                          : b.total_left <= 0 ? <Badge tone="red">매진</Badge>
                          : (
                            <>
                              <div className="text-2xl font-bold tabular-nums leading-none">{b.today_slots > 0 ? b.today_left : b.total_left}<span className="ml-0.5 text-sm font-medium text-gray-500">석</span></div>
                              <div className="text-[11px] text-gray-500">{b.today_slots > 0 ? '오늘 잔여' : '잔여'}</div>
                            </>
                          )}
                      </div>
                    </div>
                    {b.mode === 'hybrid' && b.waiting_teams > 0 && <div className="mt-2 text-xs text-gray-500">현장 대기 {b.waiting_teams}팀 · 노쇼 자리가 생기면 순서대로 안내</div>}
                  </Card>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-gray-400">이 화면은 자동으로 갱신됩니다 · 운영 플릿 (FLIT)</p>
    </Page>
  )
}
