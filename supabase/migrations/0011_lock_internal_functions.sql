-- 2026-10-08 보안 점검 (Supabase 적용 완료)
-- 1) 내부 전용 SECURITY DEFINER 함수를 PostgREST(anon/authenticated)에서 호출 불가로. 특히 enqueue_notification 이 열려 있어
--    외부에서 임의 티켓에 알림톡을 무한 발송(과금)시킬 수 있었다. cron(postgres)·service_role·다른 함수 내부 호출은 그대로 동작.
revoke execute on function public.enqueue_notification(uuid, text, timestamptz) from anon, authenticated, public;
revoke execute on function public.transfer_freed_seats(uuid) from anon, authenticated, public;
revoke execute on function public.run_scheduler() from anon, authenticated, public;
revoke execute on function public.recover_stuck_notifications() from anon, authenticated, public;
revoke execute on function public.bump_booth_version() from anon, authenticated, public;
revoke execute on function public.assert_staff(uuid, text) from anon, authenticated, public;
revoke execute on function public.gen_admin_code(text) from anon, authenticated, public;
revoke execute on function public.booth_avg_service_min(uuid) from anon, authenticated, public;
revoke execute on function public.staff_board(uuid, text) from anon, authenticated, public;
revoke execute on function public.ahead_count(uuid) from anon, authenticated, public;
grant execute on function public.ahead_count(uuid) to service_role; -- notify Edge Function 이 사용
alter function public.kst_today() set search_path = public;
alter function public.normalize_phone(text) set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.gen_admin_code(text) set search_path = public, extensions;
-- 2) 대기 순서 정본 = (created_at, ticket_no) — ahead_count / call_next / staff_board queue 정렬에 ticket_no 타이브레이크 추가
--    (같은 ms 접수 시 호출 순서가 뒤바뀔 수 있던 이론적 구멍 제거)
