import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const PUBLIC_BASE_URL: string =
  import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin

export async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(cleanError(error.message))
  return data as T
}

/** Postgres RAISE 메시지에서 사람이 읽을 부분만 */
export function cleanError(msg: string) {
  return msg.replace(/^.*?(?=[가-힣])/s, '').trim() || msg
}

/** 모두에게 같은 공개 읽기 (event_summary / booth_summary / event_board) → 엣지 캐시 경유.
 *  실패하면 직접 RPC 로 폴백. */
export async function cachedRpc<T = any>(fn: 'event_summary' | 'booth_summary' | 'event_board', slug: string): Promise<T> {
  if (import.meta.env.DEV) return rpc<T>(fn, { p_slug: slug })
  try {
    const r = await fetch(`/api/public?fn=${fn}&slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    return (await r.json()) as T
  } catch {
    return rpc<T>(fn, { p_slug: slug })
  }
}
