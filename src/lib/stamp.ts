import { useEffect, useState } from 'react'
import { rpc } from './supabase'
import { LS } from './util'
import { deviceTokens } from './myTickets'
import { deviceOrders } from './orders'

/** 손님 기기마다 카드 하나 — localStorage 토큰. 지우면 새 카드가 된다 (행사 하루이틀이라 충분) */
export function cardToken(slug: string) {
  const k = `stamp:${slug}`
  let t = LS.get<string>(k)
  if (!t) { t = crypto.randomUUID().replace(/-/g, ''); LS.set(k, t) }
  return t
}

export type StampClaim = { added: string[]; count: number; goal: number; completed: boolean }

/**
 * 자동 적립 (0050) — 이 기기의 대기표·주문 중 입장·수령이 끝난 것이 스탬프 지점에 이어져 있으면 그 스탬프를 찍는다.
 * 서버가 표·주문 상태를 직접 확인하므로 여러 번 불러도 같은 결과다. extra 는 지금 보고 있는 표·주문 토큰 (다른 기기에서 접수한 링크로 열었을 때)
 */
export async function claimStamps(slug: string, extra?: { ticket?: string; order?: string }): Promise<StampClaim | null> {
  const tickets = [...new Set([...deviceTokens(), ...(extra?.ticket ? [extra.ticket] : [])])].slice(0, 100)
  const orders = [...new Set([...deviceOrders(), ...(extra?.order ? [extra.order] : [])])].slice(0, 100)
  if (!slug || (!tickets.length && !orders.length)) return null
  try { return await rpc<StampClaim>('stamp_claim', { p_slug: slug, p_card: cardToken(slug), p_tickets: tickets, p_orders: orders }) }
  catch { return null }   // 0050 이 아직 없는 서버·네트워크 실패 — 스탬프는 덤이라 화면을 막지 않는다
}

/** when 이 참이 되는 순간 한 번 청구하고, 새로 찍힌 게 있으면 그 결과를 돌려준다 (대기표·주문 화면의 '스탬프가 찍혔어요' 안내용) */
export function useStampClaim(slug: string | undefined, when: boolean, extra?: { ticket?: string; order?: string }) {
  const [got, setGot] = useState<StampClaim | null>(null)
  useEffect(() => {
    if (!slug || !when) return
    let alive = true
    claimStamps(slug, extra).then(r => { if (alive && r?.added.length) setGot(r) })
    return () => { alive = false }
  }, [slug, when]) // eslint-disable-line
  return got
}
