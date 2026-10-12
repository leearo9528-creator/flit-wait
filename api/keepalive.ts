// Supabase Free 는 7일간 API 호출이 없으면 프로젝트가 일시정지된다 → Vercel 크론이 매일 한 번 가볍게 깨운다 (vercel.json crons)
export const config = { runtime: 'edge' }
export default async function handler(req: Request) {
  const base = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
  const r = await fetch(`${base}/rest/v1/rpc/event_summary`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: 'test' }),
  })
  return new Response(JSON.stringify({ ok: r.ok, status: r.status, at: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
