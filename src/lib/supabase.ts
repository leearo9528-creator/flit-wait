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
