# FLIT WAIT — 체험부스 대기표·사전 예약 시스템

행사 체험부스의 **현장 대기표(queue)** 와 **사전 시간 예약(slot)** 을 한 시스템으로 처리하고, 카카오 알림톡(실패 시 SMS)으로 손님에게 순서·예약을 알리는 모바일 웹.
첫 적용: 2026 성남테크아트페스티벌 탄천마켓 (10/23~25). 이후 행사 주최 측 납품용.

**문서**: 전체 안내 `docs/시스템_매뉴얼.md` · 서버 운영 `OPERATIONS.md` · 현장 장애 `docs/장애대응_런북.md` · 스태프 `docs/staff-manual-seongnam-2026.html`

- 프론트: React + Vite + Tailwind + **PWA**(vite-plugin-pwa: 앱 셸 프리캐시, /api/public 네트워크 우선·오프라인 폴백, 이미지 캐시) → Vercel (`wait.flitunion.com`)
- 백엔드: Supabase 프로젝트 `flit-wait` (`mqrafomyngxsixakbnzu`, 서울) — Postgres RPC + RLS + Realtime + Edge Function + pg_cron
- 발송: 네이버 클라우드 SENS 알림톡 + SMS failover (Edge Function `notify`)

## 라우트

- `/e/:slug` 행사 홈(대문) · `/e/:slug/booths` 체험부스 목록 · `/e/:slug/map` 지도 · `/e/:slug/schedule` 일정·안내 · `/e/:slug/stamp` 스탬프

| 경로 | 대상 | 설명 |
|---|---|---|
| `/q/:slug` | 손님 | 대기표 접수 (QR) |
| `/r/:slug` | 손님 | 회차 사전 예약 |
| `/e/:slug/map` | 손님 | **행사장 지도** — 배치도 위 핀(체험부스·먹거리·편의시설·무대), 핀 카드에서 대기 현황·접수·카카오맵 길찾기 (0036, 관리자 > 지도 탭에서 편집) |
| `/e/:slug/map` → **3D** | 손님 | **3D 행사장 지도** (2026-11-12, `src/components/Map3D.tsx`) — 지도 화면의 '지도 · 3D · 목록' 전환. 배치도 그림을 바닥에 깔고 핀 자리에 종류별 부스를 세운다(따로 넣는 데이터 없음 — 관리자 > 지도 탭의 핀이 그대로 3D 가 된다). 지붕 색 = 지금 대기(2D 핀과 같은 3색), '가는 길'은 부스를 피해 가는 경로, '걸어가기'는 눈높이로 그 길을 따라간다. 축척·부스 크기는 근사(배치도가 그림이라서). three 는 지연 로딩이고 PWA 프리캐시에서 뺐다 |
| `/e/:slug/schedule` | 손님 | **일정·안내** — 공지(긴급·고정·발행 예약), 날짜별 타임테이블(진행 중 강조), 행사 안내·연락처 (0037, 관리자 > 일정·안내 탭) |
| `/e/:slug/stamp` · `/stamp/:code` | 손님 | **스탬프 투어** — 부스 QR(:code) 찍으면 적립, 목표 달성 시 6자리 교환 코드. 기기별 카드(localStorage) (0037, 관리자 > 스탬프 탭: 지점·QR 인쇄·교환 확인) |
| `/e/:slug/draw` · `/survey` | 손님 | **럭키드로우** 응모·당첨 발표 / **만족도 설문** (0039, 관리자 > 참여·셀러 탭) |
| `/v/:token` | 참가 업체 | **셀러·푸드트럭 셀프 등록** — 기획자가 링크 배포, 승인 시 지도 핀으로 (0039) |
| `/t/:token` | 손님 | 내 대기/예약 상태 (알림톡 버튼 링크), 취소 |
| `/s/:slug` | 스태프 | PIN 로그인 → `/s/:slug/board` 대기열·회차 체크인 |
| `/admin` | 기획자 | **이메일 매직링크·카카오**(셀프 가입, `create_my_event` 로 자기 행사 개설) 또는 **접속 코드** 로그인 (admin_codes · Edge Function admin-login), 행사·부스·회차·설정·PIN·QR·통계·코드 발급·발송 로그 |

## 축제 앱 (2026-11-04 확장)

**데모 모드 `/demo`** — 로그인·마이그레이션 없이 브라우저 안 가짜 DB(`src/lib/demo.ts`, localStorage)로 관리자·손님 화면 전부 동작. 샘플 행사(야간 마켓 템플릿, slug `demo`)를 깔고 `/admin` 으로 보낸다. 프로덕션에 요청이 한 건도 안 나간다(e2e 로 확인). 리포트 숫자는 가상 샘플. `?reset=1` 로 다시 깔기, 상단 띠의 '끝내기' 로 해제. 영업 시연·내부 리뷰용.


기획자가 직접 넣는 콘텐츠: 지도 핀(`places`)·타임테이블(`programs`)·공지(`notices`)·안내문·스탬프 투어(`stamp_*`). 마이그레이션 0036~0041. '새 행사' 템플릿(`src/lib/templates.ts`): **야간 마켓·야행** · **러닝 페스티벌·마켓** · **단일 먹거리 축제** (2026 지자체 흐름: 야간형·체류형·러닝·단일 아이템) / 겨울 페어·연말 마켓 / 축제 / 아파트 야시장 — 샘플 핀·일정·공지·추첨·설문을 깔고 시작. 행사 설정에 테마 색(`accent_color`).
관리자 탭: **운영안**(자동 생성) / 부스 / 지도 / 일정·안내 / 스탬프 / 참여·셀러 / 통계 / **리포트**(`admin_event_report` 집계 한 장, 인쇄→PDF) / 행사 설정 / 접속 코드 / 발송 로그.
**준비 체크리스트** (`AdminChecklist`): 준비 중(draft) 행사 상단에 배치도·핀·일정·안내·스탬프·셀러 링크 진행 상태를 DB 에서 세어 보여주고, '운영 시작' 으로 `status='open'` (그 전엔 손님 화면 `/e/:slug` 가 안 열린다).
**운영안 자동 생성** (`AdminPlan` + `api/plan-import.ts`): 운영안을 붙여 넣거나 PDF(브라우저에서 `pdfjs-dist` 로 텍스트 추출)를 올리면 Edge 함수가 Claude API(tool use 로 스키마 강제)로 핀·타임테이블·공지·안내·럭키드로우·설문·스탬프 초안을 뽑아 돌려주고, 미리보기에서 체크한 것만 브라우저가 RLS 로 insert. 호출자는 세션 토큰을 `my_admin_scope` 로 검증. **Vercel 환경변수 `ANTHROPIC_API_KEY` 필수**(`ANTHROPIC_MODEL` 선택, 기본 `claude-sonnet-5-5`). 적용은 **이름 매칭 갱신** — 같은 이름 핀·일정은 내용만 덮어쓰고 위치·스탬프 QR code·대기 부스 연결은 유지, 새 이름은 추가, 운영안에서 빠진 건 지우지 않고 표시만. 초안으로 QR 먼저 뽑고 확정안으로 다시 돌리는 흐름을 전제로 한다.
**레퍼런스 대조 보강 (0040, 2026-11-04)** — 페스티컴퍼니(festi.co.kr)·페스티맵·관광공사 축집사의 지자체 축제 가이드 기본 항목과 비교해 넣은 것: 핀 종류 **주차장·셔틀 정류장·의무실**, 핀별 **수동 혼잡도**(여유/보통/혼잡 — 관리자 지도 탭에서 스태프가 누름, 손님 지도에 배지·N분 전, `places.crowd` + 트리거로 `crowd_updated_at`), `events.directions_text` **오시는 길**(홈 카드 + 지도 상단, 카카오맵/네이버지도 길찾기), 타임테이블 **★ 찜**(기기 저장, '찜한 것만' 필터), 행사 상세 상단 **행사 QR 인쇄·PNG**. 실시간 혼잡도(센서·AI 카메라)·셔틀 위치 추적·쿠폰북·현장 투표는 안 넣었다 — 혼잡도는 수동으로 충분히 같은 가치를 내고, 나머지는 실제 수요가 보이면.
**축제 데이터 리포트** (`AdminDataReport`, 0041) — 주최(지자체·대학) 결과보고 첨부용. 방문(일자·시간대·거주지·연령·동반·유입) → 동선(스탬프 시각으로 지점 도달률·체류 중앙값·많이 다닌 길·첫 방문 지점) → 체험·소비(부스별 처리·노쇼율, 셀러 등록·추첨 응모; 셀러별 매출은 QR 결제 연동 시) → 반응(설문) → 운영(구역 혼잡 지속 분 `crowd_log`, 공지 이력). 설문 기본 문항에 표준 4문항(거주지·연령·동반·유입, id `q_*`)이 들어 있어야 1장이 채워진다 — 리포트가 라벨 키워드로 찾으니 라벨 바꾸지 말 것. `event_views` 에 `hour` 추가(시간대 유입). 손으로 적는 건 제출처·총평뿐.
방문 집계 `event_views`(`track_view`, 개인정보 없음). ⚠️ 카카오 로그인은 Supabase Auth > Providers > Kakao 설정(REST 키·리다이렉트) 후에 동작, 이메일 매직링크는 Site URL/Redirect 에 `/admin` 허용 필요.

## 구조

```
events → booths(mode: queue | slot | hybrid, settings jsonb) → slots
tickets(slot_id null = 대기표, 있으면 예약)   notifications(발송 큐+로그)   templates(알림톡 템플릿 매핑)
```

- 손님·스태프는 테이블을 직접 읽지 않고 **SECURITY DEFINER RPC** 만 호출 (`join_queue`, `reserve_slot`, `get_ticket`, `cancel_ticket`, `staff_login`, `staff_board`, `staff_update_ticket`, `staff_add_walkin`, `staff_toggle_pause`)
- 실시간 갱신: `booth_versions` 공개 테이블을 트리거로 bump → 클라이언트가 구독 후 RPC 재조회 (+ 폴링 fallback)
- 스케줄러 `run_scheduler()` (pg_cron 매분): 순서 임박 알림(Q02) 적재, 호출 후 유효시간 경과 노쇼, 회차 시작 N분 후 미체크인 노쇼, 보존기간 경과 개인정보 파기
- Edge Function `notify` (pg_cron 매분 호출): `notifications.pending` → NCP SENS 발송. `ncp_template_code` 없으면 SMS, `NCP_ACCESS_KEY` 없으면 dry-run

## 관리자 설정값 (`booths.settings`)

`max_party_size`, `allow_duplicate_phone`, `queue_close_before_min`, `notify_ahead_teams`, `call_valid_min`,
`reserve_open_at`, `reserve_close_before_min`, `reminders[]`, `noshow_after_start_min`, `transfer_noshow_to_queue`,
`cancel_until_before_min`, `sms_fallback` — 전부 `/admin/booths/:id` 화면에서 수정.

## 로컬 실행

```bash
cd flit-wait
cp .env.example .env   # 값은 아래
npm i && npm run dev
```

`.env`
```
VITE_SUPABASE_URL=https://mqrafomyngxsixakbnzu.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_3qQAKwuNVFQellrOrjoB0g_qK9dz5Il
VITE_PUBLIC_BASE_URL=https://wait.flitunion.com
```

## 배포 상태 (2026-10-08 새벽 기준)

- [x] DB 스키마·함수·RLS·cron 적용 (`supabase/migrations/0001~0003`)
- [x] Edge Function `notify` 배포 (dry-run)
- [x] Vercel 프로젝트 `flit-wait` + `wait.flitunion.com` 도메인 연결, env 3종 등록
- [x] 성남 행사(`seongnam-2026`) + 부스 6개 생성 (jegi / cornhole / petanque / jenga / cooking-nacho / cooking-cupcake)
- [ ] **아래 "남은 설정" 수동 처리 필요**

## 남은 설정 (아로가 할 것)

### 1. Supabase SQL Editor 에서 1회 실행 — 부스 설정값·쿠킹 회차·관리자 등록
`booths` 테이블 쓰기가 승인창에서 막혀서 못 넣음. 대시보드 SQL Editor에서 실행:

```sql
-- 부스 기본 설정값 채우기 (쿠킹 2개의 max_party_size=2, reserve_open_at=10/20 10:00 은 유지)
update booths set settings = '{
  "max_party_size": 4, "allow_duplicate_phone": false, "queue_close_before_min": 30,
  "notify_ahead_teams": 2, "call_valid_min": 5, "reserve_open_at": null, "reserve_close_before_min": 60,
  "reminders": [{"type":"day_before","hour":19},{"type":"before_min","min":30}],
  "noshow_after_start_min": 10, "transfer_noshow_to_queue": true, "cancel_until_before_min": 120, "sms_fallback": true
}'::jsonb || settings;

-- 쿠킹 회차: 10/23(금)~10/25(일) 14:00 15:00 16:00 17:00, 30분, 20명
insert into slots(booth_id, starts_at, ends_at, capacity)
select b.id, (d + tm) at time zone 'Asia/Seoul', ((d + tm) at time zone 'Asia/Seoul') + interval '30 minutes', 20
from booths b
cross join unnest(array['2026-10-23','2026-10-24','2026-10-25']::date[]) d
cross join unnest(array['14:00','15:00','16:00','17:00']::time[]) tm
where b.mode = 'hybrid';


-- 테스트로 넣은 대기표 3건 삭제
delete from tickets where name in ('테스트','둘째','셋째');
```

### 2. 스태프 PIN
`/admin/booths/:id` 화면에서 부스마다 PIN 설정 (또는 SQL `select admin_set_pin('<booth uuid>', '1234')` — 관리자 로그인 상태에서).

### 2-1. 관리자 로그인
이메일 계정 없음. `/admin` 에서 접속 코드 입력 → Edge Function `admin-login` 이 코드 검증 후 세션 발급.
- 전체 관리자(아로): `FLIT-OWNER-2026` (`admin_codes` 테이블에서 변경 가능)
- 행사 담당자: 관리자 > 행사 > **접속 코드** 탭에서 발급/비활성화 (해당 행사만 보임)

### 3. Edge Function secrets (Supabase 대시보드 > Edge Functions > notify > Secrets)
```
CRON_SECRET=822b2df12e404747dc589c28b21e6decf0d3dfdcaff34a29   # Vault 의 cron_secret 과 동일, 이미 cron 에 들어있음
PUBLIC_BASE_URL=https://wait.flitunion.com
SOLAPI_SENDER=010XXXXXXXX # 등록한 발신번호 (숫자만)
```
알림톡 템플릿 승인되면 `templates.ncp_template_code` 에 NCP 템플릿 코드 입력 → 그때부터 알림톡, 전에는 SMS.

### 4. Vercel ↔ GitHub 연결
Vercel 프로젝트 `flit-wait` 를 이 레포(`leearo9528-creator/FLIT`)에 연결하고 **Root Directory = `flit-wait`** 로 설정. (Settings > Git)

## 알림톡 템플릿 6종 (검수 신청용)

| 코드 | 용도 | 변수 | 버튼 |
|---|---|---|---|
| Q01 | 대기 접수 완료 | 행사명 부스명 이름 대기번호 앞대기수 | 대기 현황 보기 → `https://wait.flitunion.com/t/#{token}` |
| Q02 | 순서 임박 | 행사명 부스명 이름 앞대기수 대기번호 | 대기 현황 보기 |
| Q03 | 입장 호출 | 행사명 부스명 이름 유효시간 대기번호 | — |
| R01 | 예약 확정 | 행사명 부스명 이름 일시 인원 | 예약 확인/취소 → `/t/#{token}` |
| R02 | 리마인드 | 행사명 부스명 이름 일시 | 예약 확인 |
| R03 | 취소 확인 | 행사명 부스명 이름 일시 | — |

SMS 대체 문안은 `templates.sms_fallback_text` 에 들어 있음.
