import { supabase } from './supabase'
import { seedDemoEvent } from './demoSeed'

/**
 * 데모 행사 목록 (2026-11-12) — 영업 대상마다 자기 행사와 닮은 걸 보여 주려고 유형별로 한 벌씩 깐다.
 * 실외 축제(겨울 축제 · 맥주축제) / 실내 페어 / 대학 축제 / 기업 행사. `/demo` 가 고르는 화면이고 `/demo?ev=fair` 처럼 바로 열 수도 있다.
 * 겨울 축제는 예전 그대로 demoSeed.ts, 나머지는 아래 SPEC 을 seedSpec 이 깐다. 대기 팀 수·메뉴·셀러 이름은 전부 가상이다.
 * 좌표(x,y %)는 scripts/demo-maps.mjs 가 그리는 배치도와 같은 값 — 한쪽을 옮기면 다른 쪽도 옮길 것.
 */
export type DemoKey = 'winter' | 'beer' | 'fair' | 'univ' | 'corp'
export const DEMO_EVENTS: { key: DemoKey; slug: string; name: string; type: string; map: string; points: string }[] = [
  { key: 'winter', slug: 'demo', name: '플릿 윈터 페스티벌', type: '실외 · 겨울 축제', map: '/demo-map.svg', points: '눈썰매 회차 예약 · 체험 원격 대기 · 먹거리 주문' },
  { key: 'beer', slug: 'demo-beer', name: '플릿 비어 페스타', type: '실외 · 맥주축제', map: '/demo-map-beer.svg', points: '성인 인증 줄서기 · 브루어리·푸드트럭 주문 · 혼잡도' },
  { key: 'fair', slug: 'demo-fair', name: '플릿 리빙 페어', type: '실내 · 페어', map: '/demo-map-fair.svg', points: '셀러 부스 지도 · 원데이 클래스 예약 · 스탬프 투어' },
  { key: 'univ', slug: 'demo-univ', name: '플릿대학교 대동제', type: '대학 축제', map: '/demo-map-univ.svg', points: '재학생존 입장 줄서기 · 학과 부스·푸드트럭 주문 · 공연 일정' },
  { key: 'corp', slug: 'demo-corp', name: '플릿전자 패밀리데이', type: '기업 행사', map: '/demo-map-corp.svg', points: '등록 데스크 대기 · 키즈존 회차 예약 · 경품 추첨' },
]
type Menu = { name: string; price?: string; desc?: string; sold_out?: boolean }[]
type Spec = {
  accent: string; venue?: 'indoor'; widthM?: number; closeH?: number
  info: string; directions: string; stampReward: string
  booths: { slug: string; name: string; mode: 'queue' | 'slot'; group: string; category: string; desc: string; location: string; wait: number; svc: number; x: number; y: number }[]
  places: { kind: string; name: string; description: string; x: number; y: number; crowd?: 'low' | 'mid' | 'high'; menu?: Menu }[]
  programs: { title: string; kind: 'stage' | 'event' | 'workshop' | 'other'; from: number; to: number; place?: string; description?: string }[]
  notices: { title: string; body: string; pinned?: boolean }[]
  stamps: string[]
  draw: { title: string; prize: string; description: string; require_stamp: boolean }
  survey: { title: string; best: string[] }
}

const SPEC: Record<Exclude<DemoKey, 'winter'>, Spec> = {
  beer: {
    accent: '#b45309', info: '운영 16:00~22:00\n주류는 성인 인증 팔찌를 찬 분께만 판매해요\n브루어리·푸드트럭은 앱으로 주문하고 알림이 오면 받아 가세요',
    directions: '대중교통을 이용해 주세요 (음주 운전 금지)\n셔틀: 역 ↔ 행사장 15분 간격', stampReward: '안내소에서 전용 맥주잔을 드려요',
    booths: [
      { slug: 'demo-beer-band', name: '성인 인증 · 팔찌', mode: 'queue', group: '입장', category: '입구', desc: '신분증 확인 후 팔찌를 채워 드려요', location: '입구 왼쪽', wait: 14, svc: 1, x: 40, y: 84.5 },
      { slug: 'demo-beer-photo', name: '포토부스', mode: 'queue', group: '체험', category: '체험 존', desc: '네 컷 사진 · 1팀 3분', location: '체험 존', wait: 6, svc: 3, x: 42, y: 46 },
      { slug: 'demo-beer-pong', name: '비어퐁 게임', mode: 'queue', group: '체험', category: '체험 존', desc: '2인 1팀 · 이기면 안주 쿠폰', location: '체험 존', wait: 2, svc: 5, x: 58, y: 51 },
      { slug: 'demo-beer-glass', name: '맥주잔 각인', mode: 'queue', group: '체험', category: '브루어리 존', desc: '이름을 새긴 전용 잔 · 10분', location: '브루어리 존', wait: 0, svc: 6, x: 25, y: 57 },
      { slug: 'demo-beer-class', name: '브루마스터 시음 클래스', mode: 'slot', group: '클래스', category: '체험 존', desc: '회차당 40분 · 4종 시음', location: '체험 존 안쪽', wait: 0, svc: 40, x: 52, y: 65 },
    ],
    places: [
      { kind: 'food', name: '라거 하우스', description: '브루어리 존 · 필스너 · 라거', x: 12, y: 47, crowd: 'high', menu: [{ name: '필스너 (400ml)', price: '7,000원' }, { name: '헬레스 라거 (400ml)', price: '7,000원' }, { name: '샘플러 3종', price: '12,000원' }] },
      { kind: 'food', name: '홉 스테이션', description: '브루어리 존 · IPA · 페일에일', x: 27, y: 47, crowd: 'mid', menu: [{ name: '웨스트코스트 IPA', price: '8,000원' }, { name: '페일에일', price: '7,500원' }, { name: '헤이지 IPA', price: '8,500원', sold_out: true }] },
      { kind: 'food', name: '다크 탭룸', description: '브루어리 존 · 스타우트 · 사워', x: 12, y: 60, crowd: 'low', menu: [{ name: '오트밀 스타우트', price: '8,000원' }, { name: '라즈베리 사워', price: '8,500원' }, { name: '무알코올 맥주', price: '5,000원' }] },
      { kind: 'food', name: '치킨 트럭', description: '푸드트럭 존', x: 72, y: 47, crowd: 'high', menu: [{ name: '순살 치킨', price: '12,000원' }, { name: '치즈볼 (5개)', price: '5,000원' }] },
      { kind: 'food', name: '소시지 · 감자튀김', description: '푸드트럭 존', x: 88, y: 47, crowd: 'mid', menu: [{ name: '수제 소시지 플레이트', price: '11,000원' }, { name: '감자튀김', price: '6,000원' }] },
      { kind: 'food', name: '타코 트럭', description: '푸드트럭 존', x: 72, y: 60, crowd: 'low', menu: [{ name: '비프 타코 (2개)', price: '9,000원' }, { name: '나초', price: '6,000원' }] },
      { kind: 'food', name: '화덕피자 트럭', description: '푸드트럭 존', x: 88, y: 60, crowd: 'mid', menu: [{ name: '마르게리타', price: '13,000원' }, { name: '페퍼로니', price: '14,000원' }] },
      { kind: 'market', name: '굿즈 마켓', description: '전용 잔 · 오프너 · 티셔츠', x: 22, y: 80, menu: [{ name: '전용 맥주잔', price: '8,000원' }, { name: '병따개 키링', price: '5,000원' }, { name: '티셔츠', price: '19,000원' }] },
      { kind: 'stage', name: '메인 무대', description: '밴드 공연 · DJ', x: 50, y: 12.5 },
      { kind: 'info', name: '안내소 · 경품 교환', description: '분실물 · 스탬프 경품 · 물 무료', x: 60, y: 84.5 },
      { kind: 'medical', name: '의무실', description: '간호 인력 상주 · 숙취 해소 음료', x: 78, y: 84.5 },
      { kind: 'facility', name: '화장실 (서)', description: '남 · 여 · 장애인 화장실', x: 8, y: 74, crowd: 'mid' },
      { kind: 'facility', name: '화장실 (동)', description: '남 · 여 · 장애인 화장실', x: 92, y: 74, crowd: 'low' },
      { kind: 'shuttle', name: '셔틀 정류장', description: '역 방면 · 15분 간격 · 막차 22:30', x: 80, y: 94.5 },
    ],
    programs: [{ title: '어쿠스틱 버스킹', kind: 'stage', from: -0.3, to: 0.4, place: '메인 무대' }, { title: '인디 밴드 공연', kind: 'stage', from: 1, to: 2, place: '메인 무대' }, { title: '건배 타임 · 경품 추첨', kind: 'event', from: 2.5, to: 2.8, place: '메인 무대', description: '스탬프 완주자 대상' }, { title: 'DJ 파티', kind: 'stage', from: 3, to: 4.5, place: '메인 무대' }],
    notices: [{ title: '주류는 팔찌를 찬 분께만 판매해요', body: '입구 왼쪽에서 신분증을 확인하고 팔찌를 받으세요. 줄은 앱으로 서면 돼요.', pinned: true }, { title: '음주 운전은 절대 안 돼요', body: '역까지 셔틀이 15분마다 다녀요. 막차는 22시 30분.' }],
    stamps: ['라거 하우스', '홉 스테이션', '다크 탭룸', '굿즈 마켓', '메인 무대'],
    draw: { title: '건배 럭키드로우', prize: '수제 맥주 선물 세트', description: '추첨은 메인 무대에서 해요', require_stamp: true },
    survey: { title: '오늘 맥주축제 어떠셨어요?', best: ['맥주', '먹거리', '공연', '체험', '분위기'] },
  },
  fair: {
    accent: '#be123c', venue: 'indoor', widthM: 100, closeH: 19, info: '운영 10:00~19:00 (입장 마감 18:30)\n셀러 부스 12곳 · 원데이 클래스는 회차 예약제\n스탬프 5개를 모으면 안내데스크에서 선물을 드려요',
    directions: '전시홀 1층 · 지하 주차장 3시간 무료\n지하철역 3번 출구에서 걸어서 5분', stampReward: '안내데스크에서 에코백을 드려요',
    booths: [
      { slug: 'demo-fair-candle', name: '캔들 원데이 클래스', mode: 'slot', group: '클래스', category: '클래스 존', desc: '회차당 50분 · 소이 캔들 1개 완성', location: '클래스 존 1번', wait: 0, svc: 50, x: 21, y: 70.5 },
      { slug: 'demo-fair-pottery', name: '도자기 페인팅 클래스', mode: 'slot', group: '클래스', category: '클래스 존', desc: '회차당 50분 · 접시에 그림 그리기', location: '클래스 존 2번', wait: 0, svc: 50, x: 37, y: 76 },
      { slug: 'demo-fair-caricature', name: '캐리커쳐', mode: 'queue', group: '체험', category: '체험 존', desc: '1명 10분 · 액자 포함', location: '체험 존', wait: 8, svc: 5, x: 54, y: 70.5 },
      { slug: 'demo-fair-color', name: '퍼스널컬러 진단', mode: 'queue', group: '체험', category: '체험 존', desc: '15분 진단 · 컬러 카드 증정', location: '체험 존', wait: 4, svc: 6, x: 67, y: 76 },
      { slug: 'demo-fair-photo', name: '포토부스', mode: 'queue', group: '체험', category: '체험 존', desc: '네 컷 사진 · 1팀 3분', location: '체험 존', wait: 0, svc: 3, x: 80, y: 70.5 },
    ],
    places: [
      ...([['A-1 모과공방', '소이 캔들 · 디퓨저', '소이 캔들|14,000원', '디퓨저|18,000원'], ['A-2 달빛도자기', '손으로 빚은 컵 · 접시', '머그|22,000원', '앞접시|15,000원'], ['A-3 느린 뜨개', '니트 소품 · 담요', '뜨개 코스터|6,000원', '무릎 담요|38,000원'], ['A-4 초록상점', '화분 · 행잉 플랜트', '미니 화분|9,000원', '행잉 플랜트|16,000원'],
        ['B-1 종이섬', '엽서 · 스티커 · 다이어리', '엽서 세트|5,000원', '다이어리|16,000원'], ['B-2 우드 온기', '원목 도마 · 트레이', '원목 도마|32,000원', '트레이|24,000원'], ['B-3 조명가게 밤', '무드등 · 스탠드', '무드등|29,000원', '스탠드|58,000원'], ['B-4 그림 한 장', '일러스트 포스터 · 액자', 'A3 포스터|12,000원', '액자|20,000원'],
        ['C-1 패브릭 하루', '쿠션 · 앞치마', '쿠션 커버|18,000원', '앞치마|26,000원'], ['C-2 향기 서재', '룸 스프레이 · 인센스', '룸 스프레이|17,000원', '인센스 세트|13,000원'], ['C-3 라탄 마루', '바구니 · 코스터', '라탄 바구니|21,000원', '코스터|7,000원'], ['C-4 천연 비누가게', '수제 비누 · 입욕제', '수제 비누|7,000원', '입욕제 세트|15,000원']] as string[][])
        .map((r, i) => ({ kind: 'market', name: r[0], description: r[1], x: [20, 40, 60, 80][i % 4], y: [30, 44, 58][Math.floor(i / 4)], menu: r.slice(2).map(s => ({ name: s.split('|')[0], price: s.split('|')[1] })) })),
      { kind: 'food', name: '커피 바', description: '카페 라운지', x: 16, y: 12.5, crowd: 'mid', menu: [{ name: '아메리카노', price: '4,000원' }, { name: '라테', price: '4,800원' }, { name: '밀크티', price: '5,500원' }] },
      { kind: 'food', name: '디저트 바', description: '카페 라운지', x: 30, y: 12.5, crowd: 'low', menu: [{ name: '휘낭시에 (2개)', price: '5,000원' }, { name: '르뱅 쿠키', price: '4,500원' }, { name: '티라미수', price: '6,500원', sold_out: true }] },
      { kind: 'stage', name: '메인 무대', description: '작가 토크 · 경품 추첨', x: 72, y: 12.5 },
      { kind: 'info', name: '안내데스크 · 경품 교환', description: '입장 등록 · 분실물 · 스탬프 경품', x: 38, y: 87 },
      { kind: 'facility', name: '물품보관소', description: '외투 · 캐리어 보관 (무료)', x: 62, y: 87 },
      { kind: 'facility', name: '화장실', description: '남 · 여 · 장애인 화장실', x: 90, y: 88, crowd: 'low' },
      { kind: 'facility', name: '수유실', description: '수유 공간 · 기저귀 교환대', x: 10, y: 88 },
    ],
    programs: [{ title: '작가 토크 — 작은 공방으로 먹고살기', kind: 'stage', from: -0.2, to: 0.5, place: '메인 무대' }, { title: '캔들 원데이 클래스', kind: 'workshop', from: 1, to: 1.8, description: '클래스 존 · 예약제' }, { title: '플랜테리어 시연', kind: 'stage', from: 2, to: 2.6, place: '메인 무대' }, { title: '럭키드로우 추첨', kind: 'event', from: 3.5, to: 3.8, place: '메인 무대', description: '스탬프 완주자 대상' }],
    notices: [{ title: '원데이 클래스는 회차 예약제예요', body: '클래스 존에서 줄 서지 않고, 회차를 고르고 시간 맞춰 오시면 돼요.', pinned: true }, { title: '물품보관소를 무료로 쓰세요', body: '입구 오른쪽이에요. 외투와 큰 짐을 맡기고 가볍게 둘러보세요.' }],
    stamps: ['A-1 모과공방', 'B-2 우드 온기', 'B-4 그림 한 장', 'C-2 향기 서재', '메인 무대'],
    draw: { title: '리빙 페어 럭키드로우', prize: '셀러 상품 꾸러미', description: '추첨은 메인 무대에서 해요', require_stamp: true },
    survey: { title: '오늘 페어 어떠셨어요?', best: ['셀러 부스', '클래스', '체험', '카페 라운지', '무대 프로그램'] },
  },
  univ: {
    accent: '#1d4ed8', info: '운영 12:00~22:00\n재학생존은 학생증 확인 후 팔찌를 받아 입장해요\n학과 부스·푸드트럭은 앱으로 주문하고 알림이 오면 받아 가세요',
    directions: '정문 → 잔디광장 방향\n교내 주차 불가 · 셔틀: 역 ↔ 정문 10분 간격', stampReward: '총학생회 본부에서 축제 굿즈를 드려요',
    booths: [
      { slug: 'demo-univ-band', name: '재학생존 팔찌', mode: 'queue', group: '입장', category: '노천극장', desc: '학생증 확인 후 팔찌 · 공연 앞 구역 입장', location: '노천극장 왼쪽', wait: 18, svc: 1, x: 34, y: 24.5 },
      { slug: 'demo-univ-photo', name: '인생네컷', mode: 'queue', group: '체험', category: '잔디광장', desc: '축제 프레임 · 1팀 3분', location: '잔디광장', wait: 9, svc: 3, x: 40, y: 41 },
      { slug: 'demo-univ-tattoo', name: '타투 스티커 · 헤나', mode: 'queue', group: '체험', category: '잔디광장', desc: '1명 5분', location: '잔디광장', wait: 3, svc: 4, x: 60, y: 46 },
      { slug: 'demo-univ-shoot', name: '사격 게임', mode: 'queue', group: '체험', category: '잔디광장', desc: '10발 · 명중 수만큼 간식', location: '잔디광장', wait: 5, svc: 4, x: 40, y: 55 },
      { slug: 'demo-univ-caricature', name: '캐리커쳐', mode: 'queue', group: '체험', category: '잔디광장', desc: '1명 10분', location: '잔디광장', wait: 0, svc: 5, x: 60, y: 60 },
    ],
    places: [
      { kind: 'food', name: '경영학과 분식', description: '학과 부스', x: 12, y: 39, crowd: 'high', menu: [{ name: '떡볶이', price: '4,000원' }, { name: '김말이 튀김', price: '3,000원' }, { name: '어묵', price: '2,000원' }] },
      { kind: 'food', name: '체육교육과 닭꼬치', description: '학과 부스', x: 12, y: 51, crowd: 'mid', menu: [{ name: '닭꼬치', price: '3,500원', desc: '소금 / 양념' }, { name: '소떡소떡', price: '3,000원' }] },
      { kind: 'food', name: '식품영양학과 디저트', description: '학과 부스', x: 12, y: 63, crowd: 'low', menu: [{ name: '크로플', price: '4,000원' }, { name: '레몬에이드', price: '3,000원' }] },
      { kind: 'food', name: '스테이크 트럭', description: '푸드트럭', x: 88, y: 39, crowd: 'high', menu: [{ name: '큐브 스테이크', price: '11,000원' }, { name: '감자튀김', price: '5,000원' }] },
      { kind: 'food', name: '타코야끼 트럭', description: '푸드트럭', x: 88, y: 51, crowd: 'mid', menu: [{ name: '타코야끼 (8알)', price: '6,000원' }, { name: '야끼소바', price: '8,000원' }] },
      { kind: 'food', name: '츄러스 트럭', description: '푸드트럭', x: 88, y: 63, crowd: 'low', menu: [{ name: '츄러스', price: '4,000원' }, { name: '아이스크림 츄러스', price: '6,000원' }] },
      { kind: 'food', name: '커피 트럭', description: '푸드트럭', x: 74, y: 51, crowd: 'low', menu: [{ name: '아이스 아메리카노', price: '3,000원' }, { name: '복숭아 아이스티', price: '3,500원' }] },
      { kind: 'market', name: '동아리 플리마켓', description: '핸드메이드 · 굿즈 — 동아리 8팀', x: 26, y: 45, menu: [{ name: '비즈 반지', price: '5,000원' }, { name: '학교 마스코트 키링', price: '6,000원' }, { name: '엽서 세트', price: '4,000원' }] },
      { kind: 'market', name: '빈티지 마켓', description: '구제 의류 · 액세서리', x: 26, y: 59, menu: [{ name: '구제 셔츠', price: '15,000원' }, { name: '스카프', price: '8,000원' }] },
      { kind: 'stage', name: '노천극장 메인 무대', description: '동아리 공연 · 초청 가수', x: 50, y: 11.5 },
      { kind: 'other', name: '포토존', description: '대동제 포토월 · 야간 조명', x: 50, y: 70 },
      { kind: 'info', name: '총학생회 본부 · 안내', description: '분실물 · 스탬프 경품 · 미아 보호', x: 38, y: 85.5 },
      { kind: 'medical', name: '의무실', description: '보건 인력 상주 · 구급함', x: 62, y: 85.5 },
      { kind: 'facility', name: '화장실 (학생회관)', description: '남 · 여 · 장애인 화장실', x: 8, y: 77, crowd: 'mid' },
      { kind: 'facility', name: '화장실 (도서관)', description: '남 · 여 · 장애인 화장실', x: 92, y: 77, crowd: 'low' },
      { kind: 'shuttle', name: '셔틀 정류장', description: '역 방면 · 10분 간격', x: 82, y: 94.5 },
    ],
    programs: [{ title: '동아리 연합 공연', kind: 'stage', from: -0.4, to: 0.6, place: '노천극장 메인 무대' }, { title: '학과 대항 장기자랑', kind: 'event', from: 1, to: 2, place: '노천극장 메인 무대' }, { title: '재학생존 입장 시작', kind: 'event', from: 2.5, to: 3, description: '팔찌를 찬 재학생만 입장' }, { title: '초청 가수 공연', kind: 'stage', from: 3, to: 4.5, place: '노천극장 메인 무대' }],
    notices: [{ title: '재학생존은 팔찌가 있어야 들어가요', body: '노천극장 왼쪽에서 학생증을 확인해요. 줄은 앱으로 서고, 차례가 되면 알림이 가요.', pinned: true }, { title: '교내 주류 판매는 없어요', body: '학과 부스와 푸드트럭에서는 음료와 먹거리만 팔아요.' }],
    stamps: ['경영학과 분식', '동아리 플리마켓', '인생네컷', '포토존', '노천극장 메인 무대'],
    draw: { title: '대동제 럭키드로우', prize: '무선 이어폰 외 10명', description: '추첨은 노천극장에서 해요', require_stamp: true },
    survey: { title: '올해 대동제 어떠셨어요?', best: ['공연', '학과 부스', '푸드트럭', '체험', '플리마켓'] },
  },
  corp: {
    accent: '#047857', closeH: 17, info: '운영 11:00~17:00\n등록 데스크에서 명찰과 식사 쿠폰을 받으세요\n키즈 존은 회차 예약제, 체험은 원격 대기예요',
    directions: '사내 주차장 이용 (가족 차량 1대)\n셔틀: 본사 정문 ↔ 행사장 20분 간격', stampReward: '등록 데스크에서 가족 기념품을 드려요',
    booths: [
      { slug: 'demo-corp-desk', name: '등록 데스크', mode: 'queue', group: '등록', category: '입구', desc: '명찰 · 식사 쿠폰 · 기념품 수령', location: '입구 왼쪽', wait: 11, svc: 1, x: 36, y: 85.5 },
      { slug: 'demo-corp-bounce', name: '에어바운스', mode: 'slot', group: '키즈', category: '키즈 존', desc: '회차당 20분 · 5~10세', location: '키즈 존', wait: 0, svc: 20, x: 16, y: 34 },
      { slug: 'demo-corp-train', name: '미니 기차', mode: 'queue', group: '키즈', category: '키즈 존', desc: '한 바퀴 5분 · 보호자 동승 가능', location: '키즈 존', wait: 7, svc: 3, x: 16, y: 48 },
      { slug: 'demo-corp-face', name: '페이스페인팅', mode: 'queue', group: '키즈', category: '키즈 존', desc: '1명 5분', location: '키즈 존', wait: 4, svc: 4, x: 30, y: 41 },
      { slug: 'demo-corp-caricature', name: '가족 캐리커쳐', mode: 'queue', group: '체험', category: '체험 존', desc: '가족 1팀 15분 · 액자 포함', location: '체험 존', wait: 9, svc: 6, x: 84, y: 35 },
      { slug: 'demo-corp-diffuser', name: '석고방향제 만들기', mode: 'queue', group: '체험', category: '체험 존', desc: '15분이면 완성', location: '체험 존', wait: 2, svc: 5, x: 84, y: 49 },
      { slug: 'demo-corp-photo', name: '가족 포토부스', mode: 'queue', group: '체험', category: '체험 존', desc: '인화 사진 2장 · 1팀 3분', location: '체험 존', wait: 0, svc: 3, x: 70, y: 41 },
    ],
    places: [
      { kind: 'food', name: '바비큐', description: '케이터링 존 · 식사 쿠폰 1장', x: 30, y: 65, crowd: 'high' },
      { kind: 'food', name: '분식', description: '케이터링 존 · 식사 쿠폰 1장', x: 44, y: 65, crowd: 'mid' },
      { kind: 'food', name: '커피 · 음료', description: '케이터링 존 · 자유 이용', x: 58, y: 65, crowd: 'low' },
      { kind: 'food', name: '아이스크림 · 디저트', description: '케이터링 존 · 자유 이용', x: 72, y: 65, crowd: 'mid' },
      { kind: 'stage', name: '메인 무대', description: '레크리에이션 · 경품 추첨', x: 50, y: 12 },
      { kind: 'info', name: '안내 · 미아 보호', description: '분실물 · 미아 보호 · 유모차 대여', x: 64, y: 85.5 },
      { kind: 'medical', name: '의무실', description: '간호 인력 상주 · 구급함', x: 78, y: 80.5 },
      { kind: 'facility', name: '화장실 · 수유실', description: '수유실 · 기저귀 교환대 있어요', x: 92, y: 70, crowd: 'low' },
      { kind: 'parking', name: '주차장', description: '가족 차량 1대 · 200면', x: 16, y: 90, crowd: 'mid' },
      { kind: 'shuttle', name: '셔틀 정류장', description: '본사 정문 방면 · 20분 간격', x: 84, y: 94.5 },
    ],
    programs: [{ title: '대표 인사 · 개회', kind: 'event', from: -0.3, to: 0, place: '메인 무대' }, { title: '가족 레크리에이션', kind: 'stage', from: 0.5, to: 1.5, place: '메인 무대' }, { title: '버블 매직쇼', kind: 'stage', from: 2, to: 2.6, place: '메인 무대' }, { title: '경품 추첨', kind: 'event', from: 3.5, to: 4, place: '메인 무대', description: '등록한 임직원 가족 대상' }],
    notices: [{ title: '등록 데스크에 먼저 들러 주세요', body: '명찰과 식사 쿠폰, 기념품을 드려요. 줄은 앱으로 서면 돼요.', pinned: true }, { title: '키즈 존은 회차 예약제예요', body: '에어바운스는 회차를 고르고 시간 맞춰 오시면 돼요. 5~10세.' }],
    stamps: ['페이스페인팅', '석고방향제 만들기', '가족 포토부스', '바비큐', '메인 무대'],
    draw: { title: '패밀리데이 경품 추첨', prize: '가족 여행 상품권 외 20명', description: '추첨은 메인 무대에서 해요', require_stamp: false },
    survey: { title: '오늘 패밀리데이 어떠셨어요?', best: ['키즈 존', '체험', '식사', '레크리에이션', '경품'] },
  },
}

const settings = (service_min: number) => ({ max_party_size: 4, allow_duplicate_phone: false, queue_close_before_min: 0, notify_ahead_teams: 3, call_valid_min: 10, reserve_open_at: null, reserve_close_before_min: 0, reminders: [], noshow_after_start_min: 10, transfer_noshow_to_queue: false, cancel_until_before_min: 0, sms_fallback: false, service_min })

async function seedSpec(eventId: string, d: (typeof DEMO_EVENTS)[number], s: Spec) {
  const day = new Date(); day.setHours(0, 0, 0, 0)
  const closeH = Math.min(24, Math.max(s.closeH ?? 22, new Date().getHours() + 4))
  const at = (h: number) => new Date(Math.round((Date.now() + h * 3600_000) / 600_000) * 600_000).toISOString()
  await supabase.from('events').update({
    status: 'open', starts_at: day.toISOString(), ends_at: new Date(day.getTime() + 2 * 86400_000).toISOString(),
    map_image_url: d.map, accent_color: s.accent, template: 'demo', venue: s.venue ?? 'outdoor', map_width_m: s.widthM ?? 220,
    stamp_enabled: true, stamp_goal: null, stamp_reward_text: s.stampReward, info_text: s.info, contact_text: '운영본부 010-2244-3585', directions_text: s.directions,
  } as any).eq('id', eventId)
  const { data: bs } = await supabase.from('booths').insert(s.booths.map((b, i) => ({ slug: b.slug, name: b.name, mode: b.mode, group_name: b.group, category: b.category, description: b.desc, location: b.location, demo_wait: b.wait, settings: settings(b.svc), event_id: eventId, is_paused: false, sort_order: (i + 1) * 10, image_url: null, icon_url: null })) as any).select()
  const boothId = (slug: string) => (bs as any[])?.find(b => b.slug === slug)?.id ?? null
  const places = [
    ...s.booths.map((b, i) => ({ kind: 'booth', name: b.name, description: b.desc, x: b.x, y: b.y, sort_order: (i + 1) * 10, booth_id: boothId(b.slug) })),
    ...s.places.map((p, i) => ({ ...p, hours: p.kind === 'food' ? `~${closeH}:00` : null, sort_order: 100 + i * 10 })),
  ]
  const { data: ps } = await supabase.from('places').insert(places.map(p => ({ menu: [], hours: null, crowd: null, booth_id: null, image_url: null, lat: null, lng: null, ...p, event_id: eventId })) as any).select()
  const placeId = (name?: string) => (name && (ps as any[])?.find(p => p.name === name)?.id) || null
  await supabase.from('programs').insert(s.programs.map(p => ({ title: p.title, kind: p.kind, description: p.description ?? null, starts_at: at(p.from), ends_at: at(p.to), place_id: placeId(p.place), event_id: eventId })) as any)
  await supabase.from('notices').insert(s.notices.map(n => ({ event_id: eventId, title: n.title, body: n.body, pinned: !!n.pinned })) as any)
  await supabase.from('stamp_spots').insert(s.stamps.map((n, i) => ({ event_id: eventId, place_id: placeId(n), name: n, sort_order: (i + 1) * 10 })) as any)
  await supabase.from('draws').insert([{ event_id: eventId, title: s.draw.title, prize: s.draw.prize, description: s.draw.description, draw_at: at(3.5), winners_count: 5, require_stamp: s.draw.require_stamp }] as any)
  await supabase.from('surveys').upsert({ event_id: eventId, enabled: true, title: s.survey.title, thanks: null, questions: [
    { id: 'q1', type: 'rating', label: '전체적으로 어떠셨어요?' },
    { id: 'q2', type: 'choice', label: '가장 좋았던 건?', options: s.survey.best },
    { id: 'q3', type: 'choice', label: '대기는 어떠셨어요?', options: ['거의 안 기다림', '기다릴 만함', '오래 기다림'] },
    { id: 'q4', type: 'text', label: '한마디' },
    { id: 'q_res', type: 'choice', label: '어디서 오셨어요?', options: ['시내(관내)', '도내 다른 시·군', '수도권', '그 외 지역'] },
    { id: 'q_age', type: 'choice', label: '연령대', options: ['10대', '20대', '30대', '40대', '50대 이상'] },
    { id: 'q_with', type: 'choice', label: '누구와 오셨어요?', options: ['가족(아이 동반)', '친구', '연인', '혼자', '단체'] },
    { id: 'q_via', type: 'choice', label: '어떻게 알게 되셨어요?', options: ['현수막·포스터', 'SNS', '지인', '뉴스·블로그', '지나가다'] },
  ] } as any)
}

/** 아직 없는 데모 행사만 깐다 (only 를 주면 그 행사 하나만) — 예전 데모(겨울 축제만 있던 기기)도 다시 열면 나머지가 채워진다 */
export async function seedMissingDemoEvents(only?: DemoKey | null) {
  const { data: ex } = await supabase.from('events').select('slug')
  const have = new Set(((ex as any[]) ?? []).map(e => e.slug))
  for (const d of DEMO_EVENTS) {
    if (have.has(d.slug) || (only && d.key !== only)) continue   // 행사 잠금이면 그 행사만 깐다 — 관리자 화면에도 그 행사만 보인다
    const { data: id, error } = await supabase.rpc('create_my_event', { p_name: `${d.name} (데모)`, p_slug: d.slug, p_starts_at: new Date().toISOString(), p_ends_at: new Date(Date.now() + 86400_000).toISOString() })
    if (error) throw error
    if (d.key === 'winter') await seedDemoEvent(id); else await seedSpec(id, d, SPEC[d.key])
  }
}
