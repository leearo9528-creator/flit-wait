// k6 부하 테스트 — 테스트 행사(test)에 대고 돌린다. 끝나면 생성된 k6 티켓은 소프트 취소(OPERATIONS.md 6-1 참고)
// 로컬: k6 run -e BASE=https://wait.flitunion.com -e SB=https://xxx.supabase.co -e KEY=<anon> -e SLUG=test -e BOOTH=t-tech-2 -e VUS=200 loadtest/k6.js
import http from 'k6/http'
import { check, sleep } from 'k6'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'

const BASE = __ENV.BASE, SB = __ENV.SB, KEY = __ENV.KEY, SLUG = __ENV.SLUG || 'test', BOOTH = __ENV.BOOTH || 't-tech-2'
const VUS = Number(__ENV.VUS || 200)
const COOK = __ENV.COOK || 't-cooking-tortilla' // 예약+현장대기 혼합(hybrid) 부스
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
    // 4) 쿠킹(hybrid): 예약 러시 초당 10건 30초 + 현장 대기 초당 5건 30초 — 같은 부스에 동시에
    reservers: { executor: 'constant-arrival-rate', rate: 10, timeUnit: '1s', duration: '30s', preAllocatedVUs: 40, exec: 'reserver', startTime: '30s' },
    walkins: { executor: 'constant-arrival-rate', rate: 5, timeUnit: '1s', duration: '30s', preAllocatedVUs: 20, exec: 'walkin', startTime: '30s' },
    // 5) 스태프 5명: 보드 5초마다 + 그중 1명은 3초마다 다음 호출→입장 실제 처리
    staff: { executor: 'constant-vus', vus: 5, duration: DUR, exec: 'staff', startTime: '5s' },
    operator: { executor: 'constant-vus', vus: 1, duration: DUR, exec: 'operator', startTime: '40s' },
  },
  thresholds: {
    'http_req_failed{scenario:viewers}': ['rate<0.01'],
    'http_req_duration{scenario:viewers}': ['p(95)<800'],
    'http_req_failed{scenario:pollers}': ['rate<0.01'],
    'http_req_duration{scenario:pollers}': ['p(95)<800'],
    'http_req_failed{scenario:joiners}': ['rate<0.02'],
    'http_req_duration{scenario:joiners}': ['p(95)<1500'],
    'http_req_failed{scenario:staff}': ['rate<0.01'],
    'http_req_failed{scenario:walkins}': ['rate<0.02'],
    'http_req_duration{scenario:reservers}': ['p(95)<1500'],
    'http_req_failed{scenario:operator}': ['rate<0.01'],
    'http_req_duration{scenario:staff}': ['p(95)<1000'],
  },
}

export function setup() {
  // 폴링용 티켓 50장 + 스태프 세션
  const tokens = []
  for (let i = 0; i < 50; i++) {
    const phone = '0105' + String(1000000 + (Date.now() % 1000000) * 50 % 9000000 + i).padStart(7, '0') // 실행마다 다른 번호 (중복 접수 거부 회피)
    const r = http.post(`${SB}/rest/v1/rpc/join_queue`, JSON.stringify({ p_slug: BOOTH, p_name: 'k6p' + i, p_phone: phone, p_party: 1, p_consent: true }), H)
    if (r.status === 200) tokens.push(r.json('token'))
  }
  const s = http.post(`${SB}/rest/v1/rpc/staff_login`, JSON.stringify({ p_slug: BOOTH, p_pin: '1234' }), H)
  const sess = s.status === 200 ? s.json() : null
  // 쿠킹 부스의 미래 회차 id 목록 (예약 러시 대상)
  const b = http.post(`${SB}/rest/v1/rpc/booth_summary`, JSON.stringify({ p_slug: COOK }), H)
  const slots = b.status === 200 ? b.json('slots').filter(x => x.status === 'open' && new Date(x.starts_at).getTime() > Date.now() + 2 * 3600e3).map(x => x.id) : []
  return { tokens, sess, slots }
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

export function reserver(data) {
  if (!data.slots.length) return
  const slot = data.slots[Math.floor(Math.random() * data.slots.length)]
  const phone = '0107' + String(Math.floor(1000000 + Math.random() * 8999999))
  const r = http.post(`${SB}/rest/v1/rpc/reserve_slot`, JSON.stringify({ p_slot: slot, p_name: 'k6r', p_phone: phone, p_party: 1 + Math.floor(Math.random() * 2), p_consent: true }), H)
  // 200 = 예약 성공, 400 + '잔여석' = 정원 초과 거부(정상) — 그 외는 실패
  const ok = r.status === 200 || (r.status === 400 && String(r.body).includes('잔여석'))
  check(r, { 'reserve ok|full': () => ok })
}

export function walkin() {
  const phone = '0106' + String(Math.floor(1000000 + Math.random() * 8999999))
  const r = http.post(`${SB}/rest/v1/rpc/join_queue`, JSON.stringify({ p_slug: COOK, p_name: 'k6w', p_phone: phone, p_party: 1, p_consent: true }), H)
  check(r, { 'walkin 200': x => x.status === 200 })
}

export function operator(data) {
  if (!data.sess) return
  const c = http.post(`${SB}/rest/v1/rpc/staff_update_ticket`, JSON.stringify({ p_booth: data.sess.booth_id, p_token: data.sess.staff_token, p_ticket: null, p_action: 'call_next' }), H)
  check(c, { 'call_next 200': x => x.status === 200 })
  sleep(1.5)
  if (c.status === 200 && c.json('ok')) {
    // 방금 호출된 팀을 보드에서 찾아 입장 처리
    const b = http.post(`${SB}/rest/v1/rpc/staff_board`, JSON.stringify({ p_booth: data.sess.booth_id, p_token: data.sess.staff_token, p_date: null }), H)
    const called = b.status === 200 ? b.json('queue').filter(t => t.status === 'called') : []
    if (called.length) {
      const r = http.post(`${SB}/rest/v1/rpc/staff_update_ticket`, JSON.stringify({ p_booth: data.sess.booth_id, p_token: data.sess.staff_token, p_ticket: called[0].id, p_action: 'checkin' }), H)
      check(r, { 'checkin 200': x => x.status === 200 })
    }
  }
  sleep(1.5)
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
    reservers: { ...pick('http_req_duration{scenario:reservers}'), fail_pct: failed('http_req_failed{scenario:reservers}') },
    walkins: { ...pick('http_req_duration{scenario:walkins}'), fail_pct: failed('http_req_failed{scenario:walkins}') },
    operator: { ...pick('http_req_duration{scenario:operator}'), fail_pct: failed('http_req_failed{scenario:operator}') },
    total_requests: m.http_reqs ? m.http_reqs.values.count : null,
    thresholds_passed: Object.values(data.metrics).every(x => !x.thresholds || Object.values(x.thresholds).every(t => t.ok)),
  }
  return { 'loadtest/results/latest.json': JSON.stringify(out, null, 2), stdout: textSummary(data, { indent: ' ', enableColors: false }) }
}
