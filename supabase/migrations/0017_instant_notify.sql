-- 2026-10-13 프로덕션 적용 완료 (kick_notify_on_call, kick_notify_on_enqueue)
-- 알림이 크론(매분)만 기다려 최대 60초 지연 → 알림 생성 즉시 notify Edge Function 을 pg_net 으로 깨운다.
-- 실측: 호출 알림 51초 → 0.5초. 크론은 예약 발송(리마인드·Q02)·재시도·누락 백업으로 유지.
-- 폭주 대비 2초 디바운스(notify_kicks 단일 행). notify 는 pending→sending 원자 선점이라 크론과 겹쳐도 이중 발송 없음.
create table if not exists notify_kicks (id int primary key, at timestamptz not null default '2000-01-01');
insert into notify_kicks(id) values (1) on conflict do nothing;
alter table notify_kicks enable row level security;

create or replace function public.kick_notify() returns void
language plpgsql security definer set search_path = public as $$
declare hit int;
begin
  update notify_kicks set at = now() where id = 1 and at < now() - interval '2 seconds';
  get diagnostics hit = row_count;
  if hit = 0 then return; end if;
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 15000);
exception when others then null;
end $$;
revoke execute on function public.kick_notify() from anon, authenticated, public;

create or replace function public.enqueue_notification(p_ticket uuid, p_code text, p_at timestamptz default now()) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(ticket_id, template_code, scheduled_at)
  select p_ticket, p_code, p_at where exists (select 1 from tickets where id = p_ticket and phone is not null);
  if found and p_at <= now() then perform kick_notify(); end if;
end $$;
-- staff_update_ticket: call/recall 뒤 kick_notify() 호출 추가 (0014 본문 참조)
