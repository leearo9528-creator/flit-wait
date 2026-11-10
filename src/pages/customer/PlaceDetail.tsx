import { useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { cachedRpc, DEMO } from '../../lib/supabase'
import { useAsync } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import { PLACE_KIND_LABEL, type EventGuide } from '../../lib/types'
import { liveOf, TONE_PIN, TONE_TEXT } from '../../lib/live'

/**
 * 장소 상세 — 지도 핀·목록을 누르면 오는 화면. 체험·먹거리·마켓·편의시설 모두 같은 틀이다.
 * 위: 배치도에서 그 자리를 확대한 그림 / 가운데: 이름·지금 대기·설명·메뉴 / 아래: 줄서기·회차 예약 버튼(체험만)
 */
export default function PlaceDetail() {
  const { slug = '', placeId = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync<EventGuide>(() => cachedRpc('event_guide', slug), [slug])
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, DEMO ? 6000 : 20000)
    return () => clearInterval(iv)
  }, [slug]) // eslint-disable-line

  if (loading && !data) return <Spinner />
  const p = data?.places.find(x => x.id === placeId)
  if (!data?.event || !p) return <div className="p-6"><Alert kind="error">{error ?? '장소를 찾을 수 없습니다.'}</Alert><Link to={`/e/${slug}`} className="mt-4 block text-center text-sm font-semibold underline">지도로 돌아가기</Link></div>
  const { event } = data
  const b = p.booth
  const live = liveOf(p)
  const to = b && !b.is_paused ? (b.mode === 'queue' ? `/q/${b.slug}` : `/r/${b.slug}`) : null
  const sub = b
    ? (b.mode === 'queue' ? (b.waiting_teams > 0 ? `지금 ${b.waiting_teams}팀이 기다리고 있어요` : '기다리는 팀이 없어요') : b.today_left > 0 ? `오늘 남은 자리 ${b.today_left}석` : '오늘 회차가 모두 찼어요')
    : null

  return (
    <div className={`mx-auto min-h-dvh max-w-md bg-white ${to ? 'pb-40' : 'pb-24'}`}>
      {/* 배치도에서 이 장소 주변을 확대해 보여 준다 */}
      <div className="relative">
        {p.image_url
          ? <img src={p.image_url} alt="" className="block aspect-[16/10] w-full object-cover" />
          : event.map_image_url
            ? <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100" style={{ backgroundImage: `url(${event.map_image_url})`, backgroundSize: '240%', backgroundPosition: `${p.x}% ${Math.max(0, Math.min(100, p.y - 6))}%`, backgroundRepeat: 'no-repeat' }}>
                <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
                  {live && b ? <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[15px] font-bold tabular-nums shadow-md ring-2 ring-white ${TONE_PIN[live.tone]}`}>{live.text}</span>
                    : <span className="h-5 w-5 rounded-full bg-blue-700 shadow ring-4 ring-white" />}
                  <span className="-mt-px h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-white" />
                </span>
              </div>
            : <div className="aspect-[16/10] w-full bg-gray-100" />}
        <button type="button" onClick={() => (history.length > 1 ? nav(-1) : nav(`/e/${slug}`))} aria-label="뒤로" className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-gray-900 shadow ring-1 ring-gray-200 active:bg-gray-50">‹</button>
      </div>

      <div className="px-4 pt-5">
        <div className="text-sm text-gray-500">{PLACE_KIND_LABEL[p.kind]}{b?.location ? ` · ${b.location}` : ''}{p.hours ? ` · ${p.hours}` : ''}</div>
        <h1 className="mt-0.5 text-2xl font-bold leading-tight text-gray-900">{p.name}</h1>
        {p.description && <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{p.description}</p>}

        {live && (
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-4 ring-1 ring-gray-200">
            <div>
              <div className="text-sm font-semibold text-gray-500">{b ? (b.mode === 'queue' ? '지금 대기' : '다음 회차') : '지금 혼잡도'}</div>
              {sub && <div className="mt-0.5 text-sm text-gray-600">{sub}</div>}
            </div>
            <div className={`text-3xl font-bold tabular-nums ${TONE_TEXT[live.tone]}`}>{live.text}</div>
          </div>
        )}

        {p.menu?.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-500">메뉴</h2>
            <ul className="mt-2 divide-y divide-gray-100">
              {p.menu.map((m, i) => <li key={i} className="flex justify-between gap-3 py-3 text-[16px]"><span className="font-semibold text-gray-900">{m.name}</span>{m.price && <span className="shrink-0 tabular-nums text-gray-600">{m.price}</span>}</li>)}
            </ul>
          </div>
        )}
        <p className="pt-8 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>
      </div>

      {to && (
        <div className="fixed inset-x-0 bottom-14 z-20 mx-auto max-w-md bg-white/95 px-4 pb-3 pt-3 backdrop-blur" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <Link to={to} className="flex h-14 items-center justify-center rounded-2xl bg-gray-900 text-[17px] font-bold text-white active:bg-gray-800">{b!.mode === 'queue' ? '줄서기' : '회차 예약하기'}</Link>
        </div>
      )}
      <CustomerNav slug={slug} active="hub" />
    </div>
  )
}
