import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cachedRpc, rpc, DEMO } from '../../lib/supabase'
import { useAsync, fmtTime, LS } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import DemoBanner from '../../components/DemoBanner'
import { PLACE_KIND_LABEL, CROWD_LABEL, type EventGuide, type EventSchedule, type GuidePlace, type PlaceKind } from '../../lib/types'

/**
 * 행사 홈 — 지도가 곧 첫 화면이고, 핀마다 지금 대기가 붙는다 (2026-11-10, 테마파크 앱 구조).
 * 지도 ↔ 목록 전환 · 종류 필터 · 핀을 누르면 아래에서 카드(대기 접수·예약 버튼)가 올라온다.
 * 행사 종류가 달라도 이 틀은 그대로고 안에 든 장소만 바뀐다.
 */
type Group = 'all' | 'booth' | 'food' | 'market' | 'stage' | 'etc'
const GROUPS: { id: Group; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'booth', label: '체험' }, { id: 'food', label: '먹거리' }, { id: 'market', label: '마켓' }, { id: 'stage', label: '공연' }, { id: 'etc', label: '편의시설' },
]
const groupOf = (k: PlaceKind): Group => (k === 'booth' || k === 'food' || k === 'market' || k === 'stage' ? k : 'etc')

type Tone = 'go' | 'mid' | 'busy' | 'time' | 'off'
type Live = { text: string; tone: Tone; sort: number }
// 색은 셋만 쓴다 — 바로 입장·여유 = 코발트, 보통 = 검정, 오래 기다림·혼잡 = 빨강. (플릿 사이트와 같은 오프화이트 + 코발트 톤)
const TONE_PIN: Record<Tone, string> = { go: 'bg-blue-700 text-white', mid: 'bg-gray-900 text-white', busy: 'bg-red-600 text-white', time: 'bg-gray-900 text-white', off: 'bg-gray-300 text-gray-600' }
const TONE_TEXT: Record<Tone, string> = { go: 'text-blue-700', mid: 'text-gray-900', busy: 'text-red-600', time: 'text-gray-900', off: 'text-gray-400' }

/** 장소 한 곳의 '지금' 한 줄. 예상 대기(분)를 서버가 주면 분으로, 없으면 팀 수로 보여 준다 */
function liveOf(p: GuidePlace): Live | null {
  const b = p.booth
  if (b) {
    if (b.is_paused) return { text: '접수 중단', tone: 'off', sort: 9999 }
    if (b.mode === 'queue' || (b.mode === 'hybrid' && b.today_left <= 0)) {
      if (b.waiting_teams <= 0) return { text: '바로 입장', tone: 'go', sort: 0 }
      if (b.est_wait_min != null) {
        const m = Math.max(1, Math.round(b.est_wait_min))
        return { text: m >= 60 ? '60분+' : `${m}분`, tone: m <= 15 ? 'go' : m <= 35 ? 'mid' : 'busy', sort: m }
      }
      return { text: `${b.waiting_teams}팀`, tone: b.waiting_teams <= 3 ? 'go' : b.waiting_teams <= 10 ? 'mid' : 'busy', sort: b.waiting_teams * 5 }
    }
    if (b.today_left <= 0) return { text: '예약 마감', tone: 'off', sort: 9998 }
    return b.next_slot_at ? { text: `${fmtTime(b.next_slot_at)} 회차`, tone: 'time', sort: 20 } : { text: `잔여 ${b.today_left}석`, tone: 'time', sort: 20 }
  }
  if (p.crowd) return { text: CROWD_LABEL[p.crowd], tone: p.crowd === 'low' ? 'go' : p.crowd === 'mid' ? 'mid' : 'busy', sort: p.crowd === 'low' ? 100 : p.crowd === 'mid' ? 200 : 300 }
  return null
}

export default function ParkHome() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync<EventGuide>(() => cachedRpc('event_guide', slug), [slug])
  const sched = useAsync<EventSchedule>(() => cachedRpc('event_schedule', slug), [slug])
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, DEMO ? 6000 : 20000 + Math.random() * 5000)
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [slug]) // eslint-disable-line
  useEffect(() => {
    if (!data?.event) return
    LS.set('lastEvent', slug)
    const k = `viewed:${slug}`   // 방문 집계 — 세션당 1회
    if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); rpc('track_view', { p_slug: slug, p_page: 'home' }).catch(() => {}) }
  }, [data?.event?.id]) // eslint-disable-line

  const [view, setView] = useState<'map' | 'list'>(() => LS.get<'map' | 'list'>(`view:${slug}`) ?? 'map')
  const [group, setGroup] = useState<Group>('all')
  const [sel, setSel] = useState<string | null>(null)
  const pickView = (v: 'map' | 'list') => { setView(v); LS.set(`view:${slug}`, v); setSel(null) }

  const rows = useMemo(() => (data?.places ?? []).map(p => ({ p, live: liveOf(p) })), [data?.places])
  const groups = useMemo(() => GROUPS.filter(g => g.id === 'all' || rows.some(r => groupOf(r.p.kind) === g.id)), [rows])
  const shown = useMemo(() => rows.filter(r => group === 'all' || groupOf(r.p.kind) === group), [rows, group])
  // 목록: 대기가 있는 곳(체험) 먼저, 그 안에서 짧은 순 → 나머지는 원래 순서
  const listed = useMemo(() => [...shown].sort((a, b) => Number(!!b.p.booth) - Number(!!a.p.booth) || (a.p.booth && b.p.booth ? (a.live?.sort ?? 0) - (b.live?.sort ?? 0) : 0)), [shown])
  const selected = rows.find(r => r.p.id === sel) ?? null

  if (loading && !data) return <Spinner />
  if (!data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>
  const { event } = data
  const now = Date.now()
  const programs = sched.data?.programs ?? []
  const livePg = programs.find(p => new Date(p.starts_at).getTime() <= now && now < new Date(p.ends_at).getTime())
  const nextPg = programs.find(p => new Date(p.starts_at).getTime() > now)
  const urgent = (sched.data?.notices ?? []).find(n => n.urgent)
  const ev2 = sched.data?.event
  const hasMap = !!event.map_image_url
  const mode = hasMap ? view : 'list'

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <DemoBanner />
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-bold leading-tight text-gray-900">{event.name}</h1>
          </div>
          {hasMap && (
            <div className="flex shrink-0 rounded-full bg-gray-100 p-0.5 text-sm font-semibold">
              {(['map', 'list'] as const).map(v => (
                <button key={v} type="button" onClick={() => pickView(v)} className={`rounded-full px-3.5 py-1.5 ${mode === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{v === 'map' ? '지도' : '목록'}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          {groups.map(g => (
            <button key={g.id} type="button" onClick={() => { setGroup(g.id); setSel(null) }}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold ring-1 ${group === g.id ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-800 ring-gray-300 active:bg-gray-50'}`}>{g.label}</button>
          ))}
        </div>
      </header>

      <div className="space-y-2 px-4">
        {event.status !== 'open' && <Alert kind="info">지금은 운영 시간이 아니에요.</Alert>}
        {event.notice && <Alert kind="warn">{event.notice}</Alert>}
        {urgent && (
          <Link to={`/e/${slug}/schedule`} className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 ring-1 ring-red-200">
            <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">긴급</span><span className="truncate text-sm font-semibold text-gray-900">{urgent.title}</span>
          </Link>
        )}
        {(livePg || nextPg) && (
          <Link to={`/e/${slug}/schedule`} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 ring-1 ring-gray-200">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${livePg ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-700'}`}>{livePg ? '지금' : fmtTime(nextPg!.starts_at)}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{(livePg ?? nextPg)!.title}{(livePg ?? nextPg)!.place ? <span className="font-normal text-gray-500"> · {(livePg ?? nextPg)!.place!.name}</span> : null}</span>
            <span className="shrink-0 text-xs text-gray-400">일정 ›</span>
          </Link>
        )}
      </div>

      {mode === 'map' && (
        <div className="relative mt-3">
          <img src={event.map_image_url!} alt={`${event.name} 배치도`} className="block w-full select-none" draggable={false} onClick={() => setSel(null)} />
          {shown.map(({ p, live }) => <Pin key={p.id} p={p} live={live} on={sel === p.id} dim={!!sel && sel !== p.id} onClick={() => setSel(sel === p.id ? null : p.id)} />)}
        </div>
      )}
      {mode === 'map' && event.map_note && <p className="px-4 pt-2 text-xs text-gray-500">{event.map_note}</p>}

      <ul className={`divide-y divide-gray-100 px-4 ${mode === 'map' ? 'mt-2' : 'mt-1'}`}>
        {listed.map(({ p, live }) => (
          <li key={p.id}>
            <button type="button" onClick={() => { setSel(p.id); if (mode === 'map') window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-500">{PLACE_KIND_LABEL[p.kind]}{p.booth?.location ? ` · ${p.booth.location}` : p.hours ? ` · ${p.hours}` : ''}</div>
                <div className="truncate text-[17px] font-bold text-gray-900">{p.name}</div>
                {p.booth && p.booth.mode === 'queue' && p.booth.waiting_teams > 0 && <div className="text-xs text-gray-500">대기 {p.booth.waiting_teams}팀</div>}
                {p.booth && p.booth.mode !== 'queue' && p.booth.today_left > 0 && <div className="text-xs text-gray-500">오늘 잔여 {p.booth.today_left}석</div>}
                {!p.booth && p.menu?.length > 0 && <div className="truncate text-xs text-gray-500">{p.menu.slice(0, 3).map(m => m.name).join(' · ')}</div>}
              </div>
              {live && <span className={`shrink-0 text-right text-[17px] font-bold tabular-nums ${TONE_TEXT[live.tone]}`}>{live.text}</span>}
            </button>
          </li>
        ))}
        {listed.length === 0 && <li className="py-16 text-center text-sm text-gray-400">표시할 장소가 없어요.</li>}
      </ul>

      {/* 행사 즐기기 — 스탬프·럭키드로우·설문·오시는 길. 켜진 것만 보인다 */}
      {ev2 && (ev2.stamp_enabled || ev2.draw_open || ev2.survey_enabled || ev2.directions_text) && (
        <div className="mx-4 mt-4 divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-200">
          {ev2.stamp_enabled && <More to={`/e/${slug}/stamp`} title="스탬프 투어" sub="부스를 돌고 경품 받기" />}
          {ev2.draw_open && <More to={`/e/${slug}/draw`} title="럭키드로우" sub="응모하고 경품 받기" />}
          {ev2.survey_enabled && <More to={`/e/${slug}/survey`} title="한마디 남기기" sub="30초 만족도 설문" />}
          {ev2.directions_text && <More to={`/e/${slug}/map`} title="오시는 길 · 주차" sub={ev2.directions_text.split('\n')[0]} />}
        </div>
      )}
      <p className="pt-6 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>

      {selected && <Sheet p={selected.p} live={selected.live} onClose={() => setSel(null)} />}
      <CustomerNav slug={slug} active="hub" stamp={!!event.stamp_enabled} />
    </div>
  )
}

const KIND_INITIAL: Record<PlaceKind, string> = { booth: '체', food: '식', market: '마', stage: '무', facility: '편', info: '안', parking: 'P', shuttle: '셔', medical: '+', other: '·' }

/** 대기가 있는 곳은 '시간 알약' 핀, 그 밖은 작은 종류 점. 고르면 이름표가 붙는다 */
function Pin({ p, live, on, dim, onClick }: { p: GuidePlace; live: Live | null; on: boolean; dim: boolean; onClick: () => void }) {
  const pill = !!p.booth && !!live
  return (
    <button type="button" onClick={onClick} aria-label={`${p.name}${live ? ` ${live.text}` : ''}`}
      className={`absolute -translate-x-1/2 -translate-y-full transition ${on ? 'z-10 scale-110' : ''} ${dim ? 'opacity-40' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
      <span className="flex flex-col items-center">
        {on && <span className="mb-1 whitespace-nowrap rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-900 shadow ring-1 ring-gray-200">{p.name}</span>}
        {pill
          ? <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums shadow-md ring-2 ring-white ${TONE_PIN[live!.tone]}`}>{live!.text}</span>
          : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-gray-700 shadow ring-1 ring-gray-300">{KIND_INITIAL[p.kind]}</span>}
        <span className="-mt-px h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-white" />
      </span>
    </button>
  )
}

function Sheet({ p, live, onClose }: { p: GuidePlace; live: Live | null; onClose: () => void }) {
  const b = p.booth
  const to = b ? (b.mode === 'queue' ? `/q/${b.slug}` : `/r/${b.slug}`) : null
  return (
    <div className="fixed inset-x-0 bottom-14 z-30 mx-auto max-w-md px-3" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="rounded-2xl bg-white p-4 shadow-xl ring-1 ring-gray-200">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500">{PLACE_KIND_LABEL[p.kind]}{b?.location ? ` · ${b.location}` : ''}{p.hours ? ` · ${p.hours}` : ''}</div>
            <div className="text-lg font-bold leading-tight text-gray-900">{p.name}</div>
            {p.description && <p className="mt-1 text-sm leading-snug text-gray-600">{p.description}</p>}
          </div>
          {live && (
            <div className="shrink-0 text-right">
              <div className={`text-xl font-bold tabular-nums ${TONE_TEXT[live.tone]}`}>{live.text}</div>
              {b && b.mode === 'queue' && b.waiting_teams > 0 && <div className="text-xs text-gray-500">대기 {b.waiting_teams}팀</div>}
              {b && b.mode !== 'queue' && b.today_left > 0 && <div className="text-xs text-gray-500">잔여 {b.today_left}석</div>}
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-gray-400 active:bg-gray-100">✕</button>
        </div>
        {p.menu?.length > 0 && (
          <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto border-t border-gray-100 pt-3 text-sm">
            {p.menu.map((m, i) => <li key={i} className="flex justify-between gap-3"><span className="text-gray-800">{m.name}</span>{m.price && <span className="shrink-0 tabular-nums text-gray-500">{m.price}</span>}</li>)}
          </ul>
        )}
        {to && !b!.is_paused && (
          <Link to={to} className="mt-3 flex h-12 items-center justify-center rounded-xl bg-gray-900 text-[16px] font-semibold text-white active:bg-gray-800">{b!.mode === 'queue' ? '줄서기' : '회차 예약하기'}</Link>
        )}
      </div>
    </div>
  )
}

function More({ to, title, sub }: { to: string; title: string; sub: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
      <div className="min-w-0 flex-1"><div className="text-[15px] font-bold text-gray-900">{title}</div><div className="truncate text-xs text-gray-500">{sub}</div></div>
      <span className="text-gray-400">›</span>
    </Link>
  )
}
