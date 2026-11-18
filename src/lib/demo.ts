// 데모 모드 — 서버 없이 브라우저 안에서 돌아가는 가짜 Supabase. `/demo` 로 들어오면 켜진다.
// 용도: 마이그레이션·로그인 없이 관리자 화면과 손님 화면을 전부 눌러 보기 (영업 시연·내부 리뷰).
// 데이터는 localStorage 에 두고, '데모 초기화' 로 다시 깐다. 프로덕션 DB 는 전혀 안 건드린다.
// ⚠️ 기획자 흐름(e2e)에서 쓰는 /home/claude/fakesb.js 와 같은 논리 — 테이블 CRUD + RPC 스텁. 리포트 숫자는 샘플(가상).
export const DEMO_KEY = 'flit:demo'
/** 데모 샘플의 판 번호 — demoSeed 나 가짜 서버가 기대하는 데이터 모양이 바뀌면 올린다.
 *  예전 판으로 데모를 써 본 기기(팀 폰·영업 때 보여 준 폰)에 옛 샘플이 남아 있으면 '행사를 찾을 수 없습니다' 가 뜨거나 로딩에서 멈췄다 (2026-11-12).
 *  판이 다르면 demoBoot 가 옛 샘플을 지우고 새로 깐다. */
export const DEMO_VER = '2026-11-12'
/** 이 기기에 남은 데모 샘플이 지금 판과 다른가 (샘플이 없으면 false) */
export function demoStale(): boolean {
  try { return !!localStorage.getItem(`${DEMO_KEY}:db`) && localStorage.getItem(`${DEMO_KEY}:v`) !== DEMO_VER } catch { return false }
}
/** 행사 잠금 (2026-11-12) — 데모 주소를 `/demo?ev=fair` 처럼 행사 하나로 받은 기기는 그 행사만 본다.
 *  고르는 화면·'행사 바꾸기'가 안 나오고, 다른 데모 행사 주소로 가면 받은 행사로 돌아온다. `/demo?ev=all` 이 잠금을 푼다(내부 시연용).
 *  ⚠️ 브라우저 안에서만 거는 잠금이다 — 주소의 ev 값을 직접 바꾸면 넘어갈 수 있다. 진짜로 막으려면 서버가 서명한 토큰이 필요하다 */
const ONLY_KEY = 'flit:demo:only'
export const DEMO_KEYS = ['winter', 'beer', 'fair', 'univ', 'corp']
export const demoOnly = (): string | null => { try { return localStorage.getItem(ONLY_KEY) } catch { return null } }
export const setDemoOnly = (key: string | null) => { try { if (key) localStorage.setItem(ONLY_KEY, key); else localStorage.removeItem(ONLY_KEY) } catch { /* 저장소 없음 */ } }
/** 데모를 켜 둔 기기에서 실제 행사 QR 을 찍으면 데모의 가짜 서버가 응답해 '행사를 찾을 수 없습니다' 가 뜬다.
 *  주소가 가리키는 행사·부스·표가 데모 저장소에 없으면 실제 주소로 보고 데모를 끈다 (데모 내용은 남겨 둔다). */
function pathIsReal(): boolean {
  const m = /^\/(e|board|q|r|s|t|vo|v|o|h)\/([^/]+)/.exec(location.pathname); if (!m) return false
  const db = load(), key = decodeURIComponent(m[2])
  const has = (table: string, col: string) => (db[table] ?? []).some(r => r[col] === key)
  if (m[1] === 'e' || m[1] === 'board') return key !== 'demo' && !has('events', 'slug')
  if (m[1] === 't') return !has('tickets', 'token')
  if (m[1] === 'v') return !has('events', 'vendor_token')
  if (m[1] === 'o') return !has('orders', 'token')
  if (m[1] === 'vo') return !key.startsWith('demo-vo-')
  if (m[1] === 'h') return !key.startsWith('demo-host')
  return !key.startsWith('demo-') && !has('booths', 'slug')
}
/** 데모가 심어 둔 가짜 로그인 토큰을 지운다 — 남아 있으면 실제 서버가 요청을 거절한다 */
function dropDemoToken() {
  for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k) && (localStorage.getItem(k) ?? '').includes('"access_token":"demo"')) localStorage.removeItem(k)
}
export function leaveDemo() { localStorage.removeItem(DEMO_KEY); dropDemoToken() }
export const isDemo = () => {
  try {
    if (localStorage.getItem(DEMO_KEY) !== '1') { dropDemoToken(); return false }   // 예전에 데모를 끝낸 기기에 남은 가짜 토큰 정리
    if (pathIsReal()) { leaveDemo(); return false }
    return true
  } catch { return false }
}

export type Row = Record<string, any>
/** 주소(행사 slug · 부스 slug)가 어느 데모 행사 것인지 — 데모가 아닌 기기에서 데모 주소를 열었을 때 그 행사로 보내려고 쓴다 */
export function demoKeyOf(slug: string): 'winter' | 'beer' | 'fair' | 'univ' | 'corp' | null {
  if (slug === 'demo') return 'winter'
  const m = /^demo-([a-z]+)/.exec(slug); if (!m) return null
  return (['beer', 'fair', 'univ', 'corp'] as const).find(k => k === m[1]) ?? 'winter'   // demo-fish 같은 예전 부스 주소는 겨울 축제
}

export const hostToken = (slug: string) => slug === 'demo' ? 'demo-host' : slug.startsWith('demo-') ? `demo-host-${slug.slice(5)}` : `demo-host-${slug}`
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
export const now = () => new Date().toISOString()
export const DEMO_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'demo@flitunion.com', aud: 'authenticated', role: 'authenticated', user_metadata: { name: '데모 기획자' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }

export function load(): Record<string, Row[]> { try { return JSON.parse(localStorage.getItem(`${DEMO_KEY}:db`) || '{}') } catch { return {} } }
export function save(db: Record<string, Row[]>) { try { localStorage.setItem(`${DEMO_KEY}:db`, JSON.stringify(db)) } catch {} }

/** 데모 띠의 '손님·스태프·사장님·주최' 링크 — 지금 보고 있는 데모 행사 기준. 행사는 주소에서 읽고, 못 읽으면 마지막으로 고른 행사 */
export function demoLinks(): { guest: string; staff: string | null; vendor: string | null; host: string } {
  const db = load(), evs = db.events ?? []
  const m = /^\/(?:e|board)\/([^/]+)/.exec(location.pathname)
  let slug = m ? decodeURIComponent(m[1]) : null
  if (!slug) { const b = /^\/(?:q|r|s)\/([^/]+)/.exec(location.pathname); const booth = b && (db.booths ?? []).find(x => x.slug === decodeURIComponent(b[1])); slug = booth ? evs.find(e => e.id === booth.event_id)?.slug ?? null : null }
  try { if (slug && evs.some(e => e.slug === slug)) localStorage.setItem(`${DEMO_KEY}:ev`, slug); else slug = localStorage.getItem(`${DEMO_KEY}:ev`) } catch { /* 저장소 없음 */ }
  const e = evs.find(x => x.slug === slug) ?? evs.find(x => x.slug === 'demo') ?? evs[0]
  if (!e) return { guest: '/demo', staff: null, vendor: null, host: '/h/demo-host' }
  const staff = (db.booths ?? []).filter(b => b.event_id === e.id && b.mode !== 'slot').sort((a, b) => a.sort_order - b.sort_order)[0]
  // 사장님 화면 토큰은 '메뉴가 있는 먹거리' 순서대로 demo-vo-1,2,… 가 붙는다 (tickOrders). 이미 붙은 게 있으면 그걸 쓴다
  const foods = (db.places ?? []).filter(p => p.kind === 'food' && (p.menu ?? []).length), mine = foods.find(p => p.event_id === e.id)
  const os = mine && (db.order_settings ?? []).find(o => o.place_id === mine.id)
  return { guest: `/e/${e.slug}`, staff: staff ? `/s/${staff.slug}` : null, vendor: mine ? `/vo/${os?.token ?? `demo-vo-${foods.indexOf(mine) + 1}`}` : null, host: `/h/${hostToken(e.slug)}` }
}

/** 데모 켜기: 플래그 + 세션 + 샘플 행사. 이미 켜져 있으면 데이터는 유지 */
/** 데모 플래그와 가짜 로그인 토큰을 심는다. 동기 함수 — demoBoot 가 supabase 클라이언트보다 먼저 부른다 */
export function startDemo(reset = false) {
  if (reset || demoStale()) { localStorage.removeItem(`${DEMO_KEY}:db`) }
  localStorage.setItem(`${DEMO_KEY}:v`, DEMO_VER)
  localStorage.setItem(DEMO_KEY, '1')
  const ref = new URL(import.meta.env.VITE_SUPABASE_URL).host.split('.')[0]
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'demo', refresh_token: 'demo', expires_in: 999999, expires_at: Math.floor(Date.now() / 1000) + 999999, token_type: 'bearer', user: DEMO_USER }))
}
