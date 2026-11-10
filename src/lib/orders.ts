import { useEffect, useState } from 'react'
import { rpc } from './supabase'
import { LS } from './util'
import type { MenuItem, OrderPublic } from './types'

/** '5,000원' → 5000 (서버 price_int 와 같은 규칙) */
export const priceOf = (m: Pick<MenuItem, 'price'>) => Number(String(m.price ?? '').replace(/\D/g, '')) || 0
export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

/** 장바구니 — 가게 하나씩 (한 주문 = 한 가게). 탭을 닫으면 사라진다 */
export type Cart = Record<string, number>
const ck = (placeId: string) => `cart:${placeId}`
export const cart = {
  get: (placeId: string): Cart => { try { return JSON.parse(sessionStorage.getItem(ck(placeId)) || '{}') } catch { return {} } },
  set: (placeId: string, c: Cart) => { try { sessionStorage.setItem(ck(placeId), JSON.stringify(c)) } catch { /* 저장소 없음 */ } },
  clear: (placeId: string) => { try { sessionStorage.removeItem(ck(placeId)) } catch { /* 저장소 없음 */ } },
}
/** 장바구니를 지금 메뉴에 맞춰 줄로 편다 — 사라진 메뉴·품절은 뺀다 */
export function cartLines(menu: MenuItem[], c: Cart) {
  return menu.filter(m => (c[m.name] ?? 0) > 0 && !m.sold_out && priceOf(m) > 0).map(m => ({ name: m.name, price: priceOf(m), qty: c[m.name] }))
}
export const cartTotal = (lines: { price: number; qty: number }[]) => lines.reduce((a, l) => a + l.price * l.qty, 0)
export const cartCount = (lines: { qty: number }[]) => lines.reduce((a, l) => a + l.qty, 0)

/** 이 기기에서 넣은 주문 토큰 */
export const rememberOrder = (token: string) => LS.set(`order:${token.slice(0, 8)}`, { token, at: Date.now() })
export function deviceOrders(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith('order:')) { const v = LS.get<{ token: string; at: number }>(k); if (v?.token && Date.now() - (v.at ?? 0) < 3 * 86400_000) out.push(v.token); else LS.del(k) }
    }
  } catch { /* 저장소를 못 쓰는 환경 */ }
  return out
}

export type MyOrder = OrderPublic & { token: string }
export const orderActive = (o: { status: string }) => o.status === 'placed' || o.status === 'accepted' || o.status === 'ready'
const rank = (o: MyOrder) => o.status === 'ready' ? 0 : orderActive(o) ? 1 : 2
export async function fetchMyOrders(eventSlug: string): Promise<MyOrder[]> {
  const rs = await Promise.all(deviceOrders().map(tk => rpc<OrderPublic | null>('get_order', { p_token: tk }).then(o => o ? { ...o, token: tk } : null).catch(() => null)))
  return (rs.filter(Boolean) as MyOrder[]).filter(o => !eventSlug || o.event.slug === eventSlug)
    .sort((a, b) => rank(a) - rank(b) || String(b.created_at).localeCompare(String(a.created_at)))
}
/** 이 기기의 내 주문. everyMs 를 주면 화면이 보이는 동안 그 간격으로 다시 읽는다 */
export function useMyOrders(eventSlug: string, everyMs = 0) {
  const [rows, setRows] = useState<MyOrder[]>([])
  useEffect(() => {
    let alive = true
    const load = () => { if (deviceOrders().length) fetchMyOrders(eventSlug).then(r => { if (alive) setRows(r) }).catch(() => {}) }
    load()
    if (!everyMs) return () => { alive = false }
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, everyMs)
    return () => { alive = false; clearInterval(iv) }
  }, [eventSlug, everyMs])
  return rows
}

export const ORDER_LABEL: Record<string, string> = { placed: '주문 확인 중', accepted: '준비 중', ready: '준비 완료', picked_up: '받았어요', cancelled: '취소됨' }
