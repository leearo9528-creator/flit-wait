// k6 부하 테스트 — 테스트 행사(test)에 대고 돌린다. 끝나면 생성된 k6 티켓은 소프트 취소(OPERATIONS.md 6-1 참고)
// 로컬: k6 run -e BASE=https://wait.flitunion.com -e SB=https://xxx.supabase.co -e KEY=<anon> -e SLUG=test -e BOOTH=t-tech-2 -e VUS=200 loadtest/k6.js
import http from 'k6/http'
import { check, sleep } from 'k6'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'

const BASE = __ENV.BASE, SB = __ENV.SB, KEY = __ENV.KEY, SLUG = __ENV.SLUG || 'test', BOOTH = __ENV.BOOTH || 't-tech-2'
const VUS = Number(__ENV.VUS || 200)
const DUR = __ENV.DUR || '2m'
const H = { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } }

export const options = {
  scenarios: {
    // 1) 손님 VUS명이 부스 목록/부스 화면을 켜두고 폴링 (Vercel 엣지 캐시 경유)
    viewers: { executor: 'constant-vus', vus: VUS, duration: DUR, exec: 'viewer' },
    // 2) 손님 VUS명이 '내 대기표'를 켜두고 폴링 — 캐시 불가, 접속자에 비례하는 유일한 DB 부하. 최악 가정으로 6~10초 간격
    pollers: { executor: 'constant-vus', vus: VUS, duration: DUR, exec: 'poller', startTime: '10s' },
    // 3) 접수 러시: 30초 동안 초당 20건 (대기번호 발급 락 경합)
    joiners: { executor: 'constant-arrival-rate', rate: 20, timeUnit: '1s', duration: '30s', preAllocatedVUs: 60, exec: 'joiner', startTime: '30s' },
    // 4) 스태프 5명이 보드를 5초마다
    staff: { executor: 'constant-vus', vus: 5, duration: DUR, exec: 'staff', startTime: '5s' },
  },
  thresholds: {
    'http_req_failed{scenario:viewers}': ['rate<0.01'],
    'http_req_duration{scenario:viewers}': ['p(95)<800'],
    'http_req_failed{scenario:pollers}': ['rate<0.01'],
    'http_req_duration{scenario:pollers}': ['p(95)<800'],
    'http_req_failed{scenario:joiners}': ['rate<0.02'],
    'http_req_duration{scenario:joiners}': ['p(95)<1500'],
    'http_req_failed{scenario:staff}': ['rate<0.01'],
    'http_req_duration{scenario:staff}': ['p(95)<1000'],
  },
}

export function setup() {
  // 폴링용 티켓 50장 + 스태프 세션
  const tokens = []
  for (let i = 0; i < 50; i++) {
    const phone = '0105' + String(1000000 + i).padStart(7, '0')
    const r = http.post(`${SB}/rest/v1/rpc/join_queue`, JSON.stringify({ p_slug: BOOTH, p_name: 'k6p' + i, p_phone: phone, p_party: 1, p_consent: true }), H)
    if (r.status === 200) tokens.push(r.json('token'))
  }
  const s = http.post(`${SB}/rest/v1/rpc/staff_login`, JSON.stringify({ p_slug: BOOTH, p_pin: '1234' }), H)
  const sess = s.status === 200 ? s.json() : null
  return { tokens, sess }
}

export function viewer() {
  const r = http.get(`${BASE}/api/public?fn=${Math.random() < 0.5 ? 'event_summary' : 'booth_summary'}&slug=${Math.random() < 0.5 ? SLUG : BOOTH}`)
  check(r, { 'viewer 200': x => x.status === 200 })
  sleep(15 + Math.random() * 10)
}

export function poller(data) {
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)]
  const r = http.post(`${SB}/rest/v1/rpc/get_ticket`, JSON.stringify({ p_token: token }), H)
  check(r, { 'poll 200': x => x.status === 200 && x.json('status') !== undefined })
  sleep(6 + Math.random() * 4)
}

export function joiner() {
  const phone = '010' + String(Math.floor(10000000 + Math.random() * 89999999))
  const r = http.post(`${SB}/rest/v1/rpc/join_queue`, JSON.stringify({ p_slug: BOOTH, p_name: 'k6', p_phone: phone, p_party: 1, p_consent: true }), H)
  check(r, { 'join 200': x => x.status === 200 })
}

export function staff(data) {
  if (!data.sess) return
  const r = http.post(`${SB}/rest/v1/rpc/staff_board`, JSON.stringify({ p_booth: data.sess.booth_id, p_token: data.sess.staff_token, p_date: null }), H)
  check(r, { 'staff 200': x => x.status === 200 })
  sleep(5)
}

export function handleSummary(data) {
  const m = data.metrics
  const pick = (name) => { const x = m[name]; return x ? { p95: Math.round(x.values['p(95)']), avg: Math.round(x.values.avg), max: Math.round(x.values.max), count: x.values.count } : null }
  const failed = (name) => { const x = m[name]; return x ? +(x.values.rate * 100).toFixed(2) : null }
  const out = {
    at: new Date().toISOString(), vus: VUS, duration: DUR, slug: SLUG, booth: BOOTH,
    viewers: { ...pick('http_req_duration{scenario:viewers}'), fail_pct: failed('http_req_failed{scenario:viewers}') },
    pollers: { ...pick('http_req_duration{scenario:pollers}'), fail_pct: failed('http_req_failed{scenario:pollers}') },
    joiners: { ...pick('http_req_duration{scenario:joiners}'), fail_pct: failed('http_req_failed{scenario:joiners}') },
    staff: { ...pick('http_req_duration{scenario:staff}'), fail_pct: failed('http_req_failed{scenario:staff}') },
    total_requests: m.http_reqs ? m.http_reqs.values.count : null,
    thresholds_passed: Object.values(data.metrics).every(x => !x.thresholds || Object.values(x.thresholds).every(t => t.ok)),
  }
  return { 'loadtest/results/latest.json': JSON.stringify(out, null, 2), stdout: textSummary(data, { indent: ' ', enableColors: false }) }
}
