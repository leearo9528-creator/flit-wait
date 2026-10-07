// 공개 읽기 RPC 엣지 캐시 — 모두에게 같은 응답(event_summary / booth_summary / event_board)을
// Vercel Edge 에서 3초 캐시해 DB 호출을 "접속자 수"가 아니라 "초당 1회"로 묶는다.
// 손님 1,000명이 폴링해도 DB 는 부스당 ~0.3 qps.
export const config = { runtime: 'edge' }

const ALLOWED: Record<string, string> = { event_summary: 'p_slug', booth_summary: 'p_slug', event_board: 'p_slug' }

export default async function handler(req: Request) {
  const url = new URL(req.url)
  const fn = url.searchParams.get('fn') ?? ''
  const slug = url.searchParams.get('slug') ?? ''
  const argName = ALLOWED[fn]
  if (!argName || !/^[a-z0-9-]{1,64}$/.test(slug)) return new Response('bad request', { status: 400 })

  const base = process.env.VITE_SUPABASE_URL!
  const key = process.env.VITE_SUPABASE_ANON_KEY!
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ [argName]: slug }),
  })
  const body = await r.text()
  return new Response(body, {
    status: r.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': r.ok ? 'public, s-maxage=3, stale-while-revalidate=15' : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
