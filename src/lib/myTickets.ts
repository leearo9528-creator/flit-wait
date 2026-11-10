import { useEffect, useState } from 'react'
import { rpc } from './supabase'
import { LS } from './util'

/** 이 기기에서 접수한 대기·예약 한 건 (get_ticket 결과에서 화면에 쓰는 것만) */
export type MyRow = {
  token: string; booth: string; booth_slug: string; event_slug: string; status: string
  ticket_no: number | null; slot_at: string | null; created_at: string
  ahead: number | null; est_wait_min: number | null
}

/** 이 기기에 저장된 표 토큰 */
export function deviceTokens(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith('ticket:') || k.startsWith('resv:')) { const v = LS.get<{ token: string }>(k); if (v?.token) out.push(v.token) }
    }
  } catch { /* 저장소를 못 쓰는 환경 */ }
  return out
}

/** 급한 순서: 호출됨 → 대기(짧은 순) → 예약(이른 순) → 끝난 것(최근 순) */
const rank = (r: MyRow) => r.status === 'called' ? 0 : r.status === 'waiting' ? (r.slot_at ? 2 : 1) : 3
export function sortMine(rows: MyRow[]) {
  return [...rows].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 1 ? (a.est_wait_min ?? 0) - (b.est_wait_min ?? 0) : rank(a) === 2 ? String(a.slot_at).localeCompare(String(b.slot_at)) : String(b.created_at).localeCompare(String(a.created_at))))
}

export async function fetchMine(eventSlug: string): Promise<MyRow[]> {
  const rs = await Promise.all(deviceTokens().map(tk => rpc<any>('get_ticket', { p_token: tk }).then(t => t ? {
    token: tk, booth: t.booth.name, booth_slug: t.booth.slug, event_slug: t.event?.slug ?? '', status: t.status, ticket_no: t.ticket_no,
    slot_at: t.slot?.starts_at ?? null, created_at: t.created_at, ahead: t.ahead ?? null, est_wait_min: t.est_wait_min ?? null,
  } as MyRow : null).catch(() => null)))
  return sortMine((rs.filter(Boolean) as MyRow[]).filter(r => !eventSlug || !r.event_slug || r.event_slug === eventSlug))
}

/** 이 기기의 내 대기·예약. everyMs 를 주면 화면이 보이는 동안 그 간격으로 다시 읽는다 */
export function useMyTickets(eventSlug: string, everyMs = 0) {
  const [rows, setRows] = useState<MyRow[]>([])
  useEffect(() => {
    let alive = true
    const load = () => fetchMine(eventSlug).then(r => { if (alive) setRows(r) }).catch(() => {})
    load()
    if (!everyMs) return () => { alive = false }
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, everyMs)
    return () => { alive = false; clearInterval(iv) }
  }, [eventSlug, everyMs])
  return rows
}
export const isActive = (r: MyRow) => r.status === 'waiting' || r.status === 'called'
