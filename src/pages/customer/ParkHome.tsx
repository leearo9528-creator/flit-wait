import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { cachedRpc, rpc, DEMO } from '../../lib/supabase'
import { useAsync, fmtTime, LS } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import DemoBanner from '../../components/DemoBanner'
import { PLACE_KIND_LABEL, type EventGuide, type EventSchedule, type GuidePlace, type PlaceKind } from '../../lib/types'
import { liveOf, TONE_PIN, TONE_TEXT, type Live } from '../../lib/live'

/**
 * 행사 홈 — 지도가 곧 첫 화면이고, 핀마다 지금 대기가 붙는다 (2026-11-10, 테마파크 앱 구조).
 * 지도 ↔ 목록 전환 · 종류 필터 · 핀이나 목록을 누르면 그 장소의 상세 화면(PlaceDetail)으로 넘어간다.
 * 행사 종류가 달라도 이 틀은 그대로고 안에 든 장소만 바뀐다.
 */
type Group = 'booth' | 'food' | 'market' | 'stage' | 'etc'
const GROUPS: { id: Group; label: string }[] = [ { id: 'booth', label: '체험' }, { id: 'food', label: '먹거리' }, { id: 'market', label: '마켓' }, { id: 'stage', label: '공연' }, { id: 'etc', label: '편의시설' },
]
const groupOf = (k: PlaceKind): Group => (k === 'booth' || k === 'food' || k === 'market' || k === 'stage' ? k : 'etc')

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
  const [picked, setGroup] = useState<Group | null>(null)
  const nav = useNavigate()
  const pickView = (v: 'map' | 'list') => { setView(v); LS.set(`view:${slug}`, v) }

  const rows = useMemo(() => (data?.places ?? []).map(p => ({ p, live: liveOf(p) })), [data?.places])
  // 한 번에 한 종류만 보여 준다 — 처음엔 대기가 있는 체험 (없으면 첫 종류). 핀 이름표가 서로 가리지 않게 하려는 것
  const groups = useMemo(() => GROUPS.filter(g => rows.some(r => groupOf(r.p.kind) === g.id)), [rows])
  const group = picked && groups.some(g => g.id === picked) ? picked : groups[0]?.id
  const shown = useMemo(() => rows.filter(r => groupOf(r.p.kind) === group), [rows, group])
  // 목록: 대기가 있는 곳(체험) 먼저, 그 안에서 짧은 순 → 나머지는 원래 순서
  const listed = useMemo(() => [...shown].sort((a, b) => Number(!!b.p.booth) - Number(!!a.p.booth) || (a.p.booth && b.p.booth ? (a.live?.sort ?? 0) - (b.live?.sort ?? 0) : 0)), [shown])

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
            <button key={g.id} type="button" onClick={() => setGroup(g.id)}
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
          <img src={event.map_image_url!} alt={`${event.name} 배치도`} className="block w-full select-none" draggable={false} />
          {shown.map(({ p, live }) => <Pin key={p.id} p={p} live={live} onClick={() => nav(`/e/${slug}/p/${p.id}`)} />)}
        </div>
      )}
      {mode === 'map' && event.map_note && <p className="px-4 pt-2 text-xs text-gray-500">{event.map_note}</p>}

      <ul className={`divide-y divide-gray-100 px-4 ${mode === 'map' ? 'mt-2' : 'mt-1'}`}>
        {listed.map(({ p, live }) => (
          <li key={p.id}>
            <button type="button" onClick={() => nav(`/e/${slug}/p/${p.id}`)} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-gray-50">
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

      <CustomerNav slug={slug} active="hub" stamp={!!event.stamp_enabled} />
    </div>
  )
}

/** 핀에 적는 이름 — ' · ' 앞부분만, 길면 8자에서 자른다 */
function pinName(name: string) {
  const n = name.split(' · ')[0].trim()
  return n.length > 8 ? n.slice(0, 7) + '…' : n
}

/** 핀마다 이름을 적는다. 대기가 있는 곳은 '이름 + 시간' 색 알약, 그 밖은 흰 이름표. 누르면 상세 화면으로 간다 */
function Pin({ p, live, onClick }: { p: GuidePlace; live: Live | null; onClick: () => void }) {
  const pill = !!p.booth && !!live
  return (
    <button type="button" onClick={onClick} aria-label={`${p.name}${live ? ` ${live.text}` : ''}`}
      className="absolute -translate-x-1/2 -translate-y-full transition active:scale-95" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
      <span className="flex flex-col items-center">
        {pill
          ? <span className={`flex items-baseline gap-1 whitespace-nowrap rounded-full px-2.5 py-1 shadow-md ring-2 ring-white ${TONE_PIN[live!.tone]}`}>
              <span className="text-[11px] font-medium opacity-90">{pinName(p.name)}</span>
              <span className="text-[13px] font-bold tabular-nums">{live!.text}</span>
            </span>
          : <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-gray-700 shadow ring-1 ring-gray-300">{pinName(p.name)}</span>}
        <span className="-mt-px h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-white" />
      </span>
    </button>
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
