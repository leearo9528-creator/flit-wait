import { supabase } from './supabase'

/**
 * 데모 행사 한 벌 — 겨울 축제. 영업 대상(눈썰매장·축제·마켓)이 달라도 같은 링크 하나로 보여 주려고
 * 슬로프 회차 예약 · 체험 원격 대기 · 먹거리 · 마켓 · 스탬프를 한 행사에 다 넣는다.
 * 대기 팀 수(demo_wait)·소요 시간(service_min)은 가상치다.
 */
export async function seedDemoEvent(eventId: string) {
  const day = new Date(); day.setHours(0, 0, 0, 0)
  // 저녁에 데모를 열어도 '운영 시간'과 회차·일정이 어긋나지 않게 마감 시각을 지금 기준으로 늘린다
  const closeH = Math.min(24, Math.max(20, new Date().getHours() + 6))
  // 일정은 '지금' 기준으로 깔되 10분 단위로 맞춘다 (12:27 같은 시각이 안 나오게)
  const at = (h: number) => new Date(Math.round((Date.now() + h * 3600_000) / 600_000) * 600_000).toISOString()

  await supabase.from('events').update({
    status: 'open', starts_at: day.toISOString(), ends_at: new Date(day.getTime() + 2 * 86400_000).toISOString(),
    map_image_url: '/demo-map.svg', accent_color: '#111827', template: 'demo',
    stamp_enabled: true, stamp_goal: null, stamp_reward_text: '안내소에서 핫팩과 기념 배지를 드려요',
    info_text: `운영 10:00~${closeH}:00\n눈썰매: 회차 예약제 (회차당 50분)\n체험: 원격 대기 — 차례가 되면 알림톡으로 불러 드려요`,
    contact_text: '운영본부 010-2244-3585', directions_text: '주차: 행사장 주차장 (만차 시 공영주차장)\n셔틀: 역 ↔ 행사장 20분 간격',
  }).eq('id', eventId)

  const s = (service_min: number) => ({ max_party_size: 4, allow_duplicate_phone: false, queue_close_before_min: 0, notify_ahead_teams: 3, call_valid_min: 10, reserve_open_at: null, reserve_close_before_min: 0, reminders: [], noshow_after_start_min: 10, transfer_noshow_to_queue: false, cancel_until_before_min: 0, sms_fallback: false, service_min })
  const booths = [
    { slug: 'demo-slope', name: '대형 슬로프', mode: 'slot', group_name: '눈썰매', category: '90m · 초등학생 이상', description: '회차당 50분, 회차마다 정원 60명', location: '슬로프 A', demo_wait: 0, settings: s(50), x: 34, y: 17 },
    { slug: 'demo-kids', name: '유아 슬로프', mode: 'slot', group_name: '눈썰매', category: '40m · 3~7세', description: '보호자 동반 · 보호자도 인원에 넣어 주세요', location: '슬로프 B', demo_wait: 0, settings: s(50), x: 74, y: 19 },
    { slug: 'demo-fish', name: '빙어잡이', mode: 'queue', group_name: '체험', category: '얼음 광장', description: '잡은 빙어는 바로 튀겨 드려요', location: '얼음 광장', demo_wait: 9, settings: s(4), x: 64, y: 47 },
    { slug: 'demo-sled', name: '얼음썰매', mode: 'queue', group_name: '체험', category: '얼음 광장', description: '전통 얼음썰매 20분 이용', location: '얼음 광장', demo_wait: 3, settings: s(5), x: 64, y: 55 },
    { slug: 'demo-candle', name: '석고방향제', mode: 'queue', group_name: '체험', category: '체험 존', description: '15분이면 완성, 포장해서 가져가요', location: '체험 존 1번', demo_wait: 6, settings: s(5), x: 33, y: 47.5 },
    { slug: 'demo-keyring', name: '야광 키링', mode: 'queue', group_name: '체험', category: '체험 존', description: '그림 그리고 구워서 키링으로', location: '체험 존 2번', demo_wait: 0, settings: s(6), x: 33, y: 55.5 },
  ]
  const boothRows = booths.map(({ x: _x, y: _y, ...b }, i) => ({ ...b, event_id: eventId, is_paused: false, sort_order: (i + 1) * 10, image_url: null, icon_url: null }))
  const { data: bs } = await supabase.from('booths').insert(boothRows).select()
  const boothId = (slug: string) => (bs as any[])?.find(b => b.slug === slug)?.id ?? null

  const places = [
    ...booths.map((b, i) => ({ kind: 'booth', name: b.name, description: b.description, x: b.x, y: b.y, sort_order: (i + 1) * 10, booth_id: boothId(b.slug) })),
    { kind: 'food', name: '어묵 · 떡볶이', description: '푸드 존', hours: `10:00~${closeH}:00`, x: 60, y: 68, sort_order: 110, crowd: 'high', menu: [{ name: '어묵 (3개)', price: '3,000원' }, { name: '떡볶이', price: '5,000원' }, { name: '순대', price: '5,000원' }] },
    { kind: 'food', name: '닭꼬치 · 소떡소떡', description: '푸드 존', hours: `10:00~${closeH}:00`, x: 73, y: 72.5, sort_order: 120, crowd: 'mid', menu: [{ name: '닭꼬치', price: '4,000원' }, { name: '소떡소떡', price: '4,000원' }] },
    { kind: 'food', name: '핫초코 · 뱅쇼', description: '푸드 존', hours: `10:00~${closeH}:00`, x: 60, y: 77.5, sort_order: 130, crowd: 'low', menu: [{ name: '핫초코', price: '4,000원' }, { name: '뱅쇼', price: '6,000원' }, { name: '군고구마', price: '3,000원' }] },
    { kind: 'market', name: '핸드메이드 마켓', description: '소품 · 캔들 · 뜨개 — 셀러 12팀', x: 31, y: 69.5, sort_order: 210 },
    { kind: 'market', name: '겨울 간식 마켓', description: '수제 쿠키 · 잼 · 차', x: 33, y: 77, sort_order: 220 },
    { kind: 'stage', name: '메인 무대', description: '공연 · 럭키드로우 추첨', x: 90, y: 44, sort_order: 310 },
    { kind: 'info', name: '안내소 · 경품 교환', description: '분실물 · 스탬프 경품 · 미아 보호', x: 50, y: 86, sort_order: 410 },
    { kind: 'medical', name: '의무실', description: '간호 인력 상주 · 구급함 · 핫팩', x: 64, y: 90, sort_order: 420 },
    { kind: 'facility', name: '화장실 · 수유실', description: '수유실 · 기저귀 교환대 · 유아 변기 있어요', x: 12, y: 56, sort_order: 430 },
    { kind: 'parking', name: '주차장', description: '무료 · 300면', x: 19, y: 91.5, sort_order: 510, crowd: 'mid' },
  ]
  const { data: ps } = await supabase.from('places').insert(places.map(p => ({ menu: [], hours: null, crowd: null, booth_id: null, image_url: null, lat: null, lng: null, ...p, event_id: eventId }))).select()
  const placeId = (name: string) => (ps as any[])?.find(p => p.name === name)?.id ?? null

  await supabase.from('programs').insert([
    { title: '버블 매직쇼', kind: 'stage', starts_at: at(-0.2), ends_at: at(0.4), place_id: placeId('메인 무대') },
    { title: '어쿠스틱 캐롤 공연', kind: 'stage', starts_at: at(1), ends_at: at(1.7), place_id: placeId('메인 무대') },
    { title: '럭키드로우 추첨', kind: 'event', description: '스탬프 완주자 대상', starts_at: at(3), ends_at: at(3.3), place_id: placeId('메인 무대') },
    { title: '야간 점등', kind: 'event', starts_at: at(5), ends_at: at(5.2), place_id: null },
  ].map(p => ({ description: null, ...p, event_id: eventId })))
  await supabase.from('notices').insert([
    { event_id: eventId, title: '눈썰매는 회차 예약제예요', body: '현장 줄 없이 회차를 고르고 시간 맞춰 오시면 돼요. 장갑·방수 바지를 권해요.', pinned: true },
    { event_id: eventId, title: '미아·분실물은 안내소로', body: '안내소는 입구 바로 앞이에요.' },
  ])
  const spots = ['빙어잡이', '석고방향제', '핸드메이드 마켓', '겨울 간식 마켓', '메인 무대']
  await supabase.from('stamp_spots').insert(spots.map((n, i) => ({ event_id: eventId, place_id: placeId(n), name: n, sort_order: (i + 1) * 10 })))
  await supabase.from('draws').insert([{ event_id: eventId, title: '윈터 럭키드로우', prize: '지역 특산물 세트', description: '추첨은 메인 무대에서 해요', draw_at: at(3), winners_count: 5, require_stamp: true }])
  await supabase.from('surveys').upsert({ event_id: eventId, enabled: true, title: '오늘 어떠셨어요?', thanks: null, questions: [
    { id: 'q1', type: 'rating', label: '전체적으로 어떠셨어요?' },
    { id: 'q2', type: 'choice', label: '가장 좋았던 건?', options: ['눈썰매', '체험', '먹거리', '마켓', '공연'] },
    { id: 'q3', type: 'choice', label: '대기는 어떠셨어요?', options: ['거의 안 기다림', '기다릴 만함', '오래 기다림'] },
    { id: 'q4', type: 'text', label: '한마디' },
    { id: 'q_res', type: 'choice', label: '어디서 오셨어요?', options: ['시내(관내)', '도내 다른 시·군', '수도권', '그 외 지역'] },
    { id: 'q_age', type: 'choice', label: '연령대', options: ['10대', '20대', '30대', '40대', '50대 이상'] },
    { id: 'q_with', type: 'choice', label: '누구와 오셨어요?', options: ['가족(아이 동반)', '친구', '연인', '혼자', '단체'] },
    { id: 'q_via', type: 'choice', label: '어떻게 알게 되셨어요?', options: ['현수막·포스터', 'SNS', '지인', '뉴스·블로그', '지나가다'] },
  ] })
}
