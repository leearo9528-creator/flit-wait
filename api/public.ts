// 공개 읽기 RPC 엣지 캐시 — 모두에게 같은 응답(event_summary / booth_summary / event_board)을
// Vercel Edge 에서 5초 캐시(+60초 stale 허용)해 DB 호출을 "접속자 수"가 아니라 "초당 1회"로 묶는다.
// 손님 1,000명이 폴링해도 DB 는 부스당 ~0.3 qps.
// regions: 기본값이면 싱가포르(sin1)에서 실행돼 서울 Supabase 왕복이 매번 국외 경유 → 서울(icn1) 고정
export const config = { runtime: 'edge', regions: ['icn1'] }

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
      // swr 60→15 (2026-10-24 현장): 손님 화면 최악 지연 75초→35초. 15초는 손님 폴링 간격(15~18초)보다 길어 한 명만 봐도 캐시가 비지 않는다.
      // 10초 이하로 줄이면 캐시가 비는 순간 요청이 DB 로 몰린다(10/08 2.2초 스파이크). DB 조회 횟수는 키당 5초에 1회로 동일.
      'Cache-Control': r.ok ? 'public, s-maxage=5, stale-while-revalidate=15' : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
