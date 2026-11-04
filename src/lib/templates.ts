import { supabase } from './supabase'

/**
 * 행사 템플릿 — '새 행사' 에서 고르면 샘플 콘텐츠를 깔아 준다 (전부 기획자가 고치거나 지우면 되는 자리표시).
 * 숫자·시간은 행사 시작일 기준으로 계산. 스탬프·설문·셀러 등록은 켜 두고 시작한다.
 */
export type TemplateId = 'winter-fair' | 'festival' | 'apt-night' | 'blank'

export const TEMPLATES: { id: TemplateId; name: string; desc: string; accent: string | null }[] = [
  { id: 'winter-fair', name: '겨울 페어 · 연말 마켓', desc: '실내·쇼핑몰 마켓. 셀러 셀프 등록, 스탬프 투어(셀러 부스 돌기), 크리스마스 럭키드로우, 캐롤 공연 시간표, 만족도 설문까지 켜 둔 상태로 시작해요.', accent: '#b91c1c' },
  { id: 'festival', name: '축제 · 지자체', desc: '체험 부스 대기·예약 중심. 지도 핀(안내소·화장실·무대), 공지, 스탬프 투어, 설문.', accent: null },
  { id: 'apt-night', name: '아파트 야시장', desc: '푸드트럭·셀러 마켓 + 키즈 체험. 먹거리 메뉴, 공지(주차·소음), 설문.', accent: '#7c3aed' },
  { id: 'blank', name: '빈 행사', desc: '아무것도 깔지 않아요.', accent: null },
]

const H = 3600_000
export async function applyTemplate(id: TemplateId, eventId: string, startsAt: string) {
  if (id === 'blank') return
  const t0 = new Date(startsAt).getTime()
  const at = (h: number) => new Date(t0 + h * H).toISOString()
  const ev: Record<string, unknown> = { template: id, stamp_enabled: true, stamp_reward_text: '안내소에서 작은 선물을 드려요' }
  const places: any[] = [], programs: any[] = [], notices: any[] = [], draws: any[] = []
  let survey: any = null, vendorOpen = false, infoText = '', contactText = ''

  if (id === 'winter-fair') {
    ev.accent_color = '#b91c1c'; ev.stamp_goal = 5; vendorOpen = true
    places.push(
      { kind: 'info', name: '안내소 · 경품 교환', description: '분실물 · 스탬프 경품 · 럭키드로우 당첨 확인', x: 50, y: 88, sort_order: 10 },
      { kind: 'stage', name: '포토존 · 트리', description: '사진 찍고 인스타에 올려 주세요', x: 50, y: 50, sort_order: 20 },
      { kind: 'stage', name: '미니 무대', description: '캐롤 공연 · 이벤트', x: 80, y: 30, sort_order: 30 },
      { kind: 'food', name: '핫초코 · 뱅쇼', description: '따뜻한 음료', hours: '11:00~20:00', x: 20, y: 30, sort_order: 40, menu: [{ name: '핫초코', price: '4,000원' }, { name: '뱅쇼', price: '6,000원' }] },
      { kind: 'market', name: '셀러 부스 (예시)', description: '셀러 셀프 등록이 승인되면 여기에 쌓여요 — 이 예시는 지워도 돼요', x: 30, y: 65, sort_order: 50 },
      { kind: 'facility', name: '화장실', x: 10, y: 85, sort_order: 60 },
    )
    programs.push(
      { title: '오픈 · 웰컴 캐롤', kind: 'stage', starts_at: at(0), ends_at: at(0.5) },
      { title: '어쿠스틱 캐롤 공연', kind: 'stage', starts_at: at(4), ends_at: at(5) },
      { title: '크리스마스 럭키드로우 추첨', kind: 'event', description: '응모자 대상 · 미니 무대', starts_at: at(7), ends_at: at(7.5) },
      { title: '타임세일 — 셀러 부스 할인', kind: 'event', starts_at: at(8), ends_at: at(9) },
    )
    notices.push({ title: '겨울 페어에 오신 것을 환영해요', body: '스탬프 5개를 모으면 안내소에서 선물을 드려요. 럭키드로우는 행사 홈에서 응모하세요.', pinned: true })
    draws.push({ title: '크리스마스 럭키드로우', prize: '연말 선물 세트', description: '추첨은 미니 무대에서 발표해요', winners_count: 3, draw_at: at(7), status: 'open' })
    survey = { enabled: true, title: '겨울 페어, 어떠셨어요?', questions: [
      { id: 'q1', type: 'rating', label: '오늘 페어, 전체적으로 어떠셨어요?' },
      { id: 'q2', type: 'choice', label: '가장 좋았던 건?', options: ['셀러 부스', '먹거리', '공연', '포토존', '분위기'] },
      { id: 'q3', type: 'choice', label: '내년에도 열리면?', options: ['꼭 올게요', '아마도', '글쎄요'] },
      { id: 'q4', type: 'text', label: '아쉬웠던 점이나 바라는 점' },
    ] }
    infoText = '운영: 11:00~20:00\n주차: 건물 주차장 2시간 무료 (안내소 도장)\n결제: 부스별 카드·계좌이체 (현금은 일부 부스만)\n반려동물: 켄넬·유모차 동반 가능'
    contactText = '운영 본부 010-2244-3585'
  }
  if (id === 'festival') {
    places.push(
      { kind: 'info', name: '안내소', description: '분실물 · 스탬프 경품', x: 50, y: 85, sort_order: 10 },
      { kind: 'stage', name: '메인 무대', x: 75, y: 30, sort_order: 20 },
      { kind: 'facility', name: '화장실', x: 10, y: 80, sort_order: 30 },
      { kind: 'facility', name: '구급 · 미아보호소', x: 90, y: 80, sort_order: 40 },
    )
    programs.push({ title: '개막식', kind: 'stage', starts_at: at(0), ends_at: at(1) }, { title: '폐막 공연', kind: 'stage', starts_at: at(8), ends_at: at(9) })
    notices.push({ title: '안전 안내', body: '미아 발생 시 안내소로 와 주세요. 우천 시 야외 공연은 취소될 수 있어요.', pinned: true })
    survey = { enabled: true, title: '축제, 어떠셨어요?', questions: [{ id: 'q1', type: 'rating', label: '전체 만족도' }, { id: 'q2', type: 'choice', label: '가장 좋았던 건?', options: ['체험 부스', '먹거리', '공연', '마켓'] }, { id: 'q3', type: 'text', label: '한마디' }] }
    infoText = '주차: 행사장 인근 공영주차장\n우천 시: 체험 부스는 정상 운영, 야외 공연 취소'
  }
  if (id === 'apt-night') {
    ev.accent_color = '#7c3aed'; ev.stamp_enabled = false
    places.push(
      { kind: 'info', name: '운영 본부', x: 50, y: 85, sort_order: 10 },
      { kind: 'food', name: '푸드트럭 존', description: '메뉴는 트럭별 핀으로 나눠 주세요', x: 30, y: 40, sort_order: 20 },
      { kind: 'market', name: '플리마켓 존', x: 70, y: 40, sort_order: 30 },
      { kind: 'booth', name: '키즈 체험 존', description: '페이스페인팅 · 만들기', x: 50, y: 60, sort_order: 40 },
    )
    programs.push({ title: '버블쇼', kind: 'stage', starts_at: at(1), ends_at: at(1.5) }, { title: '마술 공연', kind: 'stage', starts_at: at(3), ends_at: at(3.5) })
    notices.push({ title: '소음·주차 안내', body: '21시 이후 음향을 줄여요. 단지 내 임시 주차는 관리사무소 안내를 따라 주세요.', pinned: true })
    survey = { enabled: true, title: '야시장, 어떠셨어요?', questions: [{ id: 'q1', type: 'rating', label: '전체 만족도' }, { id: 'q2', type: 'choice', label: '또 열리면?', options: ['꼭 올게요', '아마도', '글쎄요'] }, { id: 'q3', type: 'text', label: '한마디' }] }
    infoText = '운영: 17:00~21:00\n주차: 입주민 외 차량은 단지 밖 공영주차장'
  }

  await supabase.from('events').update({ ...ev, vendor_open: vendorOpen, info_text: infoText || null, contact_text: contactText || null }).eq('id', eventId)
  if (places.length) await supabase.from('places').insert(places.map(p => ({ ...p, event_id: eventId })))
  if (programs.length) await supabase.from('programs').insert(programs.map(p => ({ ...p, event_id: eventId })))
  if (notices.length) await supabase.from('notices').insert(notices.map(n => ({ ...n, event_id: eventId })))
  if (draws.length) await supabase.from('draws').insert(draws.map(d => ({ ...d, event_id: eventId })))
  if (survey) await supabase.from('surveys').upsert({ ...survey, event_id: eventId })
  // 스탬프 지점: 템플릿이 만든 부스·마켓 핀을 지점으로
  const { data: ps } = await supabase.from('places').select('id,name,kind').eq('event_id', eventId).in('kind', ['booth', 'market', 'stage'])
  if (ps?.length && ev.stamp_enabled) await supabase.from('stamp_spots').insert(ps.map((p, i) => ({ event_id: eventId, place_id: p.id, name: p.name, sort_order: (i + 1) * 10 })))
}
