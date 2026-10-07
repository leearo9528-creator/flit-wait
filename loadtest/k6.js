// k6 부하 테스트 — GitHub Actions(workflow_dispatch) 또는 로컬에서: k6 run -e BASE=https://wait.flitunion.com -e SB=https://xxx.supabase.co -e KEY=... -e SLUG=seongnam-2026 -e BOOTH=tech-1 loadtest/k6.js
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE, SB = __ENV.SB, KEY = __ENV.KEY, SLUG = __ENV.SLUG || 'seongnam-2026', BOOTH = __ENV.BOOTH || 'tech-1'
const VUS = Number(__ENV.VUS || 1000)

export const options = {
  scenarios: {
    // 1) 손님 1,000명이 화면 켜두고 폴링 (엣지 캐시 경유)
    viewers: { executor: 'constant-vus', vus: VUS, duration: '2m', exec: 'viewer' },
    // 2) 접수 러시: 30초 동안 초당 20건 접수 (DB 쓰기)
    joiners: { executor: 'constant-arrival-rate', rate: 20, timeUnit: '1s', duration: '30s', preAllocatedVUs: 100, exec: 'joiner', startTime: '30s' },
  },
  thresholds: {
    'http_req_failed{scenario:viewers}': ['rate<0.01'],
    'http_req_duration{scenario:viewers}': ['p(95)<800'],
    'http_req_failed{scenario:joiners}': ['rate<0.02'],
    'http_req_duration{scenario:joiners}': ['p(95)<1500'],
  },
}

export function viewer() {
  const r = http.get(`${BASE}/api/public?fn=${Math.random() < 0.5 ? 'event_summary' : 'booth_summary'}&slug=${Math.random() < 0.5 ? SLUG : BOOTH}`)
  check(r, { 'viewer 200': x => x.status === 200 })
  sleep(15 + Math.random() * 10)
}

export function joiner() {
  const phone = '010' + String(Math.floor(10000000 + Math.random() * 89999999))
  const r = http.post(`${SB}/rest/v1/rpc/join_queue`, JSON.stringify({ p_slug: BOOTH, p_name: 'k6', p_phone: phone, p_party: 1, p_consent: true }),
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } })
  check(r, { 'join 200': x => x.status === 200 })
  if (r.status === 200) {
    const token = r.json('token')
    const t = http.post(`${SB}/rest/v1/rpc/get_ticket`, JSON.stringify({ p_token: token }), { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } })
    check(t, { 'ticket 200': x => x.status === 200 })
  }
}
