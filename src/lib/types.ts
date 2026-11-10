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
  map_image_url?: string | null
  map_note?: string | null
  lat?: number | null
  lng?: number | null
  info_text?: string | null
  contact_text?: string | null
  directions_text?: string | null
  stamp_enabled?: boolean
  stamp_goal?: number | null
  stamp_reward_text?: string | null
  accent_color?: string | null
  template?: string | null
  vendor_token?: string | null
  vendor_open?: boolean
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
  /** 손님이 순서를 미룬 횟수 (서버가 내려줄 때만) */
  defer_count?: number
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

// ───────── 행사장 지도 (0036_map_guide)
export type PlaceKind = 'booth' | 'food' | 'market' | 'stage' | 'facility' | 'info' | 'parking' | 'shuttle' | 'medical' | 'other'
export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  booth: '체험부스', food: '먹거리', market: '마켓', stage: '무대·공연', facility: '편의시설', info: '안내소', parking: '주차장', shuttle: '셔틀 정류장', medical: '의무실', other: '기타',
}
/** 수동 혼잡도 — 스태프가 관리자 화면에서 누른다 (센서 없음). 주차장·푸드존·인기 부스용 */
export type Crowd = 'low' | 'mid' | 'high'
export const CROWD_LABEL: Record<Crowd, string> = { low: '여유', mid: '보통', high: '혼잡' }

export interface PlaceRow {
  id: string
  event_id: string
  booth_id: string | null
  kind: PlaceKind
  name: string
  crowd?: Crowd | null
  crowd_updated_at?: string | null
  description: string | null
  hours: string | null
  image_url: string | null
  x: number
  y: number
  lat: number | null
  lng: number | null
  sort_order: number
  menu: MenuItem[]
}
export interface MenuItem { name: string; price?: string }

export interface GuidePlace extends Omit<PlaceRow, 'event_id'> {
  crowd?: Crowd | null; crowd_updated_at?: string | null
  /** est_wait_min · next_slot_at 은 서버 event_guide 가 아직 안 준다(데모만) — 없으면 화면은 '대기 N팀' / '잔여 N석' 으로 보여 준다 */
  booth: { id: string; slug: string; mode: BoothMode; is_paused: boolean; location: string | null; waiting_teams: number; today_left: number; est_wait_min?: number | null; next_slot_at?: string | null } | null
}

export interface EventGuide {
  event: Pick<EventRow, 'id' | 'name' | 'slug' | 'status' | 'notice' | 'starts_at' | 'ends_at' | 'image_url'> & {
    map_image_url: string | null; map_note: string | null; lat: number | null; lng: number | null; stamp_enabled?: boolean; directions_text?: string | null
  }
  places: GuidePlace[]
}

// ───────── 일정·공지·안내 / 스탬프 (0037)
export type ProgramKind = 'stage' | 'event' | 'workshop' | 'other'
export const PROGRAM_KIND_LABEL: Record<ProgramKind, string> = { stage: '공연', event: '이벤트', workshop: '체험·워크숍', other: '기타' }
export interface ProgramRow {
  id: string; event_id: string; place_id: string | null; title: string; description: string | null
  starts_at: string; ends_at: string; kind: ProgramKind
}
export interface NoticeRow {
  id: string; event_id: string; title: string; body: string | null; urgent: boolean; pinned: boolean; publish_at: string; expires_at: string | null
}
export interface EventSchedule {
  event: Pick<EventRow, 'id' | 'name' | 'slug' | 'status' | 'notice' | 'starts_at' | 'ends_at' | 'info_text' | 'contact_text' | 'stamp_enabled' | 'image_url' | 'map_image_url' | 'accent_color'> & { booth_count: number; survey_enabled?: boolean; draw_open?: boolean; directions_text?: string | null; lat?: number | null; lng?: number | null }
  programs: Array<Omit<ProgramRow, 'event_id' | 'place_id'> & { place: { id: string; name: string } | null }>
  notices: Array<Pick<NoticeRow, 'id' | 'title' | 'body' | 'urgent' | 'pinned' | 'publish_at'>>
}
export interface StampSpotRow { id: string; event_id: string; place_id: string | null; name: string; code: string; sort_order: number }
export interface StampStatus {
  enabled: boolean; goal: number; total: number; reward_text: string | null
  spots: Array<{ id: string; name: string; got: boolean }>
  count: number; reward_code: string | null; completed_at: string | null; redeemed_at: string | null
}

// ───────── 럭키드로우 · 설문 · 셀러 등록 · 테마 (0039)
export interface DrawRow { id: string; event_id: string; title: string; prize: string | null; description: string | null; draw_at: string | null; winners_count: number; require_stamp: boolean; status: 'draft' | 'open' | 'closed' | 'drawn' }
export interface DrawPublic extends Omit<DrawRow, 'event_id'> { entries: number; mine: { name: string; won: boolean } | null; winners: { name: string; phone_tail: string }[] }
export type SurveyQuestion = { id: string; type: 'rating' | 'choice' | 'text'; label: string; options?: string[] }
export interface SurveyPublic { enabled: boolean; title: string | null; questions: SurveyQuestion[]; thanks: string | null; done: boolean }
export interface VendorSubmissionRow { id: string; event_id: string; kind: 'market' | 'food' | 'booth' | 'other'; name: string; description: string | null; menu: MenuItem[]; image_url: string | null; contact: string | null; status: 'pending' | 'approved' | 'rejected'; place_id: string | null; created_at: string }
