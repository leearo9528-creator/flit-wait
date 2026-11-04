import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cachedRpc } from '../../lib/supabase'
import { useAsync } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import { PLACE_KIND_LABEL, type EventGuide, type GuidePlace, type PlaceKind } from '../../lib/types'

/**
 * 행사장 지도 — 배치도 이미지 위에 핀, 핀을 누르면 아래에서 카드가 올라온다.
 * 핀 좌표는 이미지 기준 백분율(places.x / y) 이라 어떤 화면 크기에서도 같은 자리에 찍힌다.
 * 지도를 핀치 줌 하려면 이미지 영역을 가로 스크롤 가능하게 두고(2배 폭 토글), 브라우저 기본 줌을 막지 않는다.
 */
export default function EventMap() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync<EventGuide>(() => cachedRpc('event_guide', slug), [slug])
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 30000 + Math.random() * 5000)
    return () => clearInterval(iv)
  }, [slug]) // eslint-disable-line

  const [kind, setKind] = useState<PlaceKind | ''>('')
  const [sel, setSel] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)

  const kinds = useMemo(() => {
    const out: PlaceKind[] = []
    for (const p of data?.places ?? []) if (!out.includes(p.kind)) out.push(p.kind)
    return out
  }, [data?.places])
  const places = useMemo(() => (data?.places ?? []).filter(p => !kind || p.kind === kind), [data?.places, kind])
  const selected = useMemo(() => data?.places.find(p => p.id === sel) ?? null, [data?.places, sel])

  // 핀을 고르면 지도에서 그 핀이 보이도록 스크롤 (확대 상태일 때)
  useEffect(() => {
    if (!selected || !zoom || !mapRef.current) return
    const el = mapRef.current
    el.scrollTo({ left: (selected.x / 100) * el.scrollWidth - el.clientWidth / 2, behavior: 'smooth' })
  }, [selected?.id, zoom]) // eslint-disable-line

  if (loading) return <Spinner />
  if (!data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>
  const { event } = data
  const toEvent = event.lat != null && event.lng != null ? kakaoTo(event.name, event.lat, event.lng) : null

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-28">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4">
          <h1 className="flex-1 text-xl font-bold">행사장 지도</h1>
          {event.map_image_url && (
            <button type="button" onClick={() => setZoom(z => !z)} className="rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-gray-300 active:bg-gray-50">
              {zoom ? '전체 보기' : '확대'}
            </button>
          )}
        </div>
        {kinds.length > 1 && (
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            <Chip on={kind === ''} onClick={() => setKind('')}>전체</Chip>
            {kinds.map(k => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{PLACE_KIND_LABEL[k]}</Chip>)}
          </div>
        )}
      </header>

      {event.notice && <div className="px-4 pb-3"><Alert kind="warn">{event.notice}</Alert></div>}

      {/* 지도 */}
      {event.map_image_url ? (
        <div ref={mapRef} className={`relative ${zoom ? 'overflow-x-auto' : ''}`}>
          <div className={`relative ${zoom ? 'w-[200%]' : 'w-full'}`}>
            <img src={event.map_image_url} alt={`${event.name} 배치도`} className="block w-full select-none" draggable={false} />
            {places.map(p => (
              <Pin key={p.id} p={p} on={sel === p.id} onClick={() => setSel(sel === p.id ? null : p.id)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-4 flex aspect-[4/3] items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-400">배치도 준비 중이에요</div>
      )}
      {event.map_note && <p className="px-4 pt-2 text-xs text-gray-500">{event.map_note}</p>}

      {/* 행사장까지 길찾기 */}
      {toEvent && (
        <div className="px-4 pt-3">
          <a href={toEvent} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center rounded-xl bg-gray-900 text-[15px] font-semibold text-white active:bg-gray-800">
            행사장까지 길찾기 (카카오맵)
          </a>
        </div>
      )}

      {/* 목록 */}
      <ul className="mt-4 divide-y divide-gray-100 px-4">
        {places.map(p => (
          <li key={p.id}>
            <button type="button" onClick={() => { setSel(p.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className={`flex w-full items-center gap-3 py-3.5 text-left active:bg-gray-50 ${sel === p.id ? 'bg-gray-50' : ''}`}>
              <KindDot kind={p.kind} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-500">{PLACE_KIND_LABEL[p.kind]}{p.hours ? ` · ${p.hours}` : ''}</div>
                <div className="truncate text-[17px] font-bold text-gray-900">{p.name}</div>
              </div>
              {p.booth && <LiveLine b={p.booth} compact />}
            </button>
          </li>
        ))}
        {places.length === 0 && <li className="py-16 text-center text-sm text-gray-400">표시할 장소가 없어요.</li>}
      </ul>
      <p className="pt-6 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>

      {/* 선택 카드 (바텀 시트) */}
      {selected && <PlaceSheet p={selected} eventName={event.name} onClose={() => setSel(null)} />}

      <CustomerNav slug={event.slug} active="map" />
    </div>
  )
}

const KIND_COLOR: Record<PlaceKind, string> = {
  booth: 'bg-orange-500', food: 'bg-red-500', market: 'bg-amber-500', stage: 'bg-purple-500', facility: 'bg-sky-500', info: 'bg-gray-800', other: 'bg-gray-500',
}
const KIND_INITIAL: Record<PlaceKind, string> = { booth: '체', food: '식', market: '마', stage: '무', facility: '편', info: '안', other: '·' }

function Pin({ p, on, onClick }: { p: GuidePlace; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={p.name}
      className="absolute -translate-x-1/2 -translate-y-full"
      style={{ left: `${p.x}%`, top: `${p.y}%` }}>
      <span className={`flex flex-col items-center ${on ? 'scale-125' : ''} transition-transform`}>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ring-2 ring-white ${KIND_COLOR[p.kind]}`}>{KIND_INITIAL[p.kind]}</span>
        <span className={`-mt-0.5 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-white`} />
      </span>
      {on && <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">{p.name}</span>}
    </button>
  )
}

function KindDot({ kind }: { kind: PlaceKind }) {
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${KIND_COLOR[kind]}`}>{KIND_INITIAL[kind]}</span>
}

function LiveLine({ b, compact }: { b: NonNullable<GuidePlace['booth']>; compact?: boolean }) {
  const text = b.is_paused ? '접수 중단'
    : b.mode === 'queue' ? `대기 ${b.waiting_teams}팀`
    : b.today_left > 0 ? `오늘 잔여 ${b.today_left}석` : b.waiting_teams > 0 ? `현장 대기 ${b.waiting_teams}팀` : '오늘 예약 마감'
  return <span className={`shrink-0 font-semibold tabular-nums ${b.is_paused ? 'text-gray-400' : 'text-orange-500'} ${compact ? 'text-sm' : 'text-[15px]'}`}>{text}</span>
}

function PlaceSheet({ p, eventName, onClose }: { p: GuidePlace; eventName: string; onClose: () => void }) {
  const to = p.booth ? (p.booth.mode === 'queue' ? `/q/${p.booth.slug}` : `/r/${p.booth.slug}`) : null
  const nav = p.lat != null && p.lng != null ? kakaoTo(`${eventName} ${p.name}`, p.lat, p.lng) : null
  return (
    <div className="fixed inset-x-0 bottom-14 z-30 mx-auto max-w-md px-3" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="rounded-2xl bg-white p-4 shadow-xl ring-1 ring-gray-200">
        <div className="flex items-start gap-3">
          {p.image_url ? <img src={p.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <KindDot kind={p.kind} />}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500">{PLACE_KIND_LABEL[p.kind]}{p.booth?.location ? ` · ${p.booth.location}` : ''}{p.hours ? ` · ${p.hours}` : ''}</div>
            <div className="text-lg font-bold leading-tight text-gray-900">{p.name}</div>
            {p.description && <p className="mt-1 text-sm leading-snug text-gray-600">{p.description}</p>}
            {p.booth && <div className="mt-1.5"><LiveLine b={p.booth} /></div>}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-1 -mt-1 rounded-full p-1.5 text-gray-400 active:bg-gray-100">✕</button>
        </div>
        {(to || nav) && (
          <div className="mt-3 flex gap-2">
            {to && <Link to={to} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-gray-900 text-[15px] font-semibold text-white active:bg-gray-800">{p.booth!.mode === 'queue' ? '대기 접수' : '예약하기'}</Link>}
            {nav && <a href={nav} target="_blank" rel="noreferrer" className="flex h-11 flex-1 items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-gray-900 ring-1 ring-gray-300 active:bg-gray-50">길찾기</a>}
          </div>
        )}
      </div>
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

/** 카카오맵 길찾기 링크 — 앱이 있으면 앱, 없으면 웹으로 열린다 */
function kakaoTo(name: string, lat: number, lng: number) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`
}
