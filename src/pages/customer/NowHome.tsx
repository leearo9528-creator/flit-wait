import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cachedRpc, rpc, DEMO } from '../../lib/supabase'
import { useAsync, fmtTime, LS } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import DemoBanner from '../../components/DemoBanner'
import MyStrips from '../../components/MyStrips'
import type { EventSchedule } from '../../lib/types'
import { useGuide } from '../../lib/guide'
import { TONE_TEXT } from '../../lib/live'

/**
 * 홈 — '지금 뭐 하지' 에 답한다 (2026-11-11 개편). 위에서부터: 마이페이지 → 알림 → 지금 하는 일정 → 바로 할 수 있는 체험 → 먹거리 → 즐길 거리.
 * '어디 있지' 는 지도 탭이 맡는다.
 */
export default function NowHome() {
  const { slug = '' } = useParams()
  const { data, error, loading, rows, open } = useGuide(slug)
  const sched = useAsync<EventSchedule>(() => cachedRpc('event_schedule', slug), [slug])
  useEffect(() => {
    if (!data?.event) return
    LS.set('lastEvent', slug)
    const k = `viewed:${slug}`   // 방문 집계 — 세션당 1회
    if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); rpc('track_view', { p_slug: slug, p_page: 'home' }).catch(() => {}) }
  }, [data?.event?.id]) // eslint-disable-line
  // 긴급 공지가 늦게 뜨지 않게 일정·공지도 20초마다, 그리고 화면을 다시 볼 때마다 읽는다 (첫 응답은 캐시라 한 박자 늦을 수 있어 3초 뒤 한 번 더)
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') sched.reload() }
    const first = setTimeout(again, 3000), iv = setInterval(again, DEMO ? 6000 : 20000)
    document.addEventListener('visibilitychange', again)
    return () => { clearTimeout(first); clearInterval(iv); document.removeEventListener('visibilitychange', again) }
  }, [slug]) // eslint-disable-line

  if (loading && !data) return <Spinner />
  if (!data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>
  const { event } = data
  const now = Date.now()
  const programs = sched.data?.programs ?? []
  const livePg = programs.filter(p => new Date(p.starts_at).getTime() <= now && now < new Date(p.ends_at).getTime())
  const nextPg = programs.filter(p => new Date(p.starts_at).getTime() > now && new Date(p.starts_at).toDateString() === new Date().toDateString()).slice(0, 2)
  const notices = sched.data?.notices ?? []
  const urgent = notices.find(n => n.urgent)
  const ev2 = sched.data?.event
  // 체험: 지금 받는 곳만, 빨리 할 수 있는 순
  const booths = rows.filter(r => r.p.booth && r.live && r.live.tone !== 'off').sort((a, b) => a.live!.sort - b.live!.sort)
  const foods = rows.filter(r => r.p.kind === 'food' && (r.p.menu?.length ?? 0) > 0)
  const markets = rows.filter(r => r.p.kind === 'market')
  const more = [
    ev2?.stamp_enabled && { to: `/e/${slug}/stamp`, title: '스탬프 투어', sub: '돌고 경품 받기' },
    ev2?.draw_open && { to: `/e/${slug}/draw`, title: '럭키드로우', sub: '응모하고 경품 받기' },
    { to: `/e/${slug}/schedule`, title: '일정 · 공지', sub: programs.length ? `오늘 일정 ${programs.length}개` : '운영 안내' },
    (ev2?.directions_text || ev2?.lat != null) && { to: `/e/${slug}/schedule#way`, title: '오시는 길', sub: '주차 · 교통' },
    ev2?.survey_enabled && { to: `/e/${slug}/survey`, title: '한마디 남기기', sub: '30초 설문' },
  ].filter(Boolean) as { to: string; title: string; sub: string }[]

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <DemoBanner />
      <header className="flex items-start gap-3 px-4 pb-1 pt-4">
        <h1 className="min-w-0 flex-1 text-[22px] font-bold leading-tight text-gray-900">{event.name}</h1>
        <Link to={`/e/${slug}/map?find=1`} aria-label="찾기" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-800">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        </Link>
      </header>

      <div className="space-y-2 px-4 pt-2">
        <MyStrips slug={slug} />
        {event.status !== 'open' && <Alert kind="info">지금은 운영 시간이 아니에요.</Alert>}
        {urgent && (
          <Link to={`/e/${slug}/schedule`} className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-3 ring-1 ring-red-200">
            <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">긴급</span><span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900">{urgent.title}</span><span className="text-gray-400">›</span>
          </Link>
        )}
        {event.notice && <Alert kind="warn">{event.notice}</Alert>}
      </div>

      {(livePg.length > 0 || nextPg.length > 0) && (
        <Section title="지금" to={`/e/${slug}/schedule`} more="일정 전체">
          <ul className="divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-200">
            {[...livePg, ...nextPg].slice(0, 3).map(g => { const on = new Date(g.starts_at).getTime() <= now; return (
              <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${on ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700'}`}>{on ? '지금' : fmtTime(g.starts_at)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-bold text-gray-900">{g.title}</span>{g.place && <span className="block truncate text-xs text-gray-500">{g.place.name}{on ? ` · ~${fmtTime(g.ends_at)}` : ''}</span>}</span>
              </li>) })}
          </ul>
        </Section>
      )}

      {booths.length > 0 && (
        <Section title="바로 할 수 있어요" to={`/e/${slug}/map`} more="지도에서 보기">
          <ul className="divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-200">
            {booths.slice(0, 4).map(({ p, live }) => (
              <li key={p.id}>
                <button type="button" onClick={() => open(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50">
                  <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-bold text-gray-900">{p.name}</span><span className="block truncate text-xs text-gray-500">{p.booth!.location ?? p.description ?? ''}</span></span>
                  <span className={`shrink-0 text-[17px] font-bold tabular-nums ${TONE_TEXT[live!.tone]}`}>{live!.text}</span>
                </button>
              </li>
            ))}
          </ul>
          {booths.length > 4 && <Link to={`/e/${slug}/booths`} className="mt-2 block text-center text-sm font-semibold text-gray-600 underline">체험 {booths.length}곳 모두 보기</Link>}
        </Section>
      )}

      {foods.length > 0 && (
        <Section title="먹거리" to={`/e/${slug}/food`} more="메뉴 전체">
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {foods.map(({ p, live }) => (
              <button key={p.id} type="button" onClick={() => open(p)} className="w-44 shrink-0 rounded-2xl p-3.5 text-left ring-1 ring-gray-200 active:bg-gray-50">
                <span className="block truncate text-[15px] font-bold text-gray-900">{p.name}</span>
                <span className="mt-1 block h-10 text-xs leading-5 text-gray-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">{p.menu.filter(m => !m.sold_out).slice(0, 4).map(m => m.name).join(' · ')}</span>
                <span className="mt-2 flex items-center justify-between text-xs font-semibold"><span className={p.order_open && !p.order_paused ? 'text-blue-700' : 'text-gray-400'}>{p.order_open ? (p.order_paused ? '주문 잠시 멈춤' : '앱 주문') : '현장 주문'}</span>{live && <span className={TONE_TEXT[live.tone]}>{live.text}</span>}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {markets.length > 0 && (
        <Section title="마켓" to={`/e/${slug}/food?k=market`} more="상품 전체">
          <ul className="divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-200">
            {markets.slice(0, 3).map(({ p }) => (
              <li key={p.id}><button type="button" onClick={() => open(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50">
                <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-bold text-gray-900">{p.name}</span><span className="block truncate text-xs text-gray-500">{p.menu?.length ? p.menu.slice(0, 3).map(m => m.name).join(' · ') : p.description ?? ''}</span></span><span className="text-gray-400">›</span>
              </button></li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="더 즐기기">
        <div className="grid grid-cols-2 gap-2">
          {more.map(m => (
            <Link key={m.to} to={m.to} className="rounded-2xl px-4 py-3.5 ring-1 ring-gray-200 active:bg-gray-50">
              <div className="text-[15px] font-bold text-gray-900">{m.title}</div><div className="truncate text-xs text-gray-500">{m.sub}</div>
            </Link>
          ))}
        </div>
      </Section>
      <p className="pt-6 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>
      <CustomerNav slug={slug} active="now" />
    </div>
  )
}

function Section({ title, to, more, children }: { title: string; to?: string; more?: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-6">
      <div className="mb-2 flex items-baseline justify-between"><h2 className="text-[17px] font-bold text-gray-900">{title}</h2>{to && <Link to={to} className="text-sm font-semibold text-gray-500">{more} ›</Link>}</div>
      {children}
    </section>
  )
}
