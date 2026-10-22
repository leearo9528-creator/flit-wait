import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cachedRpc } from '../../lib/supabase'
import { useAsync, fmtDateTime, LS } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import { BoothThumb, StatusBadge, boothStatus, nextOpenAt, showGroupTag, queueWindowState } from '../../components/BoothCard'

export interface BoothCard {
  id: string; name: string; slug: string; mode: 'queue' | 'slot' | 'hybrid'; is_paused: boolean; pause_mode?: string | null; location: string | null
  image_url: string | null; icon_url?: string | null; description: string | null; max_party_size: string | null; reserve_open_at: string | null; reserve_open_daily_time?: string | null; next_slot_at?: string | null
  queue_open_daily_time?: string | null; queue_close_daily_time?: string | null; open_override_date?: string | null
  group_name?: string | null; category?: string | null
  waiting_teams: number; today_slots: number; today_left: number; total_left: number
}
interface EventSummary {
  event: { id: string; name: string; slug: string; status: string; notice: string | null; starts_at: string; ends_at: string; image_url: string | null }
  booths: BoothCard[]
}

type Sort = 'order' | 'name' | 'wait'
const SORT_LABEL: Record<Sort, string> = { order: '기본순', name: '이름순', wait: '대기 적은순' }

/**
 * 행사 홈 — 주문 앱(PAMP)과 같은 구조로 맞춘 목록 화면.
 * 상단: 존(대분류) 칩 탭 + 정렬 / 본문: 사진 썸네일 + 상태 뱃지 + 카테고리 + 이름 + 대기 현황 한 줄
 */
export default function EventHome() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync<EventSummary>(() => cachedRpc('event_summary', slug), [slug])
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 20000 + Math.random() * 5000)
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [slug]) // eslint-disable-line

  const zones = useMemo(() => {
    const out: string[] = []
    for (const b of data?.booths ?? []) { const z = b.group_name?.trim(); if (z && !out.includes(z)) out.push(z) }
    return out
  }, [data?.booths])
  const [zone, setZone] = useState<string>(() => LS.get<string>(`zone:${slug}`) ?? '')
  const [sort, setSort] = useState<Sort>(() => LS.get<Sort>(`sort:${slug}`) ?? 'order')
  const [sortOpen, setSortOpen] = useState(false)
  const pickZone = (z: string) => { setZone(z); LS.set(`zone:${slug}`, z) }
  const pickSort = (s: Sort) => { setSort(s); LS.set(`sort:${slug}`, s); setSortOpen(false) }

  const list = useMemo(() => {
    let arr = (data?.booths ?? []).filter(b => !zone || (b.group_name?.trim() || '') === zone)
    if (sort === 'name') arr = [...arr].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    if (sort === 'wait') arr = [...arr].sort((a, b) => a.waiting_teams - b.waiting_teams)
    return arr
  }, [data?.booths, zone, sort])

  if (loading) return <Spinner />
  // 일시적 폴링 실패는 마지막 정상 화면을 유지하고 다음 폴링에서 조용히 복구. 처음부터 못 받았을 때만 오류 표시
  if (!data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>

  const { event, booths } = data
  const closed = event.status !== 'open'
  const beforeStart = !closed && new Date(event.starts_at).getTime() > Date.now()
  const mine = booths.map(b => LS.get<{ token: string; at: number }>(`ticket:${b.slug}`) ?? LS.get<{ token: string; at: number }>(`resv:${b.slug}`))
    .filter((x): x is { token: string; at: number } => !!x && Date.now() - x.at < 7 * 86400_000)

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      {/* 행사 배너 (관리자 > 행사 설정 > 대표 이미지). 스크롤하면 올라가고 아래 제목 바만 고정 */}
      {event.image_url && <img src={event.image_url} alt={event.name} className="block w-full" />}
      {/* 상단 바 */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4">
          <h1 className="flex-1 text-xl font-bold">체험부스 신청</h1>
          {/* 정렬은 제목 줄 오른쪽 — 칩 줄은 전부 보이게 */}
          <div className="relative shrink-0">
            <button type="button" onClick={() => setSortOpen(o => !o)} className="flex items-center gap-1 py-2 px-2 text-sm font-medium text-gray-700">
              {SORT_LABEL[sort]} <span className={`text-xs transition-transform ${sortOpen ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200">
                {(Object.keys(SORT_LABEL) as Sort[]).map(s => (
                  <button key={s} type="button" onClick={() => pickSort(s)} className={`block w-full px-4 py-2.5 text-left text-sm ${s === sort ? 'font-bold text-gray-900' : 'text-gray-600'} active:bg-gray-50`}>{SORT_LABEL[s]}</button>
                ))}
              </div>
            )}
          </div>
          <Link to={`/e/${event.slug}/my`} aria-label="내 대기·예약" className="rounded-full p-2 text-2xl leading-none active:bg-gray-100">🎫</Link>
        </div>
        {/* 존 칩 — 스크롤·잘림 없이 줄바꿈으로 전부 표시 */}
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {zones.length > 1 && <Chip on={zone === ''} onClick={() => pickZone('')}>전체</Chip>}
          {zones.map(z => <Chip key={z} on={zone === z} onClick={() => pickZone(z)}>{z}</Chip>)}
          {zones.length === 0 && <Chip on>{event.name}</Chip>}
        </div>
      </header>

      <div className="px-4">
        {event.notice && <div className="mb-3"><Alert kind="warn">{event.notice}</Alert></div>}
        {closed && <div className="mb-3"><Alert kind="info">지금은 운영 시간이 아닙니다. 운영: {fmtDateTime(event.starts_at)} ~ {fmtDateTime(event.ends_at)}</Alert></div>}
        {mine.length > 0 && <div className="mb-3"><Alert kind="info">접수한 대기·예약이 있어요. <Link to={`/t/${mine[0].token}`} className="font-semibold underline">내 현황 보기</Link></Alert></div>}

        <ul className="divide-y divide-gray-100">
          {/* 행사 시작 전 대기표 부스는 '시작 전' — 단, 접수 시간대가 따로 있으면 '접수 오픈 예정 14:00' 이 더 정확하므로 boothStatus 에 맡긴다 */}
          {list.map(b => <BoothListItem key={b.id} b={b} closed={closed ? true : beforeStart && b.mode === 'queue' && queueWindowState(b) === 'open' ? 'before' : false} />)}
        </ul>
        {list.length === 0 && <p className="py-16 text-center text-sm text-gray-400">표시할 체험부스가 없어요.</p>}

        <p className="pt-6 text-center text-xs text-gray-400">이 화면은 자동으로 갱신됩니다 · 운영 플릿 (FLIT)</p>
      </div>
      <CustomerNav slug={event.slug} active="home" />
    </div>
  )
}

function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold ring-1 transition ${on ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-800 ring-gray-300 active:bg-gray-50'}`}>
      {children}
    </button>
  )
}

/** 한 줄 = 사진(좌) + [상태 뱃지 · 존 · 카테고리] / 이름 / 대기 현황 */
function BoothListItem({ b, closed }: { b: BoothCard; closed: boolean | 'before' }) {
  const isQueue = b.mode === 'queue'
  const st = boothStatus(b, closed)
  const dim = st.kind === 'closed' || st.kind === 'paused' || st.kind === 'soldout'
  const to = isQueue ? `/q/${b.slug}` : `/r/${b.slug}`
  const left = b.today_slots > 0 ? b.today_left : b.total_left
  // 다음 회차 날짜 기준 오픈 시각 — 일별 오픈(매일 12:00)이면 그 날짜 12:00
  const openAt = nextOpenAt(b)
  const notYet = !!openAt && openAt.getTime() > Date.now()
  const g = showGroupTag(b.group_name, b.category)
  const label = b.name

  const ws = isQueue ? queueWindowState(b) : 'open'
  const live = isQueue
    ? ws === 'before_open' ? <>대기 접수 {b.queue_open_daily_time}~</>
    : ws === 'after_close' ? <>오늘 접수 마감</>
    : <>대기손님 현황 <b className="tabular-nums">{b.waiting_teams}팀</b></>
    : notYet ? <>예약 오픈 {fmtDateTime(openAt!.toISOString())}</>
    : b.total_left <= 0 ? <>전 회차 매진{b.waiting_teams > 0 ? ` · 현장 대기 ${b.waiting_teams}팀` : ''}</>
    : <>{b.today_slots > 0 ? '오늘 잔여' : '잔여'} <b className="tabular-nums">{left}석</b>{b.waiting_teams > 0 ? ` · 현장 대기 ${b.waiting_teams}팀` : ''}</>

  return (
    <li>
      <Link to={to} className={`flex gap-4 py-4 active:bg-gray-50 ${dim ? 'opacity-60' : ''}`}>
        <BoothThumb b={b} dim={dim} label={dim ? st.label : undefined} />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
            <StatusBadge st={st} />
            {g && <span>{g}</span>}
            {b.category && <span>{b.category}</span>}
          </div>
          <div className={`mt-1.5 text-[20px] font-bold leading-tight ${dim ? 'text-gray-500' : 'text-gray-900'}`}>{label}</div>
          <div className={`mt-2 flex items-center gap-1.5 text-[15px] font-semibold ${dim ? 'text-gray-400' : 'text-orange-500'}`}>
            <span aria-hidden>👤</span><span>{live}</span>
          </div>
        </div>
      </Link>
    </li>
  )
}
