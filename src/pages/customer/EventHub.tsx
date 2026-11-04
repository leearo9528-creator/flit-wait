import { useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cachedRpc, rpc } from '../../lib/supabase'
import { useAsync, fmtDate, fmtTime, LS } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import DemoBanner from '../../components/DemoBanner'
import { PROGRAM_KIND_LABEL, type EventSchedule, type StampStatus } from '../../lib/types'

/**
 * 행사 홈(대문) — 통합 QR 이 여는 첫 화면.
 * 배너 → 긴급 공지 → 지금/다음 일정 → 메뉴 카드(체험부스·지도·일정·스탬프) → 내 대기·예약.
 * 마지막으로 연 행사를 기억해 두어 홈 화면 추가(PWA) 로 열면 바로 이 화면으로 온다.
 */
export default function EventHub() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync<EventSchedule>(() => cachedRpc('event_schedule', slug), [slug])
  const stampToken = LS.get<string>(`stamp:${slug}`)
  const stamp = useAsync<StampStatus | null>(async () => data?.event.stamp_enabled && stampToken ? rpc('stamp_status', { p_slug: slug, p_card: stampToken }) : null, [slug, data?.event.stamp_enabled])
  useEffect(() => {
    if (!data?.event) return
    LS.set('lastEvent', slug)
    // 방문 집계 — 세션당 1회
    const k = `viewed:${slug}`
    if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); rpc('track_view', { p_slug: slug, p_page: 'home' }).catch(() => {}) }
  }, [data?.event?.id]) // eslint-disable-line
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 45000)
    return () => clearInterval(iv)
  }, [slug]) // eslint-disable-line

  const now = Date.now()
  const { live, next } = useMemo(() => {
    const ps = data?.programs ?? []
    return {
      live: ps.filter(p => new Date(p.starts_at).getTime() <= now && now < new Date(p.ends_at).getTime()),
      next: ps.find(p => new Date(p.starts_at).getTime() > now) ?? null,
    }
  }, [data?.programs, now])

  if (loading && !data) return <Spinner />
  if (!data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>
  const { event, notices } = data
  const urgent = notices.filter(n => n.urgent)
  const latest = notices.find(n => !n.urgent)
  const closed = event.status !== 'open'
  const accent = event.accent_color || '#f97316'

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <DemoBanner />
      {/* 배너 */}
      <div className="relative">
        {event.image_url
          ? <img src={event.image_url} alt={event.name} className="block aspect-[21/9] w-full object-cover" />
          : <div className="aspect-[21/9] w-full bg-gray-900" />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10 text-white">
          <h1 className="text-2xl font-bold leading-tight">{event.name}</h1>
          <p className="mt-0.5 text-sm text-white/80">{fmtDate(event.starts_at)} ~ {fmtDate(event.ends_at)}</p>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {closed && <Alert kind="info">지금은 운영 시간이 아니에요. ({fmtDate(event.starts_at)} {fmtTime(event.starts_at)} 시작)</Alert>}
        {event.notice && <Alert kind="warn">{event.notice}</Alert>}
        {urgent.map(n => (
          <Link key={n.id} to={`/e/${slug}/schedule`} className="block rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
            <div className="flex items-center gap-2 text-xs"><span className="rounded-full bg-red-600 px-2 py-0.5 font-bold text-white">긴급</span><span className="text-gray-500">{fmtTime(n.publish_at)}</span></div>
            <div className="mt-1 font-semibold text-gray-900">{n.title}</div>
          </Link>
        ))}

        {/* 지금 / 다음 */}
        {(live.length > 0 || next) && (
          <Link to={`/e/${slug}/schedule`} className="block rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-200">
            {live.length > 0 ? (
              <>
                <div className="flex items-center gap-2 text-xs"><span className="rounded-full px-2 py-0.5 font-bold text-white" style={{ background: accent }}>지금 진행 중</span></div>
                {live.slice(0, 2).map(p => (
                  <div key={p.id} className="mt-2">
                    <div className="text-[17px] font-bold text-gray-900">{p.title}</div>
                    <div className="text-sm text-gray-500">~{fmtTime(p.ends_at)} · {PROGRAM_KIND_LABEL[p.kind]}{p.place ? ` · ${p.place.name}` : ''}</div>
                  </div>
                ))}
              </>
            ) : null}
            {next && (
              <div className={live.length ? 'mt-3 border-t border-gray-200 pt-3' : ''}>
                <div className="text-xs font-semibold text-gray-500">다음 일정</div>
                <div className="mt-0.5 text-[15px] font-semibold text-gray-900">{fmtTime(next.starts_at)} {next.title}</div>
                {next.place && <div className="text-sm text-gray-500">{next.place.name}</div>}
              </div>
            )}
          </Link>
        )}

        {/* 메뉴 */}
        <div className="grid grid-cols-2 gap-3">
          <Menu to={`/e/${slug}/booths`} icon="🎪" title="체험부스" sub={event.booth_count > 0 ? `${event.booth_count}개 · 대기·예약` : '대기·예약'} />
          <Menu to={`/e/${slug}/map`} icon="🗺️" title="행사장 지도" sub={event.map_image_url ? '부스·먹거리·화장실' : '준비 중'} />
          <Menu to={`/e/${slug}/schedule`} icon="📅" title="일정·안내" sub={data.programs.length ? `일정 ${data.programs.length}개` : '공지·안내'} />
          {event.stamp_enabled
            ? <Menu to={`/e/${slug}/stamp`} icon="🔖" title="스탬프 투어" sub={stamp.data ? `${stamp.data.count} / ${stamp.data.goal} 모음` : '부스 돌고 경품'} accent={accent} />
            : <Menu to={`/e/${slug}/my`} icon="🎫" title="내 대기·예약" sub="현황 확인" />}
        </div>
        {(event.draw_open || event.survey_enabled) && (
          <div className="grid grid-cols-2 gap-3">
            {event.draw_open && <Menu to={`/e/${slug}/draw`} icon="🎁" title="럭키드로우" sub="응모하고 경품 받기" accent={event.stamp_enabled ? undefined : accent} />}
            {event.survey_enabled && <Menu to={`/e/${slug}/survey`} icon="💬" title="한마디 남기기" sub="30초 만족도 설문" />}
          </div>
        )}

        {(event.directions_text || event.lat != null) && (
          <Link to={`/e/${slug}/map`} className="block rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-200">
            <div className="text-xs font-semibold text-gray-500">오시는 길 · 주차</div>
            <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-gray-800">{event.directions_text || '지도에서 길찾기'}</p>
          </Link>
        )}
        {latest && (
          <Link to={`/e/${slug}/schedule`} className="block rounded-xl px-1 py-1 text-sm text-gray-600">
            <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">공지</span>{latest.title}
          </Link>
        )}
        <p className="pt-4 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>
      </div>
      <CustomerNav slug={slug} active="hub" />
    </div>
  )
}

function Menu({ to, icon, title, sub, accent }: { to: string; icon: string; title: string; sub: string; accent?: string }) {
  return (
    <Link to={to} className={`flex flex-col rounded-2xl p-4 ring-1 active:scale-[0.98] ${accent ? 'text-white' : 'bg-white text-gray-900 ring-gray-200'}`} style={accent ? { background: accent, boxShadow: `0 0 0 1px ${accent}` } : undefined}>
      <span className="text-2xl leading-none">{icon}</span>
      <span className="mt-3 text-[17px] font-bold">{title}</span>
      <span className={`mt-0.5 text-xs ${accent ? 'text-white/80' : 'text-gray-500'}`}>{sub}</span>
    </Link>
  )
}
