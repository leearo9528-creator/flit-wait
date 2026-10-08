export type BoothMode = 'queue' | 'slot' | 'hybrid'
export type TicketStatus = 'waiting' | 'called' | 'checked_in' | 'done' | 'no_show' | 'cancelled'

export interface BoothSettings {
  max_party_size: number
  allow_duplicate_phone: boolean
  queue_close_before_min: number
  notify_ahead_teams: number
  call_valid_min: number
  reserve_open_at: string | null
  reserve_close_before_min: number
  reminders: Array<{ type: 'day_before'; hour: number } | { type: 'before_min'; min: number }>
  noshow_after_start_min: number
  transfer_noshow_to_queue: boolean
  cancel_until_before_min: number
  sms_fallback: boolean
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
  description?: string | null
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
}

export interface StaffBoard {
  booth: Booth
  date?: string
  dates?: string[]
  queue: StaffTicket[]
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
