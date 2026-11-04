import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { cachedRpc } from '../../lib/supabase'
import { useAsync, fmtTime, LS } from '../../lib/util'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import { PROGRAM_KIND_LABEL, type EventSchedule as Schedule } from '../../lib/types'
import { kstYmd } from '../../components/BoothCard'

/** 일정·안내 — 공지(긴급·고정 먼저) / 날짜별 타임테이블(지금 진행 중 강조) / 행사 안내·연락처 */
export default function EventSchedule() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync<Schedule>(() => cachedRpc('event_schedule', slug), [slug])
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 30000 + Math.random() * 5000)
    return () => clearInterval(iv)
  }, [slug]) // eslint-disable-line
  const [, tick] = useState(0)
  useEffect(() => { const iv = setInterval(() => tick(t => t + 1), 60000); return () => clearInterval(iv) }, [])

  const days = useMemo(() => {
    const out: string[] = []
    for (const p of data?.programs ?? []) { const d = kstYmd(p.starts_at); if (!out.includes(d)) out.push(d) }
    return out.sort()
  }, [data?.programs])
  const today = kstYmd(new Date())
  const [day, setDay] = useState<string>('')
  // ★ 찜 — 기기(localStorage)에만 저장. 페스티벌 타임테이블 앱들의 기본 기능
  const [fav, setFav] = useState<string[]>(() => LS.get<string[]>(`fav:${slug}`) ?? [])
  const [onlyFav, setOnlyFav] = useState(false)
  const toggleFav = (id: string) => setFav(f => { const n = f.includes(id) ? f.filter(x => x !== id) : [...f, id]; LS.set(`fav:${slug}`, n); return n })
  const curDay = day || (days.includes(today) ? today : days[0] ?? '')
  const list = useMemo(() => (data?.programs ?? []).filter(p => kstYmd(p.starts_at) === curDay && (!onlyFav || fav.includes(p.id))), [data?.programs, curDay, onlyFav, fav])

  if (loading) return <Spinner />
  if (!data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>
  const { event, notices } = data
  const now = Date.now()

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center px-4"><h1 className="text-xl font-bold">일정·안내</h1></div>
      </header>
      <div className="px-4">
        {event.notice && <div className="mb-3"><Alert kind="warn">{event.notice}</Alert></div>}

        {/* 공지 */}
        {notices.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-gray-500">공지</h2>
            <ul className="space-y-2">
              {notices.map(n => (
                <li key={n.id} className={`rounded-xl px-4 py-3 ring-1 ${n.urgent ? 'bg-red-50 ring-red-200' : 'bg-gray-50 ring-gray-200'}`}>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {n.urgent && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">긴급</span>}
                    {n.pinned && <span>고정</span>}
                    <span>{fmtDayTime(n.publish_at)}</span>
                  </div>
                  <div className="mt-1 font-semibold text-gray-900">{n.title}</div>
                  {n.body && <p className="mt-1 whitespace-pre-line text-sm leading-snug text-gray-700">{n.body}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 타임테이블 */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500">타임테이블</h2>
            {fav.length > 0 && <button type="button" onClick={() => setOnlyFav(v => !v)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${onlyFav ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-300'}`}>★ 찜한 것만 {fav.length}</button>}
          </div>
          {days.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {days.map(d => (
                <button key={d} type="button" onClick={() => setDay(d)}
                  className={`rounded-full px-4 py-2 text-[15px] font-semibold ring-1 ${d === curDay ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-800 ring-gray-300'}`}>
                  {fmtDayLabel(d)}{d === today ? ' · 오늘' : ''}
                </button>
              ))}
            </div>
          )}
          {list.length === 0 ? <p className="py-10 text-center text-sm text-gray-400">{onlyFav ? '이 날엔 찜한 일정이 없어요.' : '등록된 일정이 없어요.'}</p> : (
            <ol className="relative ml-2 border-l-2 border-gray-200 pl-5">
              {list.map(p => {
                const s = new Date(p.starts_at).getTime(), e = new Date(p.ends_at).getTime()
                const live = s <= now && now < e, past = e <= now
                return (
                  <li key={p.id} className={`relative pb-5 ${past ? 'opacity-50' : ''}`}>
                    <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${live ? 'bg-orange-500' : past ? 'bg-gray-300' : 'bg-gray-900'}`} />
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className="tabular-nums font-semibold text-gray-900">{fmtTime(p.starts_at)}–{fmtTime(p.ends_at)}</span>
                      <span>{PROGRAM_KIND_LABEL[p.kind]}</span>
                      {p.place && <span>· {p.place.name}</span>}
                      {live && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white">진행 중</span>}
                    </div>
                    <div className="mt-0.5 flex items-start gap-2">
                      <div className="flex-1 text-[17px] font-bold text-gray-900">{p.title}</div>
                      <button type="button" onClick={() => toggleFav(p.id)} aria-label="찜" className={`-mr-1 -mt-1 rounded-full p-1.5 text-lg leading-none ${fav.includes(p.id) ? 'text-amber-500' : 'text-gray-300'}`}>{fav.includes(p.id) ? '★' : '☆'}</button>
                    </div>
                    {p.description && <p className="mt-0.5 text-sm text-gray-600">{p.description}</p>}
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {/* 행사 안내 */}
        {(event.info_text || event.contact_text) && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-gray-500">행사 안내</h2>
            {event.info_text && <p className="whitespace-pre-line rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-800 ring-1 ring-gray-200">{event.info_text}</p>}
            {event.contact_text && <p className="mt-2 whitespace-pre-line px-1 text-sm text-gray-600">{linkifyTel(event.contact_text)}</p>}
          </section>
        )}
        <p className="pt-4 text-center text-xs text-gray-400">운영 플릿 (FLIT)</p>
      </div>
      <CustomerNav slug={event.slug} active="schedule" stamp={event.stamp_enabled} />
    </div>
  )
}

const fmtDayLabel = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })
const fmtDayTime = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })

/** 연락처 문구 안의 전화번호를 tel: 링크로 */
function linkifyTel(text: string) {
  const parts = text.split(/(0\d{1,2}-?\d{3,4}-?\d{4})/g)
  return parts.map((p, i) => /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(p) ? <a key={i} href={`tel:${p.replace(/-/g, '')}`} className="font-semibold text-gray-900 underline">{p}</a> : <span key={i}>{p}</span>)
}
