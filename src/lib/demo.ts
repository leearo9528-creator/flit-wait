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
  if (m[1] === 'h') return key !== 'demo-host'
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

type Row = Record<string, any>
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
const now = () => new Date().toISOString()
export const DEMO_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'demo@flitunion.com', aud: 'authenticated', role: 'authenticated', user_metadata: { name: '데모 기획자' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }

function load(): Record<string, Row[]> { try { return JSON.parse(localStorage.getItem(`${DEMO_KEY}:db`) || '{}') } catch { return {} } }
function save(db: Record<string, Row[]>) { try { localStorage.setItem(`${DEMO_KEY}:db`, JSON.stringify(db)) } catch {} }

export function makeDemoFetch(): typeof fetch {
  const db = load()
  const T = (n: string) => (db[n] ||= [])
  const persist = () => save(db)
  const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...headers } })


  // ── 대기·예약 시뮬레이션 (2026-11-10) — 손님·스태프·관리자·현황판이 같은 표(tickets)를 본다.
  // 부스마다 가상 손님 표를 미리 깔아 두고, 12초에 한 팀씩 호출→입장이 저절로 흘러간다(시연 속도).
  // 스태프 화면에 들어간 부스는 저절로 흐르지 않고 스태프 버튼으로만 움직인다 (b.manual).
  const TEAM_MS = 12_000
  const FAM = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오']
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const evOf = (b: Row) => T('events').find(e => e.id === b.event_id) ?? {}
  const svc = (b: Row) => b.settings?.service_min ?? 5
  const ord = (t: Row): number => t.ord ?? t.ticket_no   // 대기 순서 — 순서를 미룬 표는 ord 가 따로 있다
  const qOf = (b: Row) => T('tickets').filter(t => t.booth_id === b.id && !t.slot_id && t.ticket_date === today())
  const fakeTicket = (b: Row, status: string, agoMs = 0): Row => {
    const no = b.next_no = (b.next_no ?? 0) + 1, at = new Date(Date.now() - agoMs).toISOString()
    return { id: uid(), token: uid(), booth_id: b.id, event_id: b.event_id, slot_id: null, name: `${FAM[no % FAM.length]}○○`, phone: `0100000${String(1000 + (no * 37) % 9000)}`, party_size: 1 + (no % 4), ticket_no: no, status, source: no % 5 === 0 ? 'onsite' : 'online', fake: true, ticket_date: today(), created_at: at, called_at: status === 'waiting' ? null : at, checked_in_at: status === 'done' ? at : null }
  }
  const target = (b: Row) => { const base = b.demo_wait ?? 0, i = T('booths').indexOf(b); return Math.max(0, base + (base ? Math.round(1.6 * Math.sin(Date.now() / 90_000 + i * 1.7)) : 0)) }
  /** 시뮬레이션을 지금 시각까지 돌린다 — 모든 조회·접수 전에 부른다 */
  const tick = () => {
    let dirty = false
    for (const b of T('booths')) {
      if (b.mode === 'slot') continue
      if (b.sim_day !== today()) {          // 첫 실행(또는 날짜 바뀜): 오늘 치 가상 손님을 깐다
        b.sim_day = today(); b.sim_at = Date.now(); b.next_no = 0; b.manual = false
        const i = T('booths').indexOf(b), done = 24 + i * 9
        for (let k = 0; k < done; k++) T('tickets').push(fakeTicket(b, k % 11 === 7 ? 'no_show' : 'done', (done - k) * 4 * 60_000))
        for (let k = 0; k < 2; k++) T('tickets').push(fakeTicket(b, 'called', (2 - k) * 60_000))
        for (let k = 0; k < (b.demo_wait ?? 0); k++) T('tickets').push(fakeTicket(b, 'waiting', ((b.demo_wait ?? 0) - k) * 3 * 60_000))
        dirty = true
      }
      const steps = Math.min(60, Math.floor((Date.now() - b.sim_at) / TEAM_MS))
      if (steps <= 0) continue
      b.sim_at += steps * TEAM_MS; dirty = true
      for (let n = 0; n < steps; n++) {
        const q = qOf(b)
        if (!b.manual && !b.is_paused) {
          const oldCalled = q.filter(t => t.status === 'called' && t.fake)
          if (oldCalled.length) { oldCalled[0].status = 'done'; oldCalled[0].checked_in_at = now() }
          const head = q.filter(t => t.status === 'waiting').sort((x, y) => ord(x) - ord(y))[0]
          if (head && q.filter(t => t.status === 'called' && t.fake).length < 2) { head.status = 'called'; head.called_at = now() }
        }
        if (qOf(b).filter(t => t.status === 'waiting').length < target(b)) T('tickets').push(fakeTicket(b, 'waiting'))
      }
    }
    if (dirty) persist()
  }
  const tState = (t: Row) => {
    if (t.slot_id || t.status !== 'waiting') return { status: t.status as string, ahead: null as number | null }
    return { status: 'waiting', ahead: T('tickets').filter(x => x.booth_id === t.booth_id && !x.slot_id && x.ticket_date === t.ticket_date && x.status === 'waiting' && ord(x) < ord(t)).length }
  }
  const liveWait = (b: Row) => b.mode === 'slot' ? 0 : qOf(b).filter(t => t.status === 'waiting').length
  const staffT = (t: Row) => ({ id: t.id, ticket_no: t.ticket_no, name: t.name, phone_tail: t.phone ? String(t.phone).replace(/\D/g, '').slice(-4) : null, party_size: t.party_size, status: t.status, called_at: t.called_at ?? null, created_at: t.created_at, source: t.source ?? 'online', checked_in_at: t.checked_in_at ?? null, updated_at: t.updated_at ?? t.created_at, defer_count: t.defer_count ?? 0 })
  const slotsOf = (b: Row) => {
    if (b.mode === 'queue') return []
    // 회차는 1시간 간격 6개. 저녁 6시 이후에 열면 자정을 넘기지 않게 간격을 줄인다 (22시 → 20분 간격)
    const cap = b.slug === 'demo-kids' ? 30 : 60, nowD = new Date(), h = nowD.getHours()
    const step = h < 18 ? 60 : Math.max(10, Math.floor((24 - h) * 60 / 6 / 10) * 10), dur = Math.max(5, step - 10)
    const h0 = new Date(nowD); h0.setMinutes(Math.floor(nowD.getMinutes() / step) * step, 0, 0)
    return [0, 1, 2, 3, 4, 5].map(k => {
      const st = new Date(h0.getTime() + k * step * 60_000), id = `${b.id}|${st.toISOString()}`
      const mine = T('tickets').filter(t => t.slot_id === id && t.status !== 'cancelled').reduce((a, t) => a + t.party_size, 0)
      const fake = k === 0 ? cap : Math.round(cap * [1, 0.9, 0.55, 0.3, 0.12, 0.05][k])
      return { id, starts_at: st.toISOString(), ends_at: new Date(st.getTime() + dur * 60_000).toISOString(), capacity: cap, status: 'open', reserved: Math.min(cap, fake + mine) }
    })
  }
  const slotInfo = (b: Row) => {
    const fut = slotsOf(b).filter(x => new Date(x.starts_at).getTime() > Date.now())
    const left = fut.reduce((a, x) => a + Math.max(0, x.capacity - x.reserved), 0)
    return { today_slots: fut.length, today_left: left, total_left: left, next_slot_at: fut.find(x => x.capacity > x.reserved)?.starts_at ?? null, next: fut.find(x => x.capacity > x.reserved) ?? null }
  }
  const boothLive = (b: Row) => { const w = liveWait(b), si = slotInfo(b); return { waiting_teams: w, est_wait_min: b.mode === 'slot' ? null : w * svc(b), today_slots: si.today_slots, today_left: si.today_left, total_left: si.total_left, next_slot_at: si.next_slot_at } }
  const ticketOut = (t: Row) => {
    const b = T('booths').find(x => x.id === t.booth_id) ?? {}, e = evOf(b), st = tState(t)
    const slot = t.slot_id ? slotsOf(b).find(x => x.id === t.slot_id) ?? { starts_at: t.slot_id.split('|')[1], ends_at: new Date(new Date(t.slot_id.split('|')[1]).getTime() + 50 * 60_000).toISOString(), status: 'open' } : null
    return { id: t.id, name: t.name, party_size: t.party_size, ticket_no: t.ticket_no, status: st.status, called_at: t.called_at ?? null, created_at: t.created_at, phone_tail: String(t.phone ?? '').slice(-4), ahead: st.ahead, est_wait_min: st.ahead != null ? st.ahead * svc(b) : null, source: t.source ?? 'online', booth: { name: b.name, slug: b.slug, mode: b.mode, location: b.location, is_paused: b.is_paused, settings: b.settings }, event: { name: e.name, slug: e.slug, notice: e.notice ?? null }, slot: slot ? { starts_at: slot.starts_at, ends_at: slot.ends_at, status: slot.status } : null, can_cancel: st.status === 'waiting' }
  }

  // ── 주문 · 픽업 (0046) — 먹거리 가게마다 주문 설정을 깔고, 손님 주문은 저절로 접수→준비 완료로 흘러간다.
  // 사장님 화면(/vo/demo-vo-1)을 연 가게는 저절로 흐르지 않고 버튼으로만 움직이며, 가상 주문이 가끔 들어온다.
  const priceInt = (v: unknown) => Number(String(v ?? '').replace(/\D/g, '')) || 0
  const osOf = (placeId: string) => T('order_settings').find(o => o.place_id === placeId)
  const ordersOf = (placeId: string) => T('orders').filter(o => o.place_id === placeId && o.order_date === today())
  const fakeOrder = (pl: Row, agoMs = 0): Row => {
    const no = Math.max(0, ...ordersOf(pl.id).map(o => o.order_no)) + 1, menu = (pl.menu ?? []).filter((m: Row) => !m.sold_out && priceInt(m.price) > 0)
    const items = menu.slice(no % Math.max(1, menu.length)).slice(0, 1 + (no % 2)).map((m: Row, i: number) => ({ name: m.name, price: priceInt(m.price), qty: 1 + ((no + i) % 2) }))
    return { id: uid(), token: uid(), event_id: pl.event_id, place_id: pl.id, order_no: no, order_date: today(), name: `${FAM[no % FAM.length]}○○`, phone: `0100000${String(1000 + (no * 53) % 9000)}`, items, total: items.reduce((a: number, l: Row) => a + l.price * l.qty, 0), note: no % 4 === 0 ? '덜 맵게 해 주세요' : null, status: 'placed', cancel_reason: null, pay_method: 'onsite', pay_status: 'unpaid', created_at: new Date(Date.now() - agoMs).toISOString(), accepted_at: null, ready_at: null, picked_at: null, fake: true }
  }
  const tickOrders = () => {
    let dirty = false
    T('places').filter(p => p.kind === 'food' && (p.menu ?? []).length).forEach((pl, i) => {
      if (!osOf(pl.id)) { T('order_settings').push({ place_id: pl.id, enabled: true, paused: false, token: `demo-vo-${i + 1}`, pay_mode: 'onsite', manual: false, fake_at: 0 }); dirty = true }
      const os = osOf(pl.id)!
      for (const o of ordersOf(pl.id)) {
        const age = Date.now() - new Date(o.created_at).getTime()
        if (os.manual) continue
        if (o.status === 'placed' && age > 5_000) { o.status = 'accepted'; o.accepted_at = now(); dirty = true }
        else if (o.status === 'accepted' && age > 20_000) { o.status = 'ready'; o.ready_at = now(); dirty = true }
      }
      if (os.manual && os.enabled && !os.paused && Date.now() - (os.fake_at ?? 0) > 25_000 && ordersOf(pl.id).filter(o => o.status === 'placed' || o.status === 'accepted').length < 3) {
        T('orders').push(fakeOrder(pl)); os.fake_at = Date.now(); dirty = true
      }
    })
    if (dirty) persist()
  }
  const orderOut = (o: Row) => {
    const pl = T('places').find(p => p.id === o.place_id) ?? {}, e = T('events').find(x => x.id === o.event_id) ?? {}
    const busy = o.status === 'placed' || o.status === 'accepted'
    return { order_no: o.order_no, status: o.status, items: o.items, total: o.total, name: o.name, note: o.note ?? null, pay_method: o.pay_method, pay_status: o.pay_status, cancel_reason: o.cancel_reason ?? null, created_at: o.created_at, accepted_at: o.accepted_at, ready_at: o.ready_at, picked_at: o.picked_at,
      ahead: busy ? ordersOf(o.place_id).filter(x => (x.status === 'placed' || x.status === 'accepted') && x.order_no < o.order_no).length : null, can_cancel: o.status === 'placed',
      place: { id: pl.id, name: pl.name, kind: pl.kind }, event: { slug: e.slug, name: e.name } }
  }
  const vendorPlace = (token: string) => { const os = T('order_settings').find(o => o.token === token); const pl = os && T('places').find(p => p.id === os.place_id); if (!os || !pl) throw new Error('주문 화면 주소가 맞지 않아요. 플릿에 문의해 주세요.'); return { os, pl } }

  const rpc: Record<string, (a: Row) => unknown> = {
    // 주최 화면 (0047) — 데모 링크는 /h/demo-host
    admin_host_link: () => 'demo-host',
    host_board: () => {
      const e = T('events').find(x => x.slug === 'demo') ?? T('events')[0]; if (!e) throw new Error('주최 화면 주소가 맞지 않아요. 플릿에 문의해 주세요.')
      const ts = T('tickets').filter(t => t.event_id === e.id && t.ticket_date === today()), os = T('orders').filter(o => o.event_id === e.id && o.order_date === today())
      return { event: { name: e.name, slug: e.slug, status: e.status },
        stats: { waiting: ts.filter(t => !t.slot_id && (t.status === 'waiting' || t.status === 'called')).length, served: ts.filter(t => t.status === 'done' || t.status === 'checked_in').length, visits: 1842 + Math.floor((Date.now() / 60000) % 60), orders: 37 + os.filter(o => o.status !== 'cancelled').length, sales: 412000 + os.filter(o => o.status === 'picked_up').reduce((a, o) => a + o.total, 0) },
        notices: T('notices').filter(n => n.event_id === e.id && (!n.expires_at || new Date(n.expires_at).getTime() > Date.now())).sort((a, b) => String(b.publish_at).localeCompare(String(a.publish_at))).map(n => ({ id: n.id, title: n.title, body: n.body ?? null, urgent: !!n.urgent, publish_at: n.publish_at })),
        places: T('places').filter(p => p.event_id === e.id && !p.booth_id && ['parking', 'food', 'market', 'stage', 'facility', 'shuttle'].includes(p.kind)).sort((a, b) => a.sort_order - b.sort_order).map(p => ({ id: p.id, name: p.name, kind: p.kind, crowd: p.crowd ?? null, crowd_updated_at: p.crowd_updated_at ?? null })) }
    },
    host_post_notice: ({ p_title, p_body, p_urgent }) => { const e = T('events').find(x => x.slug === 'demo') ?? T('events')[0]; if (String(p_title ?? '').trim().length < 2) throw new Error('공지 제목을 적어 주세요.'); T('notices').push({ id: uid(), event_id: e.id, title: String(p_title).trim(), body: p_body || null, urgent: !!p_urgent, pinned: false, publish_at: now(), expires_at: null, created_at: now() }); persist(); return { ok: true } },
    host_end_notice: ({ p_notice }) => { const n = T('notices').find(x => x.id === p_notice); if (n) { n.expires_at = now(); persist() } return { ok: true } },
    host_set_crowd: ({ p_place, p_crowd }) => { const pl = T('places').find(x => x.id === p_place); if (pl) { pl.crowd = p_crowd ?? null; pl.crowd_updated_at = p_crowd ? now() : null; persist() } return { ok: true } },
    admin_order_report: ({ p_event }) => {
      const ps = T('places').filter(p => p.event_id === p_event && p.kind === 'food' && (p.menu ?? []).length)
      const by_place = ps.map((p, i) => { const orders = [214, 167, 131][i % 3], cancelled = [9, 4, 6][i % 3], picked = orders - cancelled, per = (p.menu ?? []).reduce((a: number, m: Row) => a + priceInt(m.price), 0) / Math.max(1, p.menu.length) * 1.7; return { name: p.name, orders, picked, cancelled, sales: Math.round(picked * per / 100) * 100, avg_ready_min: [6.4, 8.1, 3.2][i % 3] } })
      const tot = (k: string) => by_place.reduce((a, x: any) => a + x[k], 0)
      return { orders: tot('orders'), picked: tot('picked'), cancelled: tot('cancelled'), sales: tot('sales'), avg_ready_min: 6.1, by_place: by_place.sort((a, b) => b.sales - a.sales),
        by_hour: [11, 12, 13, 14, 15, 16, 17, 18, 19].map((h, i) => ({ hour: h, orders: [22, 71, 88, 52, 41, 49, 67, 84, 38][i], sales: 0 })), by_day: [],
        top_items: ps.flatMap(p => (p.menu ?? []).filter((m: Row) => !m.sold_out).map((m: Row, k: number) => ({ name: m.name, place: p.name, qty: 140 - k * 31 - (p.sort_order % 7) * 3, sales: 0 }))).sort((a, b) => b.qty - a.qty).slice(0, 10) }
    },
    place_order: ({ p_place, p_name, p_phone, p_items, p_consent, p_note }) => {
      if (!p_consent) throw new Error('개인정보 수집·이용에 동의해 주세요.')
      const pl = T('places').find(p => p.id === p_place), os = pl && osOf(pl.id)
      if (!pl) throw new Error('가게를 찾을 수 없습니다.')
      if (!os?.enabled) throw new Error('이 가게는 앱 주문을 받지 않아요.')
      if (os.paused) throw new Error('지금은 주문이 잠시 멈춰 있어요. 조금 뒤에 다시 해 주세요.')
      if (String(p_phone ?? '').replace(/\D/g, '').length < 10) throw new Error('휴대폰번호를 확인해 주세요.')
      if (!Array.isArray(p_items) || !p_items.length) throw new Error('메뉴를 담아 주세요.')
      const items = p_items.map((it: Row) => { const m = (pl.menu ?? []).find((x: Row) => x.name === it.name); if (!m) throw new Error(`메뉴가 바뀌었어요. 다시 담아 주세요. (${it.name})`); if (m.sold_out) throw new Error(`${m.name} 은(는) 품절됐어요.`); return { name: m.name, price: priceInt(m.price), qty: it.qty } })
      const o: Row = { ...fakeOrder(pl), name: String(p_name).trim(), phone: String(p_phone).replace(/\D/g, ''), items, total: items.reduce((a: number, l: Row) => a + l.price * l.qty, 0), note: p_note || null, fake: false }
      T('orders').push(o); persist(); return { token: o.token, order_no: o.order_no, total: o.total }
    },
    get_order: ({ p_token }) => { const o = T('orders').find(x => x.token === p_token); return o ? orderOut(o) : null },
    cancel_order: ({ p_token }) => { const o = T('orders').find(x => x.token === p_token); if (!o) throw new Error('주문을 찾을 수 없습니다.'); if (o.status !== 'placed') throw new Error('가게에서 이미 준비를 시작했어요. 취소는 가게에 직접 말씀해 주세요.'); o.status = 'cancelled'; o.cancel_reason = '손님 취소'; persist(); return orderOut(o) },
    vendor_board: ({ p_token }) => {
      const { os, pl } = vendorPlace(p_token), e = T('events').find(x => x.id === pl.event_id) ?? {}
      if (!os.manual) { os.manual = true; os.fake_at = Date.now() - 20_000; if (!ordersOf(pl.id).some(o => o.status === 'placed')) T('orders').push(fakeOrder(pl, 40_000)); persist() }
      const os2 = ordersOf(pl.id).sort((a, b) => a.order_no - b.order_no), picked = os2.filter(o => o.status === 'picked_up')
      return { place: { id: pl.id, name: pl.name, menu: pl.menu ?? [] }, event: { name: e.name, slug: e.slug }, enabled: os.enabled, paused: os.paused, pay_mode: os.pay_mode,
        orders: os2.map(o => ({ id: o.id, order_no: o.order_no, status: o.status, items: o.items, total: o.total, name: o.name, phone_tail: String(o.phone ?? '').slice(-4), note: o.note ?? null, pay_status: o.pay_status, pay_method: o.pay_method, cancel_reason: o.cancel_reason ?? null, created_at: o.created_at, accepted_at: o.accepted_at, ready_at: o.ready_at, picked_at: o.picked_at })),
        stats: { count: picked.length, total: picked.reduce((a, o) => a + o.total, 0) } }
    },
    vendor_update_order: ({ p_token, p_order, p_action, p_reason }) => {
      const { pl } = vendorPlace(p_token), o = T('orders').find(x => x.id === p_order && x.place_id === pl.id); if (!o) throw new Error('주문을 찾을 수 없습니다.')
      const s = o.status
      if (p_action === 'accept' && s === 'placed') { o.status = 'accepted'; o.accepted_at = now() }
      else if (p_action === 'ready' && (s === 'placed' || s === 'accepted')) { o.status = 'ready'; o.ready_at = now() }
      else if (p_action === 'picked' && (s === 'ready' || s === 'accepted')) { o.status = 'picked_up'; o.picked_at = now() }
      else if (p_action === 'cancel' && s !== 'picked_up' && s !== 'cancelled') { o.status = 'cancelled'; o.cancel_reason = p_reason || '가게 사정' }
      else if (p_action === 'back' && s === 'ready') { o.status = 'accepted'; o.ready_at = null }
      else if (p_action === 'back' && s === 'picked_up') { o.status = 'ready'; o.picked_at = null }
      else if (p_action === 'back' && s === 'cancelled') { o.status = 'placed'; o.cancel_reason = null }
      else throw new Error('이미 처리된 주문이에요. 화면을 새로 고쳐 주세요.')
      persist(); return { ok: true }
    },
    vendor_set_soldout: ({ p_token, p_name, p_sold }) => { const { pl } = vendorPlace(p_token); pl.menu = (pl.menu ?? []).map((m: Row) => m.name === p_name ? { ...m, sold_out: !!p_sold } : m); persist(); return { ok: true } },
    vendor_set_paused: ({ p_token, p_paused }) => { const { os } = vendorPlace(p_token); os.paused = !!p_paused; persist(); return { ok: true } },
    admin_order_settings: ({ p_place, p_enabled, p_new_token }) => {
      let os = osOf(p_place); if (!os) { os = { place_id: p_place, enabled: false, paused: false, token: `demo-vo-${uid().slice(0, 8)}`, pay_mode: 'onsite', manual: false, fake_at: 0 }; T('order_settings').push(os) }
      if (p_enabled != null) os.enabled = !!p_enabled
      if (p_new_token) os.token = `demo-vo-${uid().slice(0, 8)}`
      persist(); const os2 = ordersOf(p_place)
      return { enabled: os.enabled, paused: os.paused, token: os.token, pay_mode: os.pay_mode, today: { count: os2.filter(o => o.status !== 'cancelled').length, total: os2.filter(o => o.status === 'picked_up').reduce((a, o) => a + o.total, 0) } }
    },
    my_admin_scope: () => ({ owner: true, event_ids: T('events').map(e => e.id) }),
    create_my_event: ({ p_name, p_slug, p_starts_at, p_ends_at }) => {
      const id = uid()
      T('events').push({ id, name: p_name, slug: p_slug, starts_at: p_starts_at, ends_at: p_ends_at, status: 'draft', notice: null, privacy_text: '개인정보는 행사 종료 후 7일 내 삭제돼요.', data_retention_days: 7, image_url: null, map_image_url: null, map_note: null, lat: 37.3947, lng: 127.1112, vendor_token: 'demo-vendor', vendor_open: false, stamp_enabled: false, stamp_goal: null, stamp_reward_text: null, accent_color: null, info_text: null, contact_text: null, directions_text: null, created_at: now() })
      persist(); return id
    },
    gen_admin_code: () => 'FLIT-DEMO-0001',
    admin_purge_event: () => 0,
    track_view: () => null,
    admin_event_stats: ({ p_event }) => {
      const ts = T('tickets').filter(t => t.event_id === p_event), served = (t: Row) => t.status === 'done' || t.status === 'checked_in'
      const hours = new Map<string, number>(); ts.forEach(t => { const h = t.created_at.slice(0, 13) + ':00:00.000Z'; hours.set(h, (hours.get(h) ?? 0) + 1) })
      const sent = ts.filter(t => t.called_at && t.phone).length
      return { by_booth: T('booths').filter(b => b.event_id === p_event).map(b => { const x = ts.filter(t => t.booth_id === b.id); if (b.mode === 'slot') { const sl = slotsOf(b), rsv = sl.reduce((a, q) => a + q.reserved, 0), past = sl.filter(q => new Date(q.starts_at).getTime() <= Date.now()).reduce((a, q) => a + q.reserved, 0); return { booth_id: b.id, name: b.name, mode: b.mode, total: Math.round(rsv / 2), queue_total: 0, served: Math.round(past * 0.9 / 2), no_show: Math.round(past * 0.06 / 2), cancelled: x.filter(t => t.status === 'cancelled').length, reserved_seats: rsv, capacity: sl.reduce((a, q) => a + q.capacity, 0), avg_wait_min: null, people: Math.round(past * 0.9) } } return { booth_id: b.id, name: b.name, mode: b.mode, total: x.length, served: x.filter(served).length, no_show: x.filter(t => t.status === 'no_show').length, cancelled: x.filter(t => t.status === 'cancelled').length, queue_total: x.filter(t => !t.slot_id).length, reserved_seats: x.filter(t => t.slot_id && t.status !== 'cancelled').reduce((a, t) => a + t.party_size, 0), capacity: slotsOf(b).reduce((a, sl) => a + sl.capacity, 0), avg_wait_min: b.mode === 'slot' ? null : Math.round((b.demo_wait ?? 1) * svc(b) * 0.6), people: x.filter(served).reduce((a, t) => a + t.party_size, 0) } }), by_hour: [...hours].sort().map(([hour, count]) => ({ hour, count })), notifications: { sent, failed: 0 }, by_channel: { alimtalk: sent, sms: 0 } }
    },
    admin_vendor_approve: ({ p_submission }) => { const s = T('vendor_submissions').find(x => x.id === p_submission); if (!s) return null; const id = uid(); T('places').push({ id, event_id: s.event_id, kind: s.kind, name: s.name, description: s.description, menu: s.menu, image_url: s.image_url, x: 50, y: 50, sort_order: 999, booth_id: null, hours: null, lat: null, lng: null, crowd: null }); s.status = 'approved'; s.place_id = id; persist(); return id },
    admin_draw_pick: ({ p_draw }) => { const es = T('draw_entries').filter(e => e.draw_id === p_draw); es.forEach(e => e.won = false); const d = T('draws').find(x => x.id === p_draw); const n = Math.min(d?.winners_count ?? 1, es.length); es.slice(0, n).forEach(e => e.won = true); if (d) d.status = 'drawn'; persist(); return es.filter(e => e.won).map(e => ({ name: e.name, phone: e.phone })) },
    admin_survey_summary: ({ p_event }) => SAMPLE.survey(p_event, T),
    admin_event_report: ({ p_event }) => SAMPLE.report(p_event, T),
    admin_event_report_extra: ({ p_event }) => ({ survey: SAMPLE.survey(p_event, T), draws: T('draws').filter(d => d.event_id === p_event).map(d => ({ title: d.title, status: d.status, entries: T('draw_entries').filter(e => e.draw_id === d.id).length + 377, winners: d.winners_count })), vendors: { pending: T('vendor_submissions').filter(v => v.event_id === p_event && v.status === 'pending').length, approved: 28 } }),
    admin_event_dataset: ({ p_event }) => SAMPLE.dataset(p_event, T),
    // 스태프 (데모: PIN 은 아무 숫자 4자리)
    staff_login: ({ p_slug }) => { const b = T('booths').find(x => x.slug === p_slug); if (!b) throw new Error('부스를 찾을 수 없습니다.'); b.manual = true; persist(); return { booth_id: b.id, staff_token: 'demo', booth: b } },
    staff_board: ({ p_booth }) => {
      const b = T('booths').find(x => x.id === p_booth); if (!b) throw new Error('부스를 찾을 수 없습니다.')
      if (!b.manual) { b.manual = true; persist() }
      const q = qOf(b)
      const slots = slotsOf(b).map(sl => {
        const real = T('tickets').filter(t => t.slot_id === sl.id).map(staffT), fakeN = Math.min(10, Math.max(0, sl.reserved - real.reduce((a, t) => a + t.party_size, 0)) >> 1)
        const past = new Date(sl.starts_at).getTime() <= Date.now()
        const fake = Array.from({ length: fakeN }, (_, k) => ({ id: `fake|${sl.id}|${k}`, ticket_no: null, name: `${FAM[(k * 5 + 3) % FAM.length]}○○`, phone_tail: String(1000 + (k * 811) % 9000), party_size: 2, status: (past && k % 4 !== 3 ? 'checked_in' : 'waiting'), called_at: null, created_at: sl.starts_at, source: 'online', checked_in_at: past ? sl.starts_at : null, updated_at: sl.starts_at }))
        return { id: sl.id, starts_at: sl.starts_at, ends_at: sl.ends_at, capacity: sl.capacity, status: sl.status, tickets: [...real, ...fake] }
      })
      return { booth: b, date: today(), dates: [today()], queue: q.filter(t => t.status === 'waiting' || t.status === 'called').sort((x, y) => ord(x) - ord(y)).map(staffT), history: q.filter(t => !['waiting', 'called'].includes(t.status)).sort((x, y) => y.ticket_no - x.ticket_no).slice(0, 30).map(staffT), done_today: q.filter(t => t.status === 'done' || t.status === 'checked_in').length, noshow_today: q.filter(t => t.status === 'no_show').length, slots }
    },
    staff_update_ticket: ({ p_booth, p_ticket, p_action }) => {
      const b = T('booths').find(x => x.id === p_booth); if (!b) throw new Error('부스를 찾을 수 없습니다.')
      if (String(p_ticket ?? '').startsWith('fake|')) return { ok: true }
      let t = p_ticket ? T('tickets').find(x => x.id === p_ticket) : null
      if (p_action === 'call_next') { t = qOf(b).filter(x => x.status === 'waiting').sort((x, y) => ord(x) - ord(y))[0]; if (!t) return { ok: false, message: '기다리는 팀이 없어요.' } }
      if (!t) return { ok: false, message: '표를 찾을 수 없어요.' }
      if (p_action === 'call_next' || p_action === 'call') { t.status = 'called'; t.called_at = now() }
      else if (p_action === 'checkin' || p_action === 'done') { t.status = t.slot_id ? 'checked_in' : 'done'; t.checked_in_at = now() }
      else if (p_action === 'noshow') t.status = 'no_show'
      else if (p_action === 'restore') { t.status = 'waiting'; t.called_at = null; t.checked_in_at = null }
      t.updated_at = now(); persist(); return { ok: true, ticket_no: t.ticket_no, name: t.name }
    },
    staff_toggle_pause: ({ p_booth, p_paused }) => { const b = T('booths').find(x => x.id === p_booth); if (b) { b.is_paused = !!p_paused; persist() } return true },
    staff_set_open: () => true,
    staff_cancel_open: () => true,
    staff_add_walkin: ({ p_booth, p_name, p_party, p_slot }) => { const b = T('booths').find(x => x.id === p_booth); if (!b) throw new Error('부스를 찾을 수 없습니다.'); const no = p_slot ? null : (b.next_no = (b.next_no ?? 0) + 1); T('tickets').push({ id: uid(), token: uid(), booth_id: b.id, event_id: b.event_id, slot_id: p_slot ?? null, name: p_name || '현장 손님', phone: null, party_size: p_party ?? 1, ticket_no: no, status: 'waiting', source: 'staff', ticket_date: today(), created_at: now(), called_at: null }); persist(); return true },
    // 손님용
    event_schedule: ({ p_slug }) => { const e = T('events').find(x => x.slug === p_slug); if (!e || e.status !== 'open') return null; return { event: { ...e, booth_count: T('booths').filter(b => b.event_id === e.id).length, survey_enabled: !!T('surveys').find(s => s.event_id === e.id)?.enabled, draw_open: T('draws').some(d => d.event_id === e.id && ['open', 'drawn'].includes(d.status)) }, programs: T('programs').filter(p => p.event_id === e.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(p => ({ ...p, place: p.place_id ? { id: p.place_id, name: T('places').find(x => x.id === p.place_id)?.name } : null })), notices: T('notices').filter(n => n.event_id === e.id).map((n): Row => ({ ...n, publish_at: n.publish_at ?? n.created_at })).sort((a, b) => Number(b.pinned) - Number(a.pinned)) } },
    event_guide: ({ p_slug }) => { const e = T('events').find(x => x.slug === p_slug); if (!e || e.status !== 'open') return null; return { event: e, places: T('places').filter(p => p.event_id === e.id).sort((a, b) => a.sort_order - b.sort_order).map(p => { const b = p.booth_id ? T('booths').find(x => x.id === p.booth_id) : null; return { ...p, menu: p.menu ?? [], order_open: !!osOf(p.id)?.enabled, order_paused: !!osOf(p.id)?.paused, booth: b ? { id: b.id, slug: b.slug, mode: b.mode, is_paused: b.is_paused, location: b.location ?? null, ...boothLive(b) } : null } }) } },
    event_summary: ({ p_slug }) => { const e = T('events').find(x => x.slug === p_slug); return e ? { event: e, booths: T('booths').filter(b => b.event_id === e.id).sort((a, b) => a.sort_order - b.sort_order).map(b => ({ id: b.id, name: b.name, slug: b.slug, mode: b.mode, is_paused: b.is_paused, location: b.location ?? null, image_url: b.image_url ?? null, icon_url: b.icon_url ?? null, description: b.description ?? null, max_party_size: String(b.settings?.max_party_size ?? 4), reserve_open_at: null, group_name: b.group_name ?? null, category: b.category ?? null, ...boothLive(b) })) } : null },
    booth_summary: ({ p_slug }) => { const b = T('booths').find(x => x.slug === p_slug); if (!b) return null; const e = evOf(b); return { booth: b, event: { id: e.id, name: e.name, slug: e.slug, status: e.status, privacy_text: e.privacy_text, notice: e.notice ?? null, starts_at: e.starts_at, ends_at: e.ends_at }, waiting_teams: liveWait(b), avg_service_min: svc(b), slots: slotsOf(b) } },
    join_queue: ({ p_slug, p_name, p_phone, p_party }) => { const b = T('booths').find(x => x.slug === p_slug); if (!b) throw new Error('부스를 찾을 수 없습니다.'); if (b.is_paused) throw new Error('지금은 접수를 받지 않아요.'); const no = b.next_no = (b.next_no ?? 0) + 1; const t = { id: uid(), token: uid(), booth_id: b.id, event_id: b.event_id, slot_id: null, name: p_name, phone: p_phone, party_size: p_party ?? 1, ticket_no: no, status: 'waiting', source: 'online', ticket_date: today(), created_at: now(), called_at: null }; T('tickets').push(t); persist(); return { token: t.token } },
    reserve_slot: ({ p_slot, p_name, p_phone, p_party }) => { const b = T('booths').find(x => x.id === String(p_slot).split('|')[0]); const sl = b && slotsOf(b).find(x => x.id === p_slot); if (!b || !sl) throw new Error('회차를 찾을 수 없습니다.'); if (sl.capacity - sl.reserved < (p_party ?? 1)) throw new Error('남은 자리가 부족해요.'); const t = { id: uid(), token: uid(), booth_id: b.id, slot_id: p_slot, name: p_name, phone: p_phone, party_size: p_party ?? 1, ticket_no: null, status: 'waiting', source: 'online', event_id: b.event_id, ticket_date: today(), created_at: now(), called_at: null }; T('tickets').push(t); persist(); return { token: t.token } },
    get_ticket: ({ p_token }) => { const t = T('tickets').find(x => x.token === p_token); return t ? ticketOut(t) : null },
    defer_ticket: ({ p_token, p_teams }) => {
      const t = T('tickets').find(x => x.token === p_token); if (!t) throw new Error('대기표를 찾을 수 없습니다.')
      if (t.slot_id) throw new Error('회차 예약은 순서를 미룰 수 없어요.')
      if (t.status === 'called') throw new Error('이미 호출돼서 순서를 미룰 수 없어요. 부스 스태프에게 말씀해 주세요.')
      if (t.status !== 'waiting') throw new Error('지금은 순서를 미룰 수 없어요.')
      const b = T('booths').find(x => x.id === t.booth_id) ?? {}, mx = b.settings?.defer_max ?? 3
      if ((t.defer_count ?? 0) >= mx) throw new Error(`순서는 ${mx}번까지만 미룰 수 있어요.`)
      const behind = qOf(b).filter(x => x.status === 'waiting' && x.id !== t.id && ord(x) > ord(t)).sort((x, y) => ord(x) - ord(y)).slice(0, p_teams ?? 100000)
      if (!behind.length) throw new Error('뒤에 기다리는 팀이 없어요.')
      t.ord = ord(behind[behind.length - 1]) + 0.5; t.defer_count = (t.defer_count ?? 0) + 1; persist()
      return { ok: true, moved: behind.length, ahead: tState(t).ahead, left: mx - t.defer_count }
    },
    cancel_ticket: ({ p_token }) => { const t = T('tickets').find(x => x.token === p_token); if (t) { t.status = 'cancelled'; persist() } return true },
    find_my_tickets: ({ p_name, p_phone }) => T('tickets').filter(t => t.name === p_name && String(t.phone).replace(/\D/g, '') === String(p_phone).replace(/\D/g, '')).map(t => { const o = ticketOut(t); return { token: t.token, booth: o.booth.name, status: o.status, ticket_no: o.ticket_no, slot_at: o.slot?.starts_at ?? null, created_at: o.created_at } }),
    event_board: ({ p_slug }) => { const e = T('events').find(x => x.slug === p_slug); if (!e) return null; return { event: { name: e.name, notice: e.notice ?? null, status: e.status }, now: now(), booths: T('booths').filter(b => b.event_id === e.id).sort((a, b) => a.sort_order - b.sort_order).map(b => { const q = qOf(b), cl = q.filter(t => t.status === 'called').sort((x, y) => String(y.called_at).localeCompare(String(x.called_at))).slice(0, 2).map(t => t.ticket_no), li = Math.max(0, ...q.filter(t => t.status === 'done' || t.status === 'checked_in').map(t => t.ticket_no)), si = slotInfo(b), cur = slotsOf(b).find(x => new Date(x.starts_at).getTime() <= Date.now() && Date.now() < new Date(x.ends_at).getTime()); return { id: b.id, name: b.name, mode: b.mode, is_paused: b.is_paused, window_state: 'open', waiting_teams: liveWait(b), called: b.mode === 'queue' ? cl : [], last_in: b.mode === 'queue' ? li || null : null, avg_service_min: svc(b), next_slot: si.next ? { starts_at: si.next.starts_at, left: si.next.capacity - si.next.reserved } : null, current_slot: cur ? { starts_at: cur.starts_at, ends_at: cur.ends_at } : null } }) } },
    stamp_status: ({ p_slug, p_card }) => { const e = T('events').find(x => x.slug === p_slug); if (!e) return null; const card = T('stamp_cards').find(c => c.event_id === e.id && c.card_token === p_card); const spots = T('stamp_spots').filter(s => s.event_id === e.id).sort((a, b) => a.sort_order - b.sort_order); const got = new Set(T('stamps').filter(s => s.card_id === card?.id).map(s => s.spot_id)); const goal = e.stamp_goal ?? spots.length; return { enabled: e.stamp_enabled, goal, reward_text: e.stamp_reward_text, spots: spots.map(s => ({ id: s.id, name: s.name, got: got.has(s.id) })), collected: got.size, count: got.size, completed: got.size >= goal, reward_code: got.size >= goal && card ? (card.reward_code ??= String(100000 + Math.floor(Math.random() * 900000))) : null } },
    stamp_collect: ({ p_slug, p_card, p_code }) => { const e = T('events').find(x => x.slug === p_slug); const spot = T('stamp_spots').find(s => s.event_id === e?.id && s.code === p_code); if (!e || !spot) throw new Error('이 QR 은 이 행사의 스탬프가 아니에요.'); let card = T('stamp_cards').find(c => c.event_id === e.id && c.card_token === p_card); if (!card) { card = { id: uid(), event_id: e.id, card_token: p_card, created_at: now() }; T('stamp_cards').push(card) } const isNew = !T('stamps').some(s => s.card_id === card!.id && s.spot_id === spot.id); if (isNew) T('stamps').push({ id: uid(), card_id: card.id, spot_id: spot.id, created_at: now() }); persist(); return { spot: spot.name, new: isNew, ...(rpc.stamp_status({ p_slug, p_card }) as object) } },
    draw_status: ({ p_slug, p_card }) => { const e = T('events').find(x => x.slug === p_slug); return T('draws').filter(d => d.event_id === e?.id && d.status !== 'draft').map(d => { const mine = T('draw_entries').find(x => x.draw_id === d.id && x.card_token === p_card); return { id: d.id, title: d.title, prize: d.prize, description: d.description, draw_at: d.draw_at, winners_count: d.winners_count, status: d.status, mine: mine ? { name: mine.name, won: !!mine.won } : null, winners: [], require_stamp: d.require_stamp ?? false, entries: T('draw_entries').filter(x => x.draw_id === d.id).length + 377 } }) },
    draw_enter: ({ p_slug, p_draw, p_card, p_name, p_phone }) => { if (T('draw_entries').some(x => x.draw_id === p_draw && x.card_token === p_card)) throw new Error('이미 응모했어요.'); if (T('draws').find(d => d.id === p_draw)?.require_stamp) { const st = rpc.stamp_status({ p_slug, p_card }) as { count: number; goal: number }; if (st.count < st.goal) throw new Error('스탬프 투어를 완주해야 응모할 수 있어요.') } T('draw_entries').push({ id: uid(), draw_id: p_draw, card_token: p_card, name: p_name, phone: p_phone, won: null, created_at: now() }); persist(); return true },
    survey_get: ({ p_slug, p_card }) => { const e = T('events').find(x => x.slug === p_slug); const s = T('surveys').find(x => x.event_id === e?.id); if (!s) return { enabled: false, title: null, questions: [], thanks: null, done: false }; return { enabled: s.enabled, title: s.title, questions: s.questions, thanks: s.thanks ?? null, done: T('survey_responses').some(r => r.event_id === e!.id && r.card_token === p_card) } },
    survey_submit: ({ p_slug, p_card, p_answers }) => { const e = T('events').find(x => x.slug === p_slug); if (!e) throw new Error('행사 없음'); T('survey_responses').push({ id: uid(), event_id: e.id, card_token: p_card, answers: p_answers, created_at: now() }); persist(); return true },
    vendor_info: ({ p_token }) => { const e = T('events').find(x => x.vendor_token === p_token); return e ? { event_name: e.name, event_id: e.id, open: e.vendor_open, starts_at: e.starts_at, ends_at: e.ends_at } : null },
    vendor_submit: ({ p_token, p_kind, p_name, p_description, p_menu, p_image_url, p_contact }) => { const e = T('events').find(x => x.vendor_token === p_token); if (!e || !e.vendor_open) throw new Error('지금은 등록을 받지 않아요.'); const id = uid(); T('vendor_submissions').push({ id, event_id: e.id, kind: p_kind, name: p_name, description: p_description, menu: p_menu ?? [], image_url: p_image_url, contact: p_contact, status: 'pending', place_id: null, created_at: now() }); persist(); return id },
  }

  function parse(sp: URLSearchParams) {
    const f: { col: string; op: string; val: string }[] = []; let order: { col: string; asc: boolean } | null = null, limit: number | null = null
    for (const [k, v] of sp) {
      if (k === 'select' || k === 'on_conflict') continue
      if (k === 'order') { const [col, dir] = v.split('.'); order = { col, asc: dir !== 'desc' }; continue }
      if (k === 'limit') { limit = +v; continue }
      const m = v.match(/^(eq|in|is|not|neq)\.(.*)$/); if (m) f.push({ col: k, op: m[1], val: m[2] })
    }
    return { f, order, limit }
  }
  function apply(rows: Row[], { f, order, limit }: ReturnType<typeof parse>) {
    let out = rows.filter(r => f.every(({ col, op, val }) => {
      const c = r[col]
      if (op === 'eq') return String(c) === val
      if (op === 'neq') return String(c) !== val
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(c))
      if (op === 'is') return val === 'null' ? c == null : !!c === (val === 'true')
      if (op === 'not') { const m = val.match(/^(\w+)\.(.*)$/); if (m?.[1] === 'is') return m[2] === 'null' ? c != null : true; return true }
      return true
    }))
    if (order) out = [...out].sort((a, b) => (a[order!.col] > b[order!.col] ? 1 : a[order!.col] < b[order!.col] ? -1 : 0) * (order!.asc ? 1 : -1))
    if (limit) out = out.slice(0, limit)
    return out
  }

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const url = new URL(req.url); const path = url.pathname; const method = req.method
    const accept = req.headers.get('accept') ?? ''; const prefer = req.headers.get('prefer') ?? ''
    const body = async () => { try { return await req.json() } catch { return null } }
    if (path.startsWith('/auth/v1/user')) return json(DEMO_USER)
    if (path.startsWith('/auth/v1/token')) return json({ access_token: 'demo', refresh_token: 'demo', expires_in: 999999, expires_at: Math.floor(Date.now() / 1000) + 999999, token_type: 'bearer', user: DEMO_USER })
    if (path.startsWith('/auth/v1/logout')) { try { localStorage.removeItem(DEMO_KEY) } catch {} return json({}) }
    if (path.startsWith('/storage/v1/object/')) return json({ Key: path.replace('/storage/v1/object/', '') })
    if (path.startsWith('/rest/v1/rpc/')) { const fn = path.split('/rpc/')[1]; const b = (await body()) ?? {}; if (!rpc[fn]) return json({ message: `데모에는 ${fn} 이 없어요` }, 404); try { tick(); tickOrders(); return json(rpc[fn](b) ?? null) } catch (e: any) { return json({ message: e.message, code: 'P0001' }, 400) } }
    if (path.startsWith('/rest/v1/')) {
      const table = path.split('/rest/v1/')[1]; if (table === 'tickets') tick(); const rows = T(table); const q = parse(url.searchParams)
      if (method === 'HEAD') { const n = apply(rows, q).length; return new Response('', { status: 200, headers: { 'Content-Range': `0-${Math.max(0, n - 1)}/${n}` } }) }
      if (method === 'GET') { const out = apply(rows, q); if (accept.includes('vnd.pgrst.object')) return out.length ? json(out[0]) : json({ message: 'no rows', code: 'PGRST116' }, 406); return json(out) }
      if (method === 'POST') {
        const b = await body(); const arr = Array.isArray(b) ? b : [b]
        const ins = arr.map(r => ({ id: uid(), created_at: now(), ...(table === 'stamp_spots' ? { code: Math.random().toString(16).slice(2, 14) } : {}), ...(table === 'notices' ? { publish_at: now(), urgent: false, pinned: false } : {}), ...(table === 'places' ? { x: 50, y: 50, sort_order: 0, crowd: null } : {}), ...(table === 'draws' ? { status: 'open' } : {}), ...r }))
        if (prefer.includes('resolution=merge-duplicates')) { for (const r of ins) { const i = rows.findIndex(x => table === 'surveys' ? x.event_id === r.event_id : x.id === r.id); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r) } } else rows.push(...ins)
        persist(); return accept.includes('vnd.pgrst.object') ? json(ins[0], 201) : json(ins, 201)
      }
      if (method === 'PATCH') { const b = await body(); const out = apply(rows, q); out.forEach(r => { if (table === 'places' && b && 'crowd' in b && b.crowd !== r.crowd) { r.crowd_updated_at = b.crowd ? now() : null; T('crowd_log').push({ id: uid(), event_id: r.event_id, place_id: r.id, crowd: b.crowd, at: now() }) } Object.assign(r, b) }); persist(); return json(out) }
      if (method === 'DELETE') { const out = apply(rows, q); out.forEach(r => rows.splice(rows.indexOf(r), 1)); persist(); return json(out) }
    }
    return new Response('not in demo', { status: 404 })
  }
}

/** 데모 리포트 숫자 — 성남 규모 가상치. 실DB 에선 전부 집계로 바뀐다 */
const SAMPLE = {
  report: (eventId: string, T: (n: string) => Row[]) => { const e = T('events').find(x => x.id === eventId) ?? {}; return { event: { ...e, stamp_enabled: true, stamp_goal: null }, views: { total: 1842, by_day: [{ day: '2026-12-20', count: 1013 }, { day: '2026-12-21', count: 829 }], by_page: [{ page: 'home', count: 1842 }, { page: 'map', count: 1204 }] }, tickets: { total: 412, queue: 305, reserved: 107, served: 361, people: 923, no_show: 38, avg_wait_min: 14, by_booth: T('booths').filter(b => b.event_id === eventId).map((b, i) => { const total = [520, 240, 142, 118, 96, 104][i] ?? 80; return { name: b.name, mode: b.mode, total, served: Math.round(total * 0.9), people: Math.round(total * 2.3), no_show: Math.round(total * 0.07) } }), by_day: [{ day: '2026-12-20', count: 230 }, { day: '2026-12-21', count: 182 }] }, stamps: { cards: 530, completed: 212, redeemed: 198, stamps: 1870, by_spot: T('stamp_spots').filter(s => s.event_id === eventId).map((s, i) => ({ name: s.name, count: [502, 455, 388, 401, 243, 176][i] ?? 120 })) }, content: { places: T('places').filter(p => p.event_id === eventId).length, programs: T('programs').filter(p => p.event_id === eventId).length, notices: T('notices').filter(p => p.event_id === eventId).length, urgent_notices: 1 }, notifications: { sent: 388, failed: 3 } } },
  survey: (eventId: string, T: (n: string) => Row[]) => { const s = T('surveys').find(x => x.event_id === eventId); const dist: Record<string, Record<string, number>> = { q1: { '5': 104, '4': 78, '3': 24, '2': 6, '1': 2 }, q_res: { '시내(관내)': 121, '도내 다른 시·군': 48, '수도권': 39, '그 외 지역': 6 }, q_age: { '10대': 18, '20대': 52, '30대': 77, '40대': 49, '50대 이상': 18 }, q_with: { '가족(아이 동반)': 98, '친구': 54, '연인': 41, '혼자': 15, '단체': 6 }, q_via: { '현수막·포스터': 67, 'SNS': 71, '지인': 48, '뉴스·블로그': 12, '지나가다': 16 } }; return { responses: 214 + T('survey_responses').filter(r => r.event_id === eventId).length, questions: (s?.questions ?? []).map((q: Row) => ({ id: q.id, label: q.label, type: q.type, avg: q.type === 'rating' ? 4.3 : null, dist: q.type === 'text' ? null : dist[q.id] ?? Object.fromEntries((q.options ?? []).map((o: string, i: number) => [o, [71, 58, 44, 33, 8][i] ?? 10])), texts: q.type === 'text' ? ['화장실이 멀어요', '푸드트럭 줄이 너무 길었어요', '포토존 좋았어요 내년에도', '주차가 힘들었어요 셔틀 더 자주'] : null })) } },
  dataset: (eventId: string, T: (n: string) => Row[]) => { const spots = T('stamp_spots').filter(s => s.event_id === eventId); const nm = (i: number) => spots[i]?.name ?? `지점 ${i + 1}`; const log = T('crowd_log').filter(l => l.event_id === eventId); return { views_by_hour: [11, 12, 13, 14, 15, 16, 17, 18, 19].map((h, i) => ({ hour: h, count: [90, 180, 260, 310, 290, 240, 210, 170, 92][i] })), journey: { cards: 530, cards_2plus: 471, dwell_median_min: 96, dwell_avg_min: 108, reach: spots.map((s, i) => ({ name: s.name, cards: [502, 455, 388, 401, 243, 176][i] ?? 120 })), first_spot: [{ name: nm(0), count: 318 }, { name: nm(1), count: 142 }], transitions: [{ from: nm(0), to: nm(1), count: 287 }, { from: nm(1), to: nm(2), count: 201 }, { from: nm(2), to: nm(3), count: 188 }], by_hour: [11, 12, 13, 14, 15, 16, 17, 18, 19].map((h, i) => ({ hour: h, count: [60, 190, 280, 320, 300, 260, 230, 160, 70][i] })) }, crowd: [{ name: '푸드존', kind: 'food', changes: 6 + log.length, high_min: 140, mid_min: 210 }, { name: '임시 주차장', kind: 'parking', changes: 4, high_min: 95, mid_min: 160 }], notices: T('notices').filter(n => n.event_id === eventId).map(n => ({ title: n.title, urgent: !!n.urgent, at: n.publish_at ?? n.created_at })), vendors: { submitted: 34 + T('vendor_submissions').filter(v => v.event_id === eventId).length, approved: 28 }, draws: T('draws').filter(d => d.event_id === eventId).map(d => ({ title: d.title, entries: 377, winners: d.winners_count })) } },
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
