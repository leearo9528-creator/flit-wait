-- 프로덕션 미적용 (2026-11-10 작성) — 적용 전에는 VITE_DEFER 를 켜지 말 것
-- 순서 미루기 — 대기 중이거나 호출된 손님이 스스로 몇 팀 뒤로 물러난다 (두 부스가 겹쳤을 때, 아직 못 갈 때).
-- 대기 순서의 정본은 (created_at, ticket_no) 라서, 순서를 바꾸는 대신 created_at 을 '내 뒤 N번째 팀 바로 뒤'로 옮긴다.
--   → ahead_count · call_next · 스태프 화면 정렬을 건드리지 않아도 된다. 원래 접수 시각은 joined_at 에 남긴다.
-- 부스 설정: defer_teams(몇 팀 뒤로, 기본 3) · defer_max(표 하나당 몇 번까지, 기본 2 · 0 이면 끔)

alter table tickets add column if not exists defer_count int not null default 0;
alter table tickets add column if not exists joined_at timestamptz;   -- 처음 접수한 시각 (미룬 적 있는 표만)

create or replace function defer_ticket(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tickets; b booths; n int; mx int; tgt timestamptz; moved int;
begin
  select * into t from tickets where token = p_token for update;
  if not found then raise exception '대기표를 찾을 수 없습니다.'; end if;
  if t.slot_id is not null then raise exception '회차 예약은 순서를 미룰 수 없어요.'; end if;
  if t.status not in ('waiting','called') then raise exception '지금은 순서를 미룰 수 없어요.'; end if;
  select * into b from booths where id = t.booth_id;
  n  := greatest(1, coalesce((b.settings->>'defer_teams')::int, 3));
  mx := coalesce((b.settings->>'defer_max')::int, 2);
  if mx <= 0 then raise exception '이 부스는 순서를 미룰 수 없어요.'; end if;
  if t.defer_count >= mx then raise exception '순서는 %번까지만 미룰 수 있어요.', mx; end if;

  -- 내 뒤에서 기다리는 팀 중 n번째 (모자라면 맨 뒤 팀). 호출된 표는 기다리는 팀 전부가 내 뒤다.
  select count(*), max(x.created_at) into moved, tgt from (
    select a.created_at from tickets a
    where a.booth_id = t.booth_id and a.slot_id is null and a.ticket_date = t.ticket_date and a.status = 'waiting' and a.id <> t.id
      and (t.status = 'called' or (a.created_at, a.ticket_no) > (t.created_at, t.ticket_no))
    order by a.created_at, a.ticket_no limit n) x;
  if moved = 0 then raise exception '뒤에 기다리는 팀이 없어요.'; end if;

  update tickets set created_at = tgt + interval '1 millisecond', joined_at = coalesce(joined_at, t.created_at),
    status = 'waiting', called_at = null, notified_ahead = false, defer_count = defer_count + 1
  where id = t.id;
  update notifications set status = 'skipped' where ticket_id = t.id and status = 'pending';
  return jsonb_build_object('ok', true, 'moved', moved, 'ahead', ahead_count(t.id), 'left', mx - t.defer_count - 1);
end $$;
revoke execute on function defer_ticket(text) from public;
grant execute on function defer_ticket(text) to anon, authenticated;
