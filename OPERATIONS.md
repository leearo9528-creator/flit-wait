# FLIT WAIT 운영 매뉴얼

행사 체험부스 대기표·사전 예약 시스템의 **서버 운영·행사 세팅·현장 대응** 가이드. 코드 구조는 `README.md` 참고.

---

## 0. 한눈에

| 구성요소 | 위치 | 역할 |
|---|---|---|
| 프론트 | Vercel `flit-wait` → `wait.flitunion.com` | 손님·스태프·관리자·현황판 화면 (정적 SPA) |
| DB / API | Supabase `flit-wait` (`mqrafomyngxsixakbnzu`, 서울) | Postgres + RPC + RLS + Realtime |
| 스케줄러 | Supabase pg_cron (매분) | 순서 임박 알림 적재 · 노쇼 처리 · 노쇼 좌석 이관 · 개인정보 파기 |
| 발송 | Supabase Edge Function `notify` (매분 cron 호출) | 알림톡 → 실패 시 SMS (네이버 클라우드 SENS) |
| 소스 | GitHub `leearo9528-creator/flit-wait` | `main` 푸시 = 자동 배포 |

비용: Vercel Hobby 무료, Supabase Free(500MB·Edge 500K 호출/월), NCP 알림톡 건당 ~8원·SMS ~9원·LMS ~27원. 행사 1회(3일, 수천 건)면 알림 비용 몇만 원.

---

## 1. 화면 주소

| 주소 | 누가 | 용도 |
|---|---|---|
| `/e/{행사slug}` | 손님 | **통합 QR** — 체험부스 전체 목록, 대기 팀 수·잔여석 |
| `/q/{부스slug}` | 손님 | 부스별 QR — 현장 대기 접수 |
| `/r/{부스slug}` | 손님 | 사전 예약 (회차 선택) |
| `/t/{토큰}` | 손님 | 내 대기/예약 상태 (알림톡 버튼 링크), 취소 |
| `/s/{부스slug}` | 스태프 | PIN 로그인 → 대기열·회차 체크인 |
| `/board/{행사slug}` | 모니터 | 안내부스 현황판 (다크, 큰 글씨, 자동 갱신) |
| `/admin` | 관리자 | 행사·부스·회차·설정·PIN·QR·통계·발송 로그 |

성남 2026: 행사 slug `seongnam-2026`, 부스 `tech-1` `tech-2` `tech-3` `cooking-tortilla` `cooking-parfait`.

---

## 2. 새 행사 세팅 (D-14 ~ D-7)

1. **관리자 로그인** `/admin` → `+ 새 행사` (행사명·slug·시작/종료). 상태는 `draft`로 시작.
2. **부스 추가** — 모드 선택:
   - `queue` 대기표만 · `slot` 예약만 · `hybrid` 예약 + 노쇼 자리 현장 대기
3. 부스마다 **설정**: 1건당 최대 인원, 호출 유효시간, 순서 임박 알림(앞 N팀), 예약 오픈 일시, 리마인드 시점, 노쇼 기준, 취소 마감, SMS 대체 여부. 사진·소개문도 여기서.
4. 예약 부스는 **회차 일괄 생성** (날짜 + 시작 시각들 + 길이 + 정원). 날짜마다 반복.
5. 부스마다 **PIN 설정** (숫자 4~6자리). 스태프에게 알려줄 번호.
6. **QR PNG 저장** → 사인물 제작 (통합 1장 + 부스별 1장 권장). 현황판 링크는 안내부스 모니터에.
7. 행사 설정 탭에서 **개인정보 동의 문구·보존기간** 확인, 행사 대표 이미지 업로드.
8. 사전 예약 오픈 전날 상태를 **`open`** 으로 변경 (open 이어야 손님 접수·예약이 됨).

> 관리자 로그인은 **접속 코드**. 전체 관리자 코드는 `admin_codes` 테이블(초기 `FLIT-OWNER-2026`), 행사 담당자 코드는 관리자 > 행사 > **접속 코드** 탭에서 발급·비활성화. 이메일 계정 안 만들어도 됨.

---

## 3. 알림톡 세팅 (처음 한 번)

1. 네이버 클라우드 콘솔 > Simple & Easy Notification Service(SENS) > **Biz Message** 프로젝트 생성 → 카카오 채널(@플릿) 연동(채널 관리자 폰 인증). SMS 프로젝트도 만들고 **발신번호 등록**(사업자 서류).
2. Biz Message > 템플릿 등록 6종 — 본문은 `templates.alimtalk_content` 그대로, 버튼은 `button_name`(웹링크, `https://wait.flitunion.com/t/#{token}`). 변수는 `#{행사명} #{부스명} #{이름} #{대기번호} #{앞대기수} #{유효시간} #{일시} #{인원} #{장소}`. 검수 1~3 영업일.
3. 승인되면 Supabase SQL: `update templates set ncp_template_code='Q01' where code='Q01';` (NCP 에 등록한 템플릿 코드, 6개). ⚠️ NCP 는 **치환된 본문을 함께 보내고 승인 본문과 글자 단위로 대조**하므로, 콘솔에서 템플릿 문구를 고치면 `alimtalk_content` 도 똑같이 바꿔야 함.
4. Edge Function secrets (대시보드 > Edge Functions > notify > Secrets):
   ```
   CRON_SECRET               Vault 'cron_secret' 와 동일
   PUBLIC_BASE_URL           https://wait.flitunion.com
   NCP_ACCESS_KEY / NCP_SECRET_KEY   NCP 콘솔 > 마이페이지 > 인증키 관리
   NCP_ALIMTALK_SERVICE_ID   SENS > Biz Message 서비스 ID
   NCP_PLUS_FRIEND_ID        카카오 채널 ID (@플릿)
   NCP_SMS_SERVICE_ID        SENS > SMS 서비스 ID
   NCP_SMS_FROM              SENS 에 등록한 발신번호 (숫자만)
   NOTIFY_DRY_RUN            테스트 중엔 1, 실발송 때 삭제
   ```
5. **동작 규칙**: `ncp_template_code` 없으면 SMS 로, `NCP_ACCESS_KEY` 없거나 `NOTIFY_DRY_RUN=1` 이면 발송 안 하고 `sent(DRY_RUN)` 처리.
6. 테스트: 내 번호로 `/q/...` 접수 → 1분 내 알림톡 수신 확인 → 관리자 > 발송 로그에서 `sent`.

---

## 4. 현장 운영 (D-day)

### 아침
- 스태프 폰/태블릿에 `/s/{slug}` 열고 PIN 입력 (세션은 로그아웃 전까지 유지). 홈 화면에 추가해두면 편함.
- 안내부스 모니터에 `/board/{slug}` 전체화면 (F11). 절전 끄기.
- 관리자 > 부스 카드에서 대기 숫자가 0인지, 어제 티켓이 남아 있지 않은지 확인 (대기번호는 날짜별로 자동 리셋).

### 스태프 조작
- **다음 호출** 버튼 하나로 맨 앞 팀 호출 → 손님 폰에 알림톡 + 화면 진동/소리.
- 호출된 팀: **입장** / **노쇼** / **재호출**(알림톡 재발송). 유효시간(기본 5분) 지나면 자동 노쇼.
- 폰 없는 손님: **대리 접수** (이름/특징만, 알림 없음) → 번호 불러서 입장.
- 예약 부스: 회차 탭에서 **체크인**. 시작 후 N분(기본 10) 미도착은 자동 노쇼 → 빈 자리는 **현장 대기 1순위에게 자동 이관·호출**.
- 재료 소진·우천 등: **접수 일시중단** (손님 화면에 즉시 표시). 관리자 행사 설정 > 공지 문구로 전체 안내 가능.

### 자주 생기는 상황
| 상황 | 대응 |
|---|---|
| 손님이 알림톡을 못 받음 | `/t/{토큰}` 화면이 자동 갱신되니 화면으로 확인시킴. 재호출 버튼으로 재발송. 번호 입력 오류면 노쇼 처리 후 재접수 |
| 스태프 폰 배터리/통신 끊김 | 다른 폰에서 같은 PIN으로 로그인하면 됨 (여러 기기 동시 가능). 데이터는 전부 서버 |
| 번호를 잘못 눌러 노쇼 처리 | 회차 탭은 **복구**, 대기열은 노쇼 카드가 사라지므로 관리자 DB에서 `status='waiting'` 으로 되돌림 |
| 한 번호로 여러 부스 대기 | 기본 허용 (부스당 1건). 같은 부스 중복은 차단 |
| 접수 폭주 | DB 함수 트랜잭션으로 정원·순번 보장. 화면 폴링 5~12초라 숫자가 몇 초 늦을 수 있음 |
| 전체 중단 필요 | 관리자 > 행사 설정 > 상태 `closed` (접수·예약 모두 막힘, 기존 티켓 조회는 됨) |

### 저녁
- 통계 탭에서 당일 숫자 확인. CSV 는 행사 끝나고 한 번에.

---

## 5. 행사 후

1. 관리자 > 통계 > **CSV 내보내기** (결과 보고용: 접수·체험 인원·노쇼율·평균 대기).
2. 행사 상태 `closed`.
3. 개인정보는 보존기간(기본 종료 후 7일) 지나면 cron 이 자동 파기(이름 `삭제됨`, 전화 NULL). 즉시 지우려면 행사 설정 > **개인정보 즉시 파기**.
4. 다음 행사는 2절부터 반복. 템플릿·채널·Edge Function 은 재사용.

---

## 6. 모니터링·장애

- **발송 실패**: 관리자 > 발송 로그 `failed` + 오류 메시지 (템플릿 본문 불일치·버튼 불일치·번호 오류가 대부분). NCP 콘솔 > SENS > 발송 결과에서 상세 코드 확인.
- **cron 동작 확인** (Supabase SQL):
  ```sql
  select jobname, schedule, active from cron.job;
  select * from cron.job_run_details order by start_time desc limit 10;
  select * from net._http_response order by created desc limit 5;  -- notify 호출 응답
  ```
- **Edge Function 로그**: 대시보드 > Edge Functions > notify > Logs.
- **수동 스케줄러 실행**: `select run_scheduler();` / 수동 발송: `curl -H "x-cron-secret: ..." https://mqrafomyngxsixakbnzu.supabase.co/functions/v1/notify`
- **Supabase Free 일시정지**: 7일간 요청 없으면 프로젝트가 멈춤. 행사 전주에 대시보드 한 번 열기.
- **Vercel 배포 실패**: Vercel > Deployments 로그. 롤백은 이전 배포 `Promote to Production`.

### 6-1. 용량 플랜 (동시접속 3,000명 기준 · 행사 주간만 유료)

부하가 어디로 가는지 먼저:

| 화면 | DB 부하 | 비고 |
|---|---|---|
| 체험부스 목록 · 부스 페이지 · 현황판 | **접속자 수와 무관** (Vercel 엣지 3초 캐시 → 부스당 ~0.3 qps) | 1만 명이어도 동일 |
| 예약 오픈 순간 | 회차별 행 락으로 순차 처리, 쿼리 1ms대 | 좌석 초과 불가 |
| 내 대기표 화면 (`/t/…`) | **사람마다 개별 폴링** — 유일하게 접속자에 비례 | 순서 멀면 30s, 임박 6s, 예약·종료 티켓 30~60s |
| 스태프 · 현황판 Realtime | 부스당 1~2 연결 | 손님은 Realtime 안 씀 |

최악 가정(대기표 화면 3,000명 동시, 평균 폴링 15s) → **약 200 qps**. 쿼리는 인덱스 1건 조회라 Small 컴퓨트에서 수천 qps 여유.

**D-7 (10/16) 에 켤 것 — 둘 다 월 단위 과금이라 행사 끝나고 바로 내리면 1개월치만**

1. **Supabase Pro** ($25/월) — 대시보드 > Settings > Billing > Pro
   - 7일 미사용 일시정지 사라짐, 일일 백업, 대역폭 250GB
2. **Compute: Micro → Small** (+$15/월) — Settings > Compute and Disk
   - 커넥션 풀 늘어남(동시 쿼리 여유). **적용 시 재시작 1~2분** — 반드시 행사 전날 이전에
3. **Vercel**: Hobby 그대로 OK (엣지 함수 월 100만 호출, 대역폭 100GB). 불안하면 Pro($20) — 선택
4. **NCP SENS**: 선불·종량(알림톡 ~8원, SMS ~9원, LMS ~27원). 예상 발송 3일 × 1,500건 ≈ 4,500건 → 알림톡 기준 4만 원 미만. 잔액 알림 설정해두기

**D-4 (10/19) 리허설 때 확인**
- GitHub Actions `loadtest` 워크플로를 `vus=1000, duration=3m` 으로 실행 (레포 Secrets `SUPABASE_ANON_KEY` 필요)
- 통과 기준: p95 < 500ms, 오류율 < 0.5%. Supabase 대시보드 > Reports > Database 에서 CPU 60% 미만
- 실패 시 ① Compute Medium으로 한 단계 더 ② 대기표 폴링 간격 상향(`MyTicket.tsx` base 값)

**행사 당일 장애 시 플랜 B**: 스태프 화면이 안 열리면 종이 번호표 + 육성 호출로 전환, DB 복구 후 `staff_add_walkin` 로 대리 접수. 손님 화면이 안 열려도 알림톡은 cron이 독립적으로 보낸다.

**행사 후 (10/26~)**: Compute Micro로, Pro → Free 다운그레이드 (Settings > Billing). 다운그레이드 전 `admin_purge_event` 로 개인정보 삭제.

---

## 7. 배포·코드 변경

```bash
git clone https://github.com/leearo9528-creator/flit-wait && cd flit-wait
cp .env.example .env   # 값은 README
npm i && npm run dev   # http://localhost:5173
# 수정 → npm run build 통과 확인 → git push origin main → Vercel 자동 배포 (약 1분)
```
- DB 변경은 `supabase/migrations/NNNN_*.sql` 에 파일로 남기고 Supabase SQL Editor(또는 MCP) 로 적용. 로컬 파일이 정본.
- Edge Function 수정은 `supabase/functions/notify/index.ts` → 대시보드 또는 `supabase functions deploy notify`.
- 새 알림 종류 추가: `templates` 행 추가 → `enqueue_notification(ticket, 'CODE')` 호출 지점 추가 → notify 의 변수 매핑 확인.

---

## 8. 납품(다른 주최 측) 체크리스트

- [ ] 행사 생성 + 담당자 `manager` 등록 (자기 행사만 보임)
- [ ] 부스·회차·PIN·QR
- [ ] 발신 채널: 플릿 채널로 보낼지, 주최 측 채널(별도 pfId·템플릿 검수)로 보낼지 결정
- [ ] 개인정보 동의 문구에 주최 측 명칭 반영
- [ ] 현황판 모니터·LTE 라우터 등 장비
- [ ] 비용: 알림 건당 실비 + 운영비
