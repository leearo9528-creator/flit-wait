# FLIT WAIT — 체험부스 대기표·사전 예약 시스템

행사 체험부스의 **현장 대기표(queue)** 와 **사전 시간 예약(slot)** 을 한 시스템으로 처리하고, 카카오 알림톡(실패 시 SMS)으로 손님에게 순서·예약을 알리는 모바일 웹.
첫 적용: 2026 성남테크아트페스티벌 탄천마켓 (10/23~25). 이후 행사 주최 측 납품용.

- 프론트: React + Vite + Tailwind → Vercel (`wait.flitunion.com`)
- 백엔드: Supabase 프로젝트 `flit-wait` (`mqrafomyngxsixakbnzu`, 서울) — Postgres RPC + RLS + Realtime + Edge Function + pg_cron
- 발송: 솔라피 (Edge Function `notify`)

## 라우트

| 경로 | 대상 | 설명 |
|---|---|---|
| `/q/:slug` | 손님 | 대기표 접수 (QR) |
| `/r/:slug` | 손님 | 회차 사전 예약 |
| `/t/:token` | 손님 | 내 대기/예약 상태 (알림톡 버튼 링크), 취소 |
| `/s/:slug` | 스태프 | PIN 로그인 → `/s/:slug/board` 대기열·회차 체크인 |
| `/admin` | 관리자 | **접속 코드** 로그인 (admin_codes · Edge Function admin-login), 행사·부스·회차·설정·PIN·QR·통계·코드 발급·발송 로그 |

## 구조

```
events → booths(mode: queue | slot | hybrid, settings jsonb) → slots
tickets(slot_id null = 대기표, 있으면 예약)   notifications(발송 큐+로그)   templates(알림톡 템플릿 매핑)
```

- 손님·스태프는 테이블을 직접 읽지 않고 **SECURITY DEFINER RPC** 만 호출 (`join_queue`, `reserve_slot`, `get_ticket`, `cancel_ticket`, `staff_login`, `staff_board`, `staff_update_ticket`, `staff_add_walkin`, `staff_toggle_pause`)
- 실시간 갱신: `booth_versions` 공개 테이블을 트리거로 bump → 클라이언트가 구독 후 RPC 재조회 (+ 폴링 fallback)
- 스케줄러 `run_scheduler()` (pg_cron 매분): 순서 임박 알림(Q02) 적재, 호출 후 유효시간 경과 노쇼, 회차 시작 N분 후 미체크인 노쇼, 보존기간 경과 개인정보 파기
- Edge Function `notify` (pg_cron 매분 호출): `notifications.pending` → 솔라피 발송. 템플릿 ID 없으면 SMS, `SOLAPI_API_KEY` 없으면 dry-run

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

-- 쿠킹 회차: 10/24(토)·10/25(일) 11:00 13:00 14:30 16:00 17:30, 60분, 8명
insert into slots(booth_id, starts_at, ends_at, capacity)
select b.id, (d + tm) at time zone 'Asia/Seoul', ((d + tm) at time zone 'Asia/Seoul') + interval '60 minutes', 8
from booths b
cross join unnest(array['2026-10-24','2026-10-25']::date[]) d
cross join unnest(array['11:00','13:00','14:30','16:00','17:30']::time[]) tm
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
