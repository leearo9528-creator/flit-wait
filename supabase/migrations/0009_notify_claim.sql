-- notify 발송기 원자적 선점(pending→sending) + 5분 넘게 sending 이면 자동 복구 (Supabase 적용 완료 2026-10-08)
alter table notifications drop constraint if exists notifications_status_check;
alter table notifications add constraint notifications_status_check check (status in ('pending','sending','sent','failed','skipped'));
create or replace function public.recover_stuck_notifications() returns int
language sql security definer set search_path = public as $$
  with r as (
    update notifications set status = 'pending', sent_at = null
    where status = 'sending' and coalesce(sent_at, now() - interval '1 day') < now() - interval '5 minutes'
    returning 1
  ) select count(*)::int from r
$$;
-- run_scheduler() 시작부에 recovered := recover_stuck_notifications(); 추가 (본문은 0005 참고)
