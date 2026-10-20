// 현장 상태 점검: https://wait.flitunion.com/api/health
// DB 의 health_summary() (개인정보 없음) 를 그대로 돌려주고, 문제가 있으면 503 — 외부 감시기(UptimeRobot 등)가 200/503 만 보면 된다.
// 보는 것: 스케줄러·발송 cron 최근 실행, cron 활성 여부, 발송 큐(미발송·실패·멈춤), 발송 함수 마지막 응답, 열린 행사, 성남 부스 일시중단 여부, 오늘 티켓 수
export const config = { runtime: 'edge', regions: ['icn1'] }

export default async function handler(_req: Request) {
  const base = process.env.VITE_SUPABASE_URL!, key = process.env.VITE_SUPABASE_ANON_KEY!
  let body: any
  try {
    const r = await fetch(`${base}/rest/v1/rpc/health_summary`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}',
    })
    body = r.ok ? await r.json() : { ok: false, problems: [`DB 응답 ${r.status}`] }
  } catch (e) {
    body = { ok: false, problems: [`DB 연결 실패: ${String(e)}`] }
  }
  return new Response(JSON.stringify(body, null, 2), {
    status: body?.ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  })
}
