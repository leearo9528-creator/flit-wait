import { supabase } from './supabase'

/**
 * 행사 템플릿 — '새 행사' 에서 고르면 샘플 콘텐츠를 깔아 준다 (전부 기획자가 고치거나 지우면 되는 자리표시).
 * 숫자·시간은 행사 시작일 기준으로 계산. 스탬프·설문·셀러 등록은 켜 두고 시작한다.
 */
export type TemplateId = 'night-market' | 'running' | 'food-item' | 'winter-fair' | 'festival' | 'apt-night' | 'blank'

export const TEMPLATES: { id: TemplateId; name: string; desc: string; accent: string | null }[] = [
  // 2026 지자체 축제 흐름(야간형·체류형·러닝·단일 먹거리)에 맞춘 3종 — 2026-11-04
  { id: 'night-market', name: '야간 마켓 · 야행', desc: '지자체 야행·야간 축제의 마켓 블록. 피크닉존·나이트마켓·푸드존·포토존, 드론쇼 시간표, 스탬프 투어(밤 동선), 셀러 셀프 등록, 설문.', accent: '#1d4ed8' },
  { id: 'running', name: '러닝 페스티벌 · 마켓', desc: '러닝 대회 + 피니시 마켓. 출발·피니시·짐 보관·급수 핀, 코스 시간표, 완주자 럭키드로우, 러너 설문.', accent: '#059669' },
  { id: 'food-item', name: '단일 먹거리 축제', desc: '김밥·딸기·치맥처럼 아이템 하나로 가는 축제. 시식존·판매존·만들기 체험·먹거리 스탬프(N곳 먹기), 베스트 메뉴 투표형 설문.', accent: '#ea580c' },
  { id: 'winter-fair', name: '겨울 페어 · 연말 마켓', desc: '실내·쇼핑몰 마켓. 셀러 셀프 등록, 스탬프 투어(셀러 부스 돌기), 크리스마스 럭키드로우, 캐롤 공연 시간표, 만족도 설문까지 켜 둔 상태로 시작해요.', accent: '#b91c1c' },
  { id: 'festival', name: '축제 · 지자체', desc: '체험 부스 대기·예약 중심. 지도 핀(안내소·화장실·무대), 공지, 스탬프 투어, 설문.', accent: null },
  { id: 'apt-night', name: '아파트 야시장', desc: '푸드트럭·셀러 마켓 + 키즈 체험. 먹거리 메뉴, 공지(주차·소음), 설문.', accent: '#7c3aed' },
  { id: 'blank', name: '빈 행사', desc: '아무것도 깔지 않아요.', accent: null },
]

const STD_Q = [
  // 표준 4문항 — 데이터 리포트의 '외지 방문 비율·연령·동반·유입 경로' 가 여기서 나온다. 라벨의 키워드(어디서·연령·누구와·알게)로 리포트가 찾으니 바꾸지 말 것
  { id: 'q_res', type: 'choice', label: '어디서 오셨어요?', options: ['시내(관내)', '도내 다른 시·군', '수도권', '그 외 지역'] },
  { id: 'q_age', type: 'choice', label: '연령대', options: ['10대', '20대', '30대', '40대', '50대 이상'] },
  { id: 'q_with', type: 'choice', label: '누구와 오셨어요?', options: ['가족(아이 동반)', '친구', '연인', '혼자', '단체'] },
  { id: 'q_via', type: 'choice', label: '어떻게 알게 되셨어요?', options: ['현수막·포스터', 'SNS', '지인', '뉴스·블로그', '지나가다'] },
]
const H = 3600_000
export async function applyTemplate(id: TemplateId, eventId: string, startsAt: string) {
  if (id === 'blank') return
  const t0 = new Date(startsAt).getTime()
  const at = (h: number) => new Date(t0 + h * H).toISOString()
  const ev: Record<string, unknown> = { template: id, stamp_enabled: true, stamp_reward_text: '안내소에서 작은 선물을 드려요' }
  // 목표 개수는 비워 둔다(= 지점 전부). 숫자를 박으면 지점 수와 어긋나 헷갈린다
  const places: any[] = [], programs: any[] = [], notices: any[] = [], draws: any[] = []
  let survey: any = null, vendorOpen = false, infoText = '', contactText = '', directionsText = ''

  if (id === 'winter-fair') {
    ev.accent_color = '#b91c1c'; ev.stamp_goal = null; vendorOpen = true
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
      ...STD_Q,
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
    survey = { enabled: true, title: '축제, 어떠셨어요?', questions: [{ id: 'q1', type: 'rating', label: '전체 만족도' }, { id: 'q2', type: 'choice', label: '가장 좋았던 건?', options: ['체험 부스', '먹거리', '공연', '마켓'] }, { id: 'q3', type: 'text', label: '한마디' }, ...STD_Q] }
    infoText = '우천 시: 체험 부스는 정상 운영, 야외 공연 취소\n분실물·미아: 안내소'
    directionsText = '주차: 행사장 인근 공영주차장 (만차 시 셔틀 주차장)\n셔틀: 역 ↔ 행사장 15분 간격'
    places.push({ kind: 'parking', name: '공영주차장', x: 8, y: 92, sort_order: 90 }, { kind: 'shuttle', name: '셔틀 정류장', x: 20, y: 92, sort_order: 91 })
  }
  if (id === 'night-market') {
    ev.accent_color = '#1d4ed8'; ev.stamp_goal = null; vendorOpen = true
    ev.stamp_reward_text = '안내소에서 야광 팔찌·굿즈를 드려요'
    places.push(
      { kind: 'info', name: '안내소 · 스탬프 교환', description: '분실물 · 미아 · 스탬프 경품', x: 50, y: 90, sort_order: 10 },
      { kind: 'stage', name: '포토존 · 라이트월', description: '해 지면 조명 켜져요', x: 50, y: 45, sort_order: 20 },
      { kind: 'stage', name: '메인 무대', description: '버스킹 · 드론쇼 관람 포인트', x: 82, y: 25, sort_order: 30 },
      { kind: 'market', name: '나이트마켓 A', description: '핸드메이드 · 소품', x: 25, y: 35, sort_order: 40 },
      { kind: 'market', name: '나이트마켓 B', description: '빈티지 · 굿즈', x: 25, y: 60, sort_order: 41 },
      { kind: 'food', name: '푸드존', description: '푸드트럭 · 야식', hours: '17:00~22:00', x: 72, y: 60, sort_order: 50, menu: [{ name: '핫도그', price: '5,000원' }, { name: '츄러스', price: '4,000원' }, { name: '뱅쇼·핫초코', price: '5,000원' }] },
      { kind: 'other', name: '피크닉 라운지', description: '돗자리·빈백 · 음식 반입 가능', x: 60, y: 75, sort_order: 60 },
      { kind: 'facility', name: '화장실', x: 10, y: 88, sort_order: 70 },
      { kind: 'parking', name: '임시 주차장', x: 8, y: 95, sort_order: 90 }, { kind: 'shuttle', name: '셔틀 정류장', x: 20, y: 95, sort_order: 91 },
    )
    programs.push(
      { title: '마켓 오픈 · 버스킹', kind: 'stage', starts_at: at(0), ends_at: at(1) },
      { title: '라이트월 점등', kind: 'event', description: '해 질 무렵 포토존 조명', starts_at: at(1.5), ends_at: at(1.75) },
      { title: '드론 라이트쇼', kind: 'stage', description: '메인 무대 앞 잔디에서 관람', starts_at: at(3), ends_at: at(3.25) },
      { title: '나이트 럭키드로우 추첨', kind: 'event', starts_at: at(4), ends_at: at(4.5) },
      { title: '타임세일 — 나이트마켓 20% 할인', kind: 'event', starts_at: at(4.5), ends_at: at(5) },
    )
    notices.push({ title: '야간 안전 안내', body: '어두운 구역은 안내 요원이 상주해요. 드론쇼 중에는 잔디 안쪽으로 들어가지 말아 주세요. 미아는 안내소로.', pinned: true })
    draws.push({ title: '나이트 럭키드로우', prize: '지역 특산물 세트', description: '스탬프 3개 이상 모으면 응모 가능', winners_count: 5, draw_at: at(4), status: 'open', require_stamp: false })
    survey = { enabled: true, title: '오늘 밤, 어떠셨어요?', questions: [
      { id: 'q1', type: 'rating', label: '오늘 야간 마켓, 전체적으로 어떠셨어요?' },
      { id: 'q2', type: 'choice', label: '가장 좋았던 건?', options: ['드론쇼', '나이트마켓', '먹거리', '포토존', '피크닉 라운지'] },
      { id: 'q3', type: 'choice', label: '얼마나 머무셨어요?', options: ['1시간 이내', '1~2시간', '2~3시간', '3시간 이상'] },
      { id: 'q4', type: 'text', label: '아쉬웠던 점이나 바라는 점' },
      ...STD_Q,
    ] }
    infoText = '운영: 17:00~22:00\n피크닉 라운지: 돗자리 대여 무료(안내소) · 음식 반입 가능\n우천 시: 드론쇼 취소, 마켓은 정상 운영'
    directionsText = '대중교통 이용을 권해요 — 야간 주차 혼잡\n셔틀: 역 ↔ 행사장 20분 간격 (마지막 22:30)\n주차: 임시 주차장 (만차 시 공영주차장)'
  }
  if (id === 'running') {
    ev.accent_color = '#059669'; ev.stamp_enabled = false; vendorOpen = true
    places.push(
      { kind: 'info', name: '접수 · 배번 수령', description: '번호표 · 기념품 · 안내', x: 50, y: 85, sort_order: 10 },
      { kind: 'other', name: '짐 보관소', description: '배번 번호로 보관', x: 35, y: 85, sort_order: 15 },
      { kind: 'stage', name: '출발 · 피니시 게이트', description: '워밍업 · 시상', x: 50, y: 50, sort_order: 20 },
      { kind: 'facility', name: '급수대', description: '물 · 이온음료 · 바나나', x: 20, y: 40, sort_order: 30 },
      { kind: 'medical', name: '의무실', description: '응급 · 스트레칭 존', x: 65, y: 85, sort_order: 40 },
      { kind: 'market', name: '피니시 마켓', description: '러닝 굿즈 · 로컬 셀러', x: 75, y: 60, sort_order: 50 },
      { kind: 'food', name: '리커버리 푸드존', description: '완주 후 먹거리', hours: '09:00~14:00', x: 30, y: 60, sort_order: 60 },
      { kind: 'facility', name: '화장실', x: 10, y: 90, sort_order: 70 },
      { kind: 'parking', name: '주차장', x: 90, y: 95, sort_order: 90 }, { kind: 'shuttle', name: '셔틀 정류장', x: 80, y: 95, sort_order: 91 },
    )
    programs.push(
      { title: '배번 수령 · 짐 보관', kind: 'other', starts_at: at(-1.5), ends_at: at(0) },
      { title: '단체 워밍업', kind: 'event', starts_at: at(-0.5), ends_at: at(0) },
      { title: '10km 출발', kind: 'event', starts_at: at(0), ends_at: at(0.1) },
      { title: '5km 출발', kind: 'event', starts_at: at(0.25), ends_at: at(0.35) },
      { title: '피니시 마켓 · 버스킹', kind: 'stage', starts_at: at(0.5), ends_at: at(4) },
      { title: '시상식 · 완주자 럭키드로우', kind: 'event', starts_at: at(2.5), ends_at: at(3) },
    )
    notices.push({ title: '코스 안내', body: '코스 지도는 지도 탭 배치도에서 확인하세요. 보행자와 교차하는 구간은 속도를 줄여 주세요. 응급 시 의무실 또는 코스 요원에게.', pinned: true })
    draws.push({ title: '완주자 럭키드로우', prize: '러닝화 · 로컬 특산물', description: '배번 번호로 응모 · 시상식에서 발표', winners_count: 10, draw_at: at(2.5), status: 'open' })
    survey = { enabled: true, title: '오늘 러닝, 어떠셨어요?', questions: [
      { id: 'q1', type: 'rating', label: '대회 운영 전체 만족도' },
      { id: 'q2', type: 'choice', label: '참가 종목', options: ['5km', '10km', '하프', '응원·마켓만'] },
      { id: 'q3', type: 'choice', label: '가장 좋았던 건?', options: ['코스', '급수·보급', '피니시 마켓', '먹거리', '기념품'] },
      { id: 'q4', type: 'choice', label: '내년에도 참가하실 건가요?', options: ['꼭', '아마도', '글쎄요'] },
      { id: 'q5', type: 'text', label: '코스·운영에서 아쉬웠던 점' },
      ...STD_Q,
    ] }
    infoText = '짐 보관: 배번 번호로 맡기고 찾아요\n급수: 코스 2.5km 마다\n기록: 피니시 후 문자로 발송'
    directionsText = '행사 당일 출발 구간 도로 통제 — 대중교통 권장\n셔틀: 역 ↔ 출발 지점 10분 간격 (06:30~)\n주차: 지정 주차장만 (현장 주차 불가)'
  }
  if (id === 'food-item') {
    ev.accent_color = '#ea580c'; ev.stamp_goal = null; vendorOpen = true
    ev.stamp_reward_text = '먹거리 스탬프 완주 시 안내소에서 기념 굿즈'
    places.push(
      { kind: 'info', name: '안내소 · 스탬프 교환', x: 50, y: 90, sort_order: 10 },
      { kind: 'food', name: '시식존', description: '대표 메뉴 무료 시식 (1인 1회)', hours: '11:00~17:00', x: 50, y: 40, sort_order: 20 },
      { kind: 'food', name: '판매존 A — 원조·전통', description: '지역 노포', x: 25, y: 35, sort_order: 30, menu: [{ name: '대표 메뉴', price: '5,000원' }] },
      { kind: 'food', name: '판매존 B — 신메뉴·퓨전', description: '올해의 신메뉴 경연', x: 75, y: 35, sort_order: 31, menu: [{ name: '신메뉴', price: '6,000원' }] },
      { kind: 'booth', name: '만들기 체험', description: '직접 만들어 가져가요 (예약)', x: 30, y: 65, sort_order: 40 },
      { kind: 'market', name: '특산물 장터', description: '농가 직거래', x: 70, y: 65, sort_order: 50 },
      { kind: 'stage', name: '포토존 · 대형 조형물', x: 50, y: 60, sort_order: 60 },
      { kind: 'other', name: '피크닉존', description: '사서 바로 먹는 자리 · 돗자리 대여', x: 50, y: 75, sort_order: 65 },
      { kind: 'facility', name: '화장실 · 손 씻는 곳', x: 10, y: 88, sort_order: 70 },
      { kind: 'parking', name: '주차장', x: 8, y: 95, sort_order: 90 }, { kind: 'shuttle', name: '셔틀 정류장', x: 20, y: 95, sort_order: 91 },
    )
    programs.push(
      { title: '개막 · 대형 메뉴 만들기 퍼포먼스', kind: 'stage', starts_at: at(0), ends_at: at(0.5) },
      { title: '시식존 1차 오픈', kind: 'event', starts_at: at(0.5), ends_at: at(2) },
      { title: '신메뉴 경연 · 현장 투표', kind: 'event', description: '설문에서 베스트 메뉴에 투표하세요', starts_at: at(2), ends_at: at(4) },
      { title: '만들기 체험 2회차', kind: 'workshop', starts_at: at(3), ends_at: at(4) },
      { title: '베스트 메뉴 발표 · 럭키드로우', kind: 'event', starts_at: at(6), ends_at: at(6.5) },
    )
    notices.push({ title: '시식 안내', body: '시식은 1인 1회, 스탬프 카드를 보여 주세요. 알레르기 정보는 각 부스 메뉴판에 표시돼 있어요.', pinned: true })
    draws.push({ title: '먹거리 스탬프 럭키드로우', prize: '특산물 1년 구독권', description: '먹거리 스탬프 3곳 이상', winners_count: 3, draw_at: at(6), status: 'open' })
    survey = { enabled: true, title: '오늘 먹거리, 어떠셨어요?', questions: [
      { id: 'q1', type: 'rating', label: '전체 만족도' },
      { id: 'q2', type: 'choice', label: '베스트 메뉴에 투표해 주세요', options: ['원조·전통', '신메뉴 1', '신메뉴 2', '신메뉴 3'] },
      { id: 'q3', type: 'choice', label: '오늘 얼마나 쓰셨어요?', options: ['1만원 이하', '1~3만원', '3~5만원', '5만원 이상'] },
      { id: 'q4', type: 'choice', label: '특산물을 사 가셨나요?', options: ['샀어요', '살 예정', '안 샀어요'] },
      { id: 'q5', type: 'text', label: '한마디' },
      ...STD_Q,
    ] }
    infoText = '시식: 1인 1회 · 스탬프 카드 지참\n피크닉존: 돗자리 대여 무료\n우천 시: 천막 안에서 정상 운영'
    directionsText = '주차: 행사장 주차장 (만차 시 셔틀 주차장)\n셔틀: 역 ↔ 행사장 15분 간격'
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
    survey = { enabled: true, title: '야시장, 어떠셨어요?', questions: [{ id: 'q1', type: 'rating', label: '전체 만족도' }, { id: 'q2', type: 'choice', label: '또 열리면?', options: ['꼭 올게요', '아마도', '글쎄요'] }, { id: 'q3', type: 'text', label: '한마디' }, ...STD_Q] }
    infoText = '운영: 17:00~21:00\n주차: 입주민 외 차량은 단지 밖 공영주차장'
  }

  await supabase.from('events').update({ ...ev, vendor_open: vendorOpen, info_text: infoText || null, contact_text: contactText || null, directions_text: directionsText || null }).eq('id', eventId)
  if (places.length) await supabase.from('places').insert(places.map(p => ({ ...p, event_id: eventId })))
  if (programs.length) await supabase.from('programs').insert(programs.map(p => ({ ...p, event_id: eventId })))
  if (notices.length) await supabase.from('notices').insert(notices.map(n => ({ ...n, event_id: eventId })))
  if (draws.length) await supabase.from('draws').insert(draws.map(d => ({ ...d, event_id: eventId })))
  if (survey) await supabase.from('surveys').upsert({ ...survey, event_id: eventId })
  // 스탬프 지점: 템플릿이 만든 부스·마켓 핀을 지점으로
  const { data: ps } = await supabase.from('places').select('id,name,kind').eq('event_id', eventId).in('kind', id === 'food-item' ? ['food', 'booth', 'market'] : ['booth', 'market', 'stage'])
  if (ps?.length && ev.stamp_enabled) await supabase.from('stamp_spots').insert(ps.map((p, i) => ({ event_id: eventId, place_id: p.id, name: p.name, sort_order: (i + 1) * 10 })))
}
