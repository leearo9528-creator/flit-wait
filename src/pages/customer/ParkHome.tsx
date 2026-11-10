import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fitMap, mapMeters, fmtMeters, type Fit } from '../../lib/geo'
import { cachedRpc, rpc, DEMO } from '../../lib/supabase'
import { useAsync, fmtTime, LS } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import DemoBanner from '../../components/DemoBanner'
import { PLACE_KIND_LABEL, type EventGuide, type EventSchedule, type GuidePlace, type PlaceKind } from '../../lib/types'
import MyStrips from '../../components/MyStrips'
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
  const [q, setQ] = useState('')
  const { data, error, loading, reload } = useAsync<EventGuide>(() => cachedRpc('event_guide', slug), [slug])
  // 지도에 올리지 않은 부스도 목록에는 나와야 한다 (부스만 만들고 배치도를 안 쓴 행사)
  const sum = useAsync<{ booths: any[] } | null>(() => cachedRpc('event_summary', slug), [slug])
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') { reload(); sum.reload() } }, DEMO ? 6000 : 20000 + Math.random() * 5000)
    const onVis = () => { if (document.visibilityState === 'visible') { reload(); sum.reload() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [slug]) // eslint-disable-line

  const [view, setView] = useState<'map' | 'list'>(() => LS.get<'map' | 'list'>(`view:${slug}`) ?? 'map')
  const [picked, setGroup] = useState<Group | null>(null)
  const nav = useNavigate()

  // ── 내 위치 · 가는 길 ──
  // 내 위치: 폰 GPS 를 그림 지도 좌표로 옮긴다. 장소 2곳 이상에 실제 좌표(위도·경도)가 있어야 맞출 수 있다 (없으면 버튼을 숨긴다).
  // 가는 길: ?to=<장소 id> — 그 장소를 지도에 띄우고, 내 위치가 있으면 선과 거리를 보여 준다.
  const [sp, setSp] = useSearchParams()
  const toId = sp.get('to')
  const [searching, setSearching] = useState(() => sp.get('find') === '1')
  const [aspect, setAspect] = useState(0)                      // 지도 그림의 세로/가로
  const [locOn, setLocOn] = useState(() => { try { return sessionStorage.getItem('loc:on') === '1' } catch { return false } })
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null)
  const [demoMe, setDemoMe] = useState<{ x: number; y: number } | null>(null)
  const [locErr, setLocErr] = useState<string | null>(null)
  const turnLoc = (on: boolean) => { setLocOn(on); setLocErr(null); if (!on) { setPos(null); setDemoMe(null) } try { sessionStorage.setItem('loc:on', on ? '1' : '0') } catch { /* 저장소 없음 */ } }
  useEffect(() => {
    if (!locOn) return
    if (DEMO) {   // 데모: 입구 근처를 천천히 걷는 가짜 위치
      const step = () => setDemoMe({ x: 47 + 4 * Math.sin(Date.now() / 9000), y: 82 + 2 * Math.cos(Date.now() / 7000) })
      step(); const iv = setInterval(step, 1500); return () => clearInterval(iv)
    }
    if (!navigator.geolocation) { setLocErr('이 기기에서는 위치를 쓸 수 없어요.'); turnLoc(false); return }
    const id = navigator.geolocation.watchPosition(
      g => { setPos({ lat: g.coords.latitude, lng: g.coords.longitude, acc: g.coords.accuracy }); setLocErr(null) },
      e => { turnLoc(false); setLocErr(e.code === 1 ? '위치 권한을 허용해 주세요.' : '위치를 찾지 못했어요.') },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [locOn]) // eslint-disable-line
  const fit: Fit | null = useMemo(() => {
    if (!(aspect > 0)) return null
    if (DEMO) return { aspect, mPerUnit: 2.2, toMap: () => ({ x: 50, y: 50 }) }   // 데모 지도는 가로 220m 로 친다
    return fitMap((data?.places ?? []).filter(p => p.x != null && p.y != null && p.lat != null && p.lng != null).map(p => ({ x: Number(p.x), y: Number(p.y), lat: Number(p.lat), lng: Number(p.lng) })), aspect)
  }, [data?.places, aspect])
  const me = DEMO ? demoMe : fit && pos ? fit.toMap(pos.lat, pos.lng) : null
  // 가는 길을 열면 위치도 같이 켠다 (맞출 수 있을 때만)
  useEffect(() => { if (toId && fit && !locOn) turnLoc(true) }, [toId, !!fit]) // eslint-disable-line
  const clearTo = () => { sp.delete('to'); setSp(sp, { replace: true }) }
  const goTo = (id: string) => { sp.set('to', id); setSp(sp, { replace: true }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const pickView = (v: 'map' | 'list') => { setView(v); LS.set(`view:${slug}`, v) }

  const rows = useMemo(() => {
    const places = data?.places ?? [], onMap = new Set(places.map(p => p.booth?.id).filter(Boolean))
    const loose: GuidePlace[] = (sum.data?.booths ?? []).filter(b => !onMap.has(b.id)).map((b, i) => ({
      id: `booth:${b.slug}`, kind: 'booth', name: b.name, description: b.description ?? null, image_url: b.image_url ?? null, x: null, y: null, sort_order: 9000 + i, menu: [], hours: null,
      booth: { id: b.id, slug: b.slug, mode: b.mode, is_paused: b.is_paused, location: b.location ?? null, waiting_teams: b.waiting_teams ?? 0, today_left: b.today_left ?? 0, next_slot_at: b.next_slot_at ?? null },
    } as unknown as GuidePlace))
    return [...places, ...loose].map(p => ({ p, live: liveOf(p) }))
  }, [data?.places, sum.data])
  // 배치도에 없는 부스는 상세 화면이 없으니 바로 줄서기·예약으로 보낸다
  const open = (p: GuidePlace) => nav(p.id.startsWith('booth:') ? (p.booth!.mode === 'slot' ? `/r/${p.booth!.slug}` : `/q/${p.booth!.slug}`) : `/e/${slug}/p/${p.id}`)
  // 한 번에 한 종류만 보여 준다 — 처음엔 대기가 있는 체험 (없으면 첫 종류). 핀 이름표가 서로 가리지 않게 하려는 것
  const groups = useMemo(() => GROUPS.filter(g => rows.some(r => groupOf(r.p.kind) === g.id)), [rows])
  const group = picked && groups.some(g => g.id === picked) ? picked : groups[0]?.id
  const shown = useMemo(() => rows.filter(r => groupOf(r.p.kind) === group), [rows, group])
  // 목록: 대기가 있는 곳(체험) 먼저, 그 안에서 짧은 순 → 나머지는 원래 순서
  const listed = useMemo(() => [...shown].sort((a, b) => Number(!!b.p.booth) - Number(!!a.p.booth) || (a.p.booth && b.p.booth ? (a.live?.sort ?? 0) - (b.live?.sort ?? 0) : 0)), [shown])

  // 찾기 — 장소 이름 · 설명 · 메뉴(상품) 이름. 종류와 상관없이 전체에서 찾는다
  const term = q.trim().toLowerCase()
  const hits = useMemo(() => !term ? [] : rows.map(r => {
    const inName = `${r.p.name} ${r.p.description ?? ''}`.toLowerCase().includes(term)
    const items = (r.p.menu ?? []).filter(m => m.name.toLowerCase().includes(term))
    return inName || items.length ? { ...r, items } : null
  }).filter(Boolean) as { p: GuidePlace; live: Live | null; items: GuidePlace['menu'] }[], [rows, term])

  if (loading && !data) return <Spinner />
  if (!data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>
  const { event } = data
  const hasMap = !!event.map_image_url
  const target = toId ? rows.find(r => r.p.id === toId && r.p.x != null)?.p ?? null : null
  const mode = hasMap ? (target ? 'map' : view) : 'list'
  const meIn = !!me && me.x > -5 && me.x < 105 && me.y > -5 && me.y < 105
  const dist = target && me && fit ? mapMeters(fit, me, { x: Number(target.x), y: Number(target.y) }) : null
  const zone = group === 'food' || group === 'market'
  const zonePins = (['food', 'market'] as const).map(id => {
    const ps = rows.map(r => r.p).filter(p => groupOf(p.kind) === id && p.x != null && p.y != null)
    return { id, label: id === 'food' ? '먹거리' : '마켓', n: ps.length, x: ps.reduce((a, p) => a + Number(p.x), 0) / (ps.length || 1), y: ps.reduce((a, p) => a + Number(p.y), 0) / (ps.length || 1) }
  }).filter(z => z.n > 0)

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <DemoBanner />
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-bold leading-tight text-gray-900">{event.name}</h1>
          </div>
          <button type="button" onClick={() => setSearching(v => { if (v) setQ(''); return !v })} aria-label="찾기" aria-pressed={searching}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${searching ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          </button>
          {hasMap && (
            <div className="flex shrink-0 rounded-full bg-gray-100 p-0.5 text-sm font-semibold">
              {(['map', 'list'] as const).map(v => (
                <button key={v} type="button" onClick={() => pickView(v)} className={`rounded-full px-3.5 py-1.5 ${mode === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{v === 'map' ? '지도' : '목록'}</button>
              ))}
            </div>
          )}
        </div>
        {searching && (
          <div className="flex items-center gap-2 px-4 py-3">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} type="search" enterKeyHint="search" placeholder="떡볶이, 화장실, 키링…" aria-label="장소·메뉴 찾기"
              className="h-11 min-w-0 flex-1 rounded-full bg-gray-100 px-4 text-[15px] text-gray-900 placeholder:text-gray-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 [&::-webkit-search-cancel-button]:hidden" />
            <button type="button" onClick={() => { setQ(''); setSearching(false) }} className="shrink-0 px-2 text-[15px] font-semibold text-gray-700">닫기</button>
          </div>
        )}
        <div className={`flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] ${searching ? 'hidden' : ''}`}>
          {groups.map(g => (
            <button key={g.id} type="button" onClick={() => setGroup(g.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold ring-1 ${group === g.id ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-800 ring-gray-300 active:bg-gray-50'}`}>{g.label}</button>
          ))}
        </div>
      </header>

      <div className="space-y-2 px-4">
        {/* 내 대기·예약 — 줄 서 있는 동안 지도에서도 차례가 보인다 */}
        <MyStrips slug={slug} />
        {target && (
          <div className="flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-3 text-white">
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{target.name}</span>
            {dist != null && <span className="shrink-0 text-[15px] font-bold tabular-nums">{fmtMeters(dist)}{dist >= 15 ? ` · 걸어서 ${Math.max(1, Math.round(dist / 70))}분` : ''}</span>}
            <button type="button" onClick={clearTo} aria-label="가는 길 닫기" className="-mr-1 shrink-0 px-2 text-lg leading-none opacity-80">✕</button>
          </div>
        )}
        {locErr && <Alert kind="warn">{locErr}</Alert>}
      </div>

      {term && (
        <ul className="mt-1 divide-y divide-gray-100 px-4">
          {hits.map(({ p, live, items }) => (
            <li key={p.id}>
              <button type="button" onClick={() => open(p)} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500">{PLACE_KIND_LABEL[p.kind]}{p.order_open ? ' · 앱 주문' : ''}</div>
                  <div className="truncate text-[17px] font-bold text-gray-900">{p.name}</div>
                  {items.length > 0 && <div className="truncate text-sm text-gray-700">{items.slice(0, 3).map(m => `${m.name}${m.sold_out ? ' (품절)' : m.price ? ` ${m.price}` : ''}`).join(' · ')}</div>}
                </div>
                {live && <span className={`shrink-0 text-right text-[17px] font-bold tabular-nums ${TONE_TEXT[live.tone]}`}>{live.text}</span>}
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="py-16 text-center text-sm text-gray-400">'{q.trim()}' — 찾는 곳이 없어요.</li>}
        </ul>
      )}
      {!term && mode === 'map' && (
        <div className="relative mt-3">
          <img src={event.map_image_url!} alt={`${event.name} 배치도`} className="block w-full select-none" draggable={false}
            onLoad={e => { const im = e.currentTarget; if (im.naturalWidth) setAspect(im.naturalHeight / im.naturalWidth) }} />
          {/* 내 위치 → 목적지 선 */}
          {target && me && meIn && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <line x1={`${me.x}%`} y1={`${me.y}%`} x2={`${target.x}%`} y2={`${target.y}%`} stroke="#fff" strokeWidth="7" strokeLinecap="round" />
              <line x1={`${me.x}%`} y1={`${me.y}%`} x2={`${target.x}%`} y2={`${target.y}%`} stroke="#1d4ed8" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" />
            </svg>
          )}
          {/* 구역 핀 — 먹거리·마켓 자리(가게들의 한가운데)에 자동으로 뜬다. 누르면 그 구역의 가게·메뉴가 아래에 펼쳐진다 */}
          {!target && zonePins.filter(z => z.id !== group).map(z => (
            <button key={z.id} type="button" onClick={() => { setGroup(z.id); setTimeout(() => document.getElementById('zone')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-gray-900 shadow-md ring-1 ring-gray-300 transition active:scale-95" style={{ left: `${z.x}%`, top: `${z.y}%` }}>
              {z.label} {z.n}곳 ›
            </button>
          ))}
          {shown.filter(({ p }) => p.x != null && p.y != null && p.id !== target?.id).map(({ p, live }) => <Pin key={p.id} p={p} live={live} onClick={() => open(p)} />)}
          {target && (
            <>
              <span className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-blue-600/40" style={{ left: `${target.x}%`, top: `${target.y}%` }} />
              <Pin p={target} live={liveOf(target)} onClick={() => open(target)} />
            </>
          )}
          {me && meIn && (
            <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${me.x}%`, top: `${me.y}%` }} aria-label="내 위치">
              <span className="block h-4 w-4 rounded-full bg-blue-600 shadow ring-[3px] ring-white" />
            </span>
          )}
          {fit && (
            <button type="button" onClick={() => turnLoc(!locOn)} aria-pressed={locOn} aria-label="내 위치"
              className={`absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full shadow-md ring-1 active:scale-95 ${locOn ? 'bg-blue-700 text-white ring-blue-700' : 'bg-white text-gray-800 ring-gray-300'}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="7.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
            </button>
          )}
        </div>
      )}
      {!term && mode === 'map' && me && !meIn && locOn && <p className="px-4 pt-2 text-sm text-gray-600">지금은 행사장 밖에 계세요.</p>}
      {!term && mode === 'map' && event.map_note && <p className="px-4 pt-2 text-xs text-gray-500">{event.map_note}</p>}

      {/* 먹거리 · 마켓: 그 구역의 가게와 메뉴(상품)를 한 화면에 다 편다 — 가게를 하나씩 열어 보지 않아도 뭐가 있는지 보인다 */}
      {!term && zone && (
        <div id="zone" className={`scroll-mt-40 space-y-3 px-4 ${mode === 'map' ? 'mt-3' : 'mt-1'}`}>
          <div className="text-sm font-semibold text-gray-500">{group === 'food' ? '먹거리' : '마켓'} {listed.length}곳 · {group === 'food' ? '메뉴' : '상품'} {listed.reduce((a, r) => a + (r.p.menu?.length ?? 0), 0)}가지</div>
          {listed.map(({ p, live }) => (
            <section key={p.id} className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
              <button type="button" onClick={() => open(p)} className="flex w-full items-center gap-3 bg-gray-50 px-4 py-3 text-left active:bg-gray-100">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-bold text-gray-900">{p.name}</div>
                  <div className="truncate text-xs text-gray-500">{[p.description, p.hours].filter(Boolean).join(' · ')}{p.order_open ? <span className="font-semibold text-blue-700">{p.description || p.hours ? ' · ' : ''}{p.order_paused ? '주문 잠시 멈춤' : '앱 주문'}</span> : null}</div>
                </div>
                {live && <span className={`shrink-0 text-[15px] font-bold ${TONE_TEXT[live.tone]}`}>{live.text}</span>}
                <span className="shrink-0 text-gray-400">›</span>
              </button>
              {(p.menu?.length ?? 0) > 0
                ? <ul className="divide-y divide-gray-100 px-4">
                    {p.menu.map((m, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => open(p)} className={`flex w-full items-center gap-3 py-2.5 text-left ${m.sold_out ? 'opacity-50' : ''}`}>
                          {m.image_url && <img src={m.image_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-gray-100 object-cover" />}
                          <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-gray-900">{m.name}</span>{m.desc && <span className="block truncate text-xs text-gray-500">{m.desc}</span>}</span>
                          <span className="shrink-0 text-[15px] tabular-nums text-gray-700">{m.sold_out ? '품절' : m.price}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                : <p className="px-4 py-3 text-sm text-gray-400">{group === 'food' ? '메뉴' : '상품'}는 현장에서 확인해 주세요.</p>}
            </section>
          ))}
        </div>
      )}
      <ul className={`divide-y divide-gray-100 px-4 ${mode === 'map' ? 'mt-2' : 'mt-1'} ${term || zone ? 'hidden' : ''}`}>
        {listed.map(({ p, live }) => (
          <li key={p.id}>
            <button type="button" onClick={() => open(p)} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-500">{PLACE_KIND_LABEL[p.kind]}{p.booth?.location ? ` · ${p.booth.location}` : p.hours ? ` · ${p.hours}` : ''}{p.order_open ? <span className="font-semibold text-blue-700"> · 앱 주문</span> : null}</div>
                <div className="truncate text-[17px] font-bold text-gray-900">{p.name}</div>
                {p.booth && p.booth.mode === 'queue' && p.booth.waiting_teams > 0 && !live?.text.endsWith('팀') && <div className="text-xs text-gray-500">대기 {p.booth.waiting_teams}팀</div>}
                {p.booth && p.booth.mode !== 'queue' && p.booth.today_left > 0 && <div className="text-xs text-gray-500">오늘 잔여 {p.booth.today_left}석</div>}
                {!p.booth && p.menu?.length > 0 && <div className="truncate text-xs text-gray-500">{p.menu.slice(0, 3).map(m => m.name).join(' · ')}</div>}
              </div>
              {live && <span className={`shrink-0 text-right text-[17px] font-bold tabular-nums ${TONE_TEXT[live.tone]}`}>{live.text}</span>}
              {hasMap && group === 'etc' && p.x != null && (
                <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); toId === p.id ? clearTo() : goTo(p.id) }}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ${toId === p.id ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-900 ring-gray-300'}`}>가는 길</span>
              )}
            </button>
          </li>
        ))}
        {listed.length === 0 && <li className="py-16 text-center text-sm text-gray-400">표시할 장소가 없어요.</li>}
      </ul>

      <p className="pt-6 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>

      <CustomerNav slug={slug} active="map" />
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
