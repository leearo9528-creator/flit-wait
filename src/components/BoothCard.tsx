/** 손님 목록·상세 공통 조각: 썸네일(사진 없으면 이름 커버), 상태 뱃지, 상태 판정 */

export interface BoothLike {
  id: string; name: string; mode: 'queue' | 'slot' | 'hybrid'; is_paused: boolean; pause_mode?: string | null; image_url: string | null; icon_url?: string | null; group_name?: string | null; total_left?: number
  /** 오늘 남은 회차 수 · 오늘 잔여석 (event_summary) — 오늘 회차가 있는데 잔여 0이면 '예약 마감' */
  today_slots?: number; today_left?: number
  reserve_open_at?: string | null; reserve_open_daily_time?: string | null; next_slot_at?: string | null
  /** 대기표 접수 일별 시간대 + 스태프 수동 오픈(그 날짜) — event_summary / booth.settings 양쪽에서 같은 이름으로 온다 */
  queue_open_daily_time?: string | null; queue_close_daily_time?: string | null; open_override_date?: string | null
}

/** 목록 카드의 "예약 오픈" 기준 시각 — 다음 회차 날짜(없으면 오늘) 기준. 일별 오픈이면 그 날짜 HH:MM */
export function nextOpenAt(b: Pick<BoothLike, 'reserve_open_at' | 'reserve_open_daily_time' | 'next_slot_at' | 'open_override_date'>): Date | null {
  return openAtFor(b, kstYmd(b.next_slot_at ? new Date(b.next_slot_at) : new Date()))
}

export type BoothStatus = { kind: 'open' | 'paused' | 'closed' | 'soldout' | 'upcoming'; label: string }

/** KST 기준 YYYY-MM-DD */
export const kstYmd = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
/** KST 기준 'HH:MM' (h23 — 자정이 24:00 으로 나오는 엔진 차이 회피) */
export const kstHm = (d: Date = new Date()) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' })
const normHm = (s?: string | null) => { const t = s?.trim(); return t && /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, '0') : null }

export type WindowState = 'open' | 'before_open' | 'after_close'
/**
 * 대기표 접수 일별 시간대 판정 (서버 queue_window_state 와 같은 규칙).
 * 스태프가 오늘 '오픈'을 눌렀으면(open_override_date = 오늘) 시간대와 무관하게 open.
 */
export function queueWindowState(b: Pick<BoothLike, 'queue_open_daily_time' | 'queue_close_daily_time' | 'open_override_date'>, now = new Date()): WindowState {
  if (b.open_override_date === kstYmd(now)) return 'open'
  const hm = kstHm(now), o = normHm(b.queue_open_daily_time), c = normHm(b.queue_close_daily_time)
  if (o && hm < o) return 'before_open'
  if (c && hm >= c) return 'after_close'
  return 'open'
}

/**
 * 특정 날짜(KST)의 회차가 예약 가능해지는 시각.
 * = max(전체 오픈 일시 reserve_open_at, 그 날짜 + 일별 오픈 시각 reserve_open_daily_time('12:00'))
 * 일별 오픈이 설정되면 "매일 12:00에 그날 회차 오픈" 식으로 동작한다.
 * 스태프가 그 날짜에 '오픈'을 눌렀으면(open_override_date) null — 바로 예약 가능.
 */
export function openAtFor(b: Pick<BoothLike, 'reserve_open_at' | 'reserve_open_daily_time' | 'open_override_date'>, ymd: string): Date | null {
  if (b.open_override_date === ymd) return null
  const g = b.reserve_open_at ? new Date(b.reserve_open_at) : null
  const hm = b.reserve_open_daily_time?.trim()
  const d = hm && /^\d{1,2}:\d{2}$/.test(hm) ? new Date(`${ymd}T${hm.padStart(5, '0')}:00+09:00`) : null
  if (g && d) return g.getTime() > d.getTime() ? g : d
  return g ?? d
}

/** 존(group) 태그를 카테고리가 이미 포함하면(예: 존 '테크놀이터' + 카테고리 '테크놀이터 2번 부스') 존은 생략 */
export function showGroupTag(group?: string | null, category?: string | null) {
  const g = group?.trim()
  if (!g) return null
  return category?.trim().startsWith(g) ? null : g
}

/** eventClosed: true=운영 종료 · 'before'=행사 시작 전(대기표 부스에만 씀, 예약 부스는 '예약 오픈 예정' 이 더 정확) */
export function boothStatus(b: BoothLike, eventClosed: boolean | 'before'): BoothStatus {
  if (eventClosed === 'before') return { kind: 'closed', label: '시작 전' }
  if (eventClosed) return { kind: 'closed', label: '운영 종료' }
  if (b.is_paused) return { kind: 'paused', label: b.pause_mode === 'closed_today' ? '오늘 마감' : '일시 중단' }
  if (b.mode !== 'queue') {
    const openAt = nextOpenAt(b)
    if (openAt && openAt.getTime() > Date.now()) return { kind: 'upcoming', label: '예약 오픈 예정' }
    // 오늘 회차가 남아 있는데 오늘 잔여석이 0 → '예약 마감' (내일 회차는 내일 12:00 오픈이라 지금은 어차피 못 잡는다)
    if ((b.today_slots ?? 0) > 0 && (b.today_left ?? 1) <= 0) return { kind: 'soldout', label: '예약 마감' }
    if ((b.total_left ?? 1) <= 0) return { kind: 'soldout', label: '매진' }
    return { kind: 'open', label: '예약 중' }
  }
  const ws = queueWindowState(b)
  if (ws === 'before_open') return { kind: 'upcoming', label: '접수 오픈 예정' }
  if (ws === 'after_close') return { kind: 'closed', label: '오늘 접수 마감' }
  return { kind: 'open', label: '접수 중' }
}

export function StatusBadge({ st }: { st: BoothStatus }) {
  const tone = st.kind === 'open' ? 'bg-orange-50 text-orange-600' : st.kind === 'upcoming' ? 'bg-sky-50 text-sky-700' : st.kind === 'soldout' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
  return <span className={`rounded-md px-2 py-1 text-[13px] font-semibold ${tone}`}>{st.label}</span>
}

const GRADS = ['from-rose-400 to-orange-300', 'from-sky-400 to-indigo-400', 'from-emerald-400 to-teal-300', 'from-violet-400 to-fuchsia-300', 'from-amber-400 to-yellow-300']
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

export function BoothThumb({ b, dim, label, size = 'h-[100px] w-[100px]' }: { b: BoothLike; dim?: boolean; label?: string; size?: string }) {
  const grad = GRADS[hash(b.id) % GRADS.length]
  const src = b.icon_url || b.image_url  // 목록은 아이콘 우선, 없으면 배너
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br ${grad} ${size}`}>
      {src && <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
      {dim && label && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-[15px] font-bold text-white">{label}</div>
      )}
    </div>
  )
}
