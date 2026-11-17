# 상태 머신 지도

"상태"를 다루는 화면·함수를 고치기 전에 읽는다. **조건을 화면에서 손으로 다시 쓰지 말고 정본 파일의 함수를 쓸 것.**
전이를 실제로 막는 곳은 전부 DB 함수다 — 화면 쪽 파일은 같은 규칙을 읽기 위한 사본이라, DB 함수를 바꾸면 사본과 `src/lib/demo.ts`(데모용 가짜 서버)도 같이 고친다.

⚠️ `staff_update_ticket` 등 일부 함수는 저장소 마이그레이션(0023 · 0025)에 본문 전체가 없다 ("Supabase 적용본 참조").
최신 본문은 프로덕션에서 `select pg_get_functiondef(oid) from pg_proc where proname = '…'` 로 확인한다.

| 상태 머신 | 상태 | 화면 사본 | 정본 (DB) |
|---|---|---|---|
| 대기표·예약 | `waiting` · `called` · `checked_in` · `done` · `no_show` · `cancelled` | `src/lib/ticketState.ts` | `join_queue` · `reserve_slot` · `cancel_ticket` · `defer_ticket` · `staff_update_ticket` · `run_scheduler` |
| 주문 | `placed` · `accepted` · `ready` · `picked_up` · `cancelled` | `src/lib/orders.ts` (`vendorActions`) | `place_order` · `cancel_order` · `vendor_update_order` · 트리거 `orders_notify` |
| 부스 접수 | 접수 중 · 오픈 예정 · 오늘 접수 마감 · 일시 중단 · 오늘 마감 · 매진 · 운영 종료 | `src/components/BoothCard.tsx` (`boothStatus` · `queueWindowState` · `openAtFor`) | `queue_window_state` · `join_queue` · `reserve_slot` · `staff_set_open` · `staff_toggle_pause` · `staff_cancel_open` |
| 가게 주문 받기 | 꺼짐 · 받는 중 · 잠시 멈춤 | `GuidePlace.order_open` / `order_paused` | `order_settings.enabled` / `paused` (`admin_order_settings` · `vendor_set_paused`) |
| 행사 | `draft` · `open` · `closed` | — | `events.status` (관리자가 직접 바꾼다. 날짜로 자동 전환되지 않는다) |
| 럭키드로우 | `draft` · `open` · `closed` · `drawn` (+ `draw_at` 지나면 응모 마감) | `LuckyDraw.tsx` 의 `closed` | `enter_draw` · 추첨 함수 |
| 셀러 등록 | `pending` · `approved` · `rejected` | — | `vendor_submissions.status` |
| 알림 큐 | `pending` · `sent` · `failed` · `skipped` | — | `notifications` (`enqueue_notification` · Edge Function `notify`) |
| 손님 로그인 | 확인 중 · 비로그인 · 로그인(프로필 없음) · 로그인 | `src/lib/customer.ts` (`ready` · `loggedIn` · `profile`) | Supabase Auth · `my_profile` |

## 대기표·예약

```
waiting ──호출──▶ called ──입장──▶ checked_in ──▶ done
   │                 │──유효시간(call_valid_min) 지남 · 노쇼──▶ no_show
   │──손님 취소──▶ cancelled
   │──회차 시작 noshow_after_start_min 분 뒤(스케줄러)──▶ no_show
no_show · cancelled ──복구──▶ waiting (원래 접수 시각 → 대기 맨 앞)   ·   ──지금 입장──▶ checked_in
checked_in · done ──되돌리기──▶ called (호출됐던 대기표, 유효시간 새로) | waiting
```

| 누가 | 동작 | 되는 상태 |
|---|---|---|
| 손님 | 취소 `cancel_ticket` | 서버는 `waiting` · `called`, **화면 버튼(`can_cancel`)은 `waiting` 만**. 회차는 시작 `cancel_until_before_min` 분 전까지 |
| 손님 | 순서 미루기 `defer_ticket` | 대기표 `waiting` 만, `defer_max` 번까지 |
| 스태프 | `call` · `call_next` | `waiting` |
| 스태프 | `recall` | `called` |
| 스태프 | `checkin` | 어느 상태든 (이미 입장이면 그대로 성공). 회차의 노쇼·취소 손님은 정원 확인 |
| 스태프 | `noshow` | `waiting` · `called` |
| 스태프 | `restore` | 어느 상태든. 회차의 노쇼·취소 손님은 정원 확인 |
| 스케줄러 | 자동 노쇼 | `called` 유효시간 지남 · 회차 `waiting` 시작 뒤 |

- 회차 자리를 차지하는 표 = `ticketHoldsSeat` (waiting · called · checked_in · done). 정원 계산은 서버·스태프 화면·관리자 통계가 같은 집합을 쓴다.
- `checked_in` 과 `done` 은 화면에서 같은 뜻이다 (`ticketEntered`). `done` 으로 바꾸는 버튼은 지금 없다.

## 주문

```
placed ──접수──▶ accepted ──준비 완료──▶ ready ──전달 완료──▶ picked_up
  │──손님 취소(접수 전까지)──▶ cancelled('손님 취소')
placed · accepted · ready ──가게 취소(이유)──▶ cancelled
되돌리기: ready → accepted · picked_up → ready · cancelled → accepted(접수했던 주문) | placed
```

- **손님이 취소한 주문은 가게가 되돌릴 수 없다** (0049). 화면은 버튼을 숨기고 서버는 거절한다.
- 알림: 주문 넣음 → O01 · `placed`/`accepted` → `ready` → O02 · 가게 취소 → O03. 전달 완료를 되돌려 `ready` 가 될 때는 O02 를 다시 보내지 않는다 (0049).
  가게 취소를 되돌릴 때 손님에게 가는 알림은 없다 (템플릿 없음) — 손님 주문 화면만 바뀐다.
- 매출·통계는 `picked_up` 기준.
- ⚠️ 결제(2단계)를 붙일 때: `pay_status`(unpaid · paid · refunded)는 지금 칸만 있고 전이가 없다. 앱결제 주문의 취소·되돌리기는 환불과 묶어야 한다 — `cancel`/`back` 을 그대로 두면 결제된 채 취소된 주문이 생긴다.

## 일부러 그대로 둔 것

- **부스 접수 상태**: `boothStatus`(손님 목록·상세) · `QueueJoin` · `Reserve` · `StaffBoard` 가 같은 재료(`is_paused` · `pause_mode` · 시간대 · `open_override_date` · 행사 상태)를 각자 조합한다. 행사 현장에서 여러 번 맞춘 흐름이라 합치지 않았다. 규칙을 바꿀 때는 네 곳 + 서버 `queue_window_state` 를 같이 본다.
- **호출된 손님의 취소**: 서버는 받는데 화면에는 버튼이 없다 (유효시간이 지나면 노쇼로 넘어간다).
- **행사 상태**: `open` 인 동안은 시작 전·종료 뒤에도 주문(`place_order`)을 받는다. 대기 접수만 시작 시각을 본다(0029).
