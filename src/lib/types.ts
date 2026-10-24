export type BoothMode = 'queue' | 'slot' | 'hybrid'
export type TicketStatus = 'waiting' | 'called' | 'checked_in' | 'done' | 'no_show' | 'cancelled'

export interface BoothSettings {
  max_party_size: number
  allow_duplicate_phone: boolean
  queue_close_before_min: number
  notify_ahead_teams: number
  call_valid_min: number
  reserve_open_at: string | null
  /** 'HH:MM' — 설정하면 그 날짜 회차는 매일 이 시각에 오픈 (reserve_open_at 과 둘 중 늦은 쪽) */
  reserve_open_daily_time?: string | null
  reserve_close_before_min: number
  reminders: Array<{ type: 'day_before'; hour: number } | { type: 'before_min'; min: number }>
  noshow_after_start_min: number
  transfer_noshow_to_queue: boolean
  cancel_until_before_min: number
  sms_fallback: boolean
  /** 접수 중단 종류: 'paused' 잠시 중단 · 'closed_today' 오늘 마감(자정에 자동 해제). is_paused 가 true 일 때만 의미 */
  pause_mode?: 'paused' | 'closed_today' | null
  pause_date?: string | null
  /** 'HH:MM' KST — 대기표(queue/hybrid) 접수의 일별 오픈·마감 시각. 비우면 행사 시간 전체 */
  queue_open_daily_time?: string | null
  queue_close_daily_time?: string | null
  /** 1팀당 소요 시간(분) — 예상 대기 = 대기 팀 수 × 이 값. 비우면 자동 측정(입장 간격 → 호출 간격). 성남 테크 = 7 */
  service_min?: number | null
  /** 접수 오픈 전 손님 화면 안내 한 줄 (예: '시작 2시간 전부터 접수 가능합니다.') */
  queue_open_note?: string | null
  /** 'YYYY-MM-DD' — 스태프가 '오픈'을 누른 날. 그날은 시간대·예약 오픈 시각과 무관하게 접수·예약을 받는다 */
  open_override_date?: string | null
}

export interface Booth {
  id: string
  event_id?: string
  name: string
  slug: string
  mode: BoothMode
  is_paused: boolean
  location?: string | null
  sort_order?: number
  settings: BoothSettings
  pin_hash?: string | null
  image_url?: string | null
  /** 손님 목록 썸네일 전용 아이콘. 없으면 image_url(배너) 사용 */
  icon_url?: string | null
  description?: string | null
  group_name?: string | null
  category?: string | null
}

export interface EventRow {
  id: string
  name: string
  slug: string
  starts_at: string
  ends_at: string
  status: 'draft' | 'open' | 'closed'
  privacy_text: string
  data_retention_days: number
  notice: string | null
  image_url?: string | null
}

export interface SlotPublic {
  id: string
  starts_at: string
  ends_at: string
  capacity: number
  status: 'open' | 'closed' | 'cancelled'
  reserved: number
}

export interface BoothSummary {
  booth: Booth
  event: Pick<EventRow, 'id' | 'name' | 'slug' | 'status' | 'privacy_text' | 'notice' | 'starts_at' | 'ends_at'>
  waiting_teams: number
  avg_service_min?: number | null
  slots: SlotPublic[]
}

export interface Ticket {
  id: string
  name: string
  party_size: number
  ticket_no: number | null
  status: TicketStatus
  called_at: string | null
  created_at: string
  phone_tail: string | null
  ahead: number | null
  est_wait_min: number | null
  source?: string
  booth: Pick<Booth, 'name' | 'slug' | 'mode' | 'location' | 'is_paused' | 'settings'>
  event: { name: string; slug?: string; notice: string | null }
  slot: { starts_at: string; ends_at: string; status: string } | null
  can_cancel: boolean
}

export interface StaffTicket {
  id: string
  ticket_no: number | null
  name: string
  phone_tail: string | null
  party_size: number
  status: TicketStatus
  called_at: string | null
  created_at: string
  source: string
  checked_in_at?: string | null
  updated_at?: string | null
}

export interface StaffBoard {
  booth: Booth
  date?: string
  dates?: string[]
  queue: StaffTicket[]
  history?: StaffTicket[]
  done_today: number
  noshow_today: number
  slots: Array<{
    id: string
    starts_at: string
    ends_at: string
    capacity: number
    status: string
    tickets: StaffTicket[]
  }>
}

export interface StaffSession {
  booth_id: string
  staff_token: string
  booth: Booth
  slug: string
}
