import { createClient } from '@supabase/supabase-js'
import { isDemo } from './demo'

// 데모 모드(/demo)면 네트워크 대신 브라우저 안 가짜 DB 로 — 프로덕션에는 요청이 한 건도 안 나간다
export const DEMO = isDemo()
// 웨이팅의 테이블·RPC 는 플릿 Supabase 프로젝트의 wait 스키마에 있다 (2026-11-23 별도 프로젝트에서 이사).
// 같은 프로젝트의 public(회원)·app(셀러 앱)·home(홈 문의)과 섞이지 않게 기본 스키마를 wait 으로 잡는다.
// Realtime 구독의 schema 값도 이 상수를 쓴다. api/*.ts 는 같은 값을 Content-Profile 헤더로 보낸다.
export const DB_SCHEMA = 'wait'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { db: { schema: DB_SCHEMA }, ...(DEMO ? { global: { fetch: demoFetch } } : {}) },
)

// 가짜 서버는 데모일 때만, 첫 요청 때 내려받는다 — 실제 손님 번들에서 뺐다. 한 번 만든 서버를 계속 쓴다 (만들 때 샘플을 읽어 두므로 여러 벌 만들면 안 된다)
let demoServer: Promise<typeof fetch> | null = null
function demoFetch(...a: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  demoServer ??= import('./demoServer').then(m => m.makeDemoFetch())
  return demoServer.then(f => f(...a))
}

export const PUBLIC_BASE_URL: string =
  import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin

export async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(cleanError(error.message))
  return data as T
}

/** Postgres RAISE 메시지에서 사람이 읽을 부분만 — 앞에 붙는 오류 코드(`P0001: `)만 떼고, 'PIN이 …' 처럼 영문으로 시작하는 본문은 그대로 둔다 */
export function cleanError(msg: string) {
  return msg.replace(/^[A-Z0-9]{5}:\s*/, '').trim() || msg
}

/** 모두에게 같은 공개 읽기 (event_summary / booth_summary / event_board) → 엣지 캐시 경유.
 *  실패하면 직접 RPC 로 폴백. */
export async function cachedRpc<T = any>(fn: 'event_summary' | 'booth_summary' | 'event_board' | 'event_guide' | 'event_schedule', slug: string): Promise<T> {
  if (import.meta.env.DEV || DEMO) return rpc<T>(fn, { p_slug: slug })
  try {
    const r = await fetch(`/api/public?fn=${fn}&slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    return (await r.json()) as T
  } catch {
    return rpc<T>(fn, { p_slug: slug })
  }
}
