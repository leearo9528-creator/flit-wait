# DB — 플릿 프로젝트의 `wait` 스키마 (2026-11-24 이사)

웨이팅은 별도 Supabase 프로젝트(`mqrafomyngxsixakbnzu`)를 쓰다가 **플릿 프로젝트(`mdabugkjkmtpzlpmdlqc`)의 `wait` 스키마**로 옮겼다.
같은 프로젝트에 `public`(회원 profiles) · `app`(셀러 앱) · `home`(홈 견적 문의)이 같이 있다.

- 클라이언트(`src/lib/supabase.ts`)의 기본 스키마가 `wait` 이다 — `supabase.from(...)`·`rpc(...)` 는 그대로 쓴다. Realtime 구독의 `schema` 는 `DB_SCHEMA`
- `api/*.ts` 는 RPC 를 직접 부르므로 `Content-Profile: wait` 헤더를 보낸다. 새 API 를 만들 때 빼먹으면 404 가 난다
- 엣지 함수 3개(`admin-login`·`notify`·`order-notify`)도 `{ db: { schema: 'wait' } }`
- 새 테이블·함수는 `wait.` 을 붙여 만들고, 함수의 `search_path` 는 `wait`(확장 함수를 쓰면 `wait, extensions`)
- 대시보드 Data API 설정의 Exposed schemas 에 `wait` 이 있어야 한다

## ⚠️ `migrations/` 는 실제 DB 와 다르다

이 폴더의 파일만 순서대로 돌리면 테이블 27개가 나오는데 실제는 37개였다(대시보드·MCP 로 직접 적용한 것이 빠져 있다).
이사는 **실제 DB 에서 구조를 뽑아** 했다. 여기 파일은 이력으로만 보고, 파일 안의 `public.` 은 지금의 `wait.` 이다.

## 같이 옮긴 것

- 1분 주기 작업 6개(pg_cron): 스케줄러 2 · 알림 발송 호출 2 · 매일 재오픈 · 주문 정리
- 볼트 값 `project_url`, `cron_secret`(새로 만든 값)
- 관리자 계정은 옮기지 않았다 — 접속 코드(`admin_codes`)는 그대로라, 그 코드로 처음 로그인하면 `admin-login` 이 계정과 `admins` 행을 다시 만든다.
  이 계정(`code-…@admin.flitwait.local`)은 셀러 앱 회원(`public.profiles`)으로 잡히지 않게 `handle_new_user()` 에서 건너뛴다
- 사진은 플릿 프로젝트의 `images` 버킷을 같이 쓴다. 입점 신청(비로그인)은 `vendors/` 아래만 올릴 수 있다

## ⚠️ 엣지 함수 비밀값은 사람이 넣어야 한다

비밀값은 프로젝트를 건너 복사되지 않는다. 플릿 프로젝트의 Edge Functions > Secrets 에
`NCP_ACCESS_KEY` · `NCP_SECRET_KEY` · `NCP_ALIMTALK_SERVICE_ID` · `NCP_PLUS_FRIEND_ID` · `NCP_SMS_SERVICE_ID` · `NCP_SMS_FROM` 을 넣기 전에는
발송 함수가 **보내지 않고 보낸 것으로만 기록한다**(`DRY_RUN`, `provider_msg_id = 'DRY_RUN'`). 실제 행사 전에 반드시 넣고 테스트 행사로 한 건 보내 볼 것.
`CRON_SECRET` 을 넣으면 볼트의 `cron_secret` 도 같은 값으로 맞춰야 한다(안 넣으면 확인 없이 호출된다).
