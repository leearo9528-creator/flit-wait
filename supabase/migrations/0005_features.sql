-- v1.1: 노쇼 좌석 자동 이관 · 예상 대기시간 · 공용 현황판 · 스태프 다음 호출/재호출 · 관리자 통계

-- ───────────────────────── 예상 대기: 오늘 체크인 간격 평균(분)
create or replace function booth_avg_service_min(p_booth uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when count(*) >= 3
    then round(extract(epoch from (max(checked_in_at) - min(checked_in_at))) / 60.0 / (count(*) - 1), 1)
    else null end
  from tickets where booth_id = p_booth and slot_id is null and ticket_date = kst_today() and checked_in_at is not null
$$;

-- ───────────────────────── 노쇼/취소로 빈 좌석 → 현장 대기 이관
create or replace function transfer_freed_seats(p_slot uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s slots; b booths; free int; t tickets; moved int := 0;
begin
  select * into s from slots where id = p_slot for update;
  if not found or s.status <> 'open' then return 0; end if;
  select * into b from booths where id = s.booth_id;
  if b.mode <> 'hybrid' or not coalesce((b.settings->>'transfer_noshow_to_queue')::boolean, true) then return 0; end if;
  -- 회차 시작 15분 전 ~ 종료 전까지만 이관
  if now() < s.starts_at - interval '15 minutes' or now() >= s.ends_at then return 0; end if;
  loop
    select s.capacity - coalesce(sum(party_size),0) into free from tickets where slot_id = s.id and status in ('waiting','called','checked_in','done');
    exit when free <= 0;
    select * into t from tickets
      where booth_id = b.id and slot_id is null and ticket_date = kst_today() and status = 'waiting' and party_size <= free
      order by created_at limit 1 for update skip locked;
    exit when not found;
    update tickets set slot_id = s.id, status = 'called', called_at = now(), source = 'transfer' where id = t.id;
    update notifications set status = 'skipped' where ticket_id = t.id and template_code = 'Q02' and status = 'pending';
    perform enqueue_notification(t.id, 'Q03');
    moved := moved + 1;
  end loop;
  return moved;
end $$;

-- 스태프 액션 확장: call_next · recall · 노쇼/취소 시 이관
create or replace function staff_update_ticket(p_booth uuid, p_token text, p_ticket uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b booths; t tickets; moved int := 0;
begin
  b := assert_staff(p_booth, p_token);
  if p_action = 'call_next' then
    select * into t from tickets where booth_id = b.id and slot_id is null and ticket_date = kst_today() and status = 'waiting' order by created_at limit 1 for update skip locked;
    if not found then return jsonb_build_object('ok', false, 'message', '대기 중인 팀이 없습니다.'); end if;
    p_action := 'call';
  else
    select * into t from tickets where id = p_ticket and booth_id = b.id for update;
    if not found then raise exception '티켓을 찾을 수 없습니다.'; end if;
  end if;
  case p_action
    when 'call' then
      update tickets set status = 'called', called_at = now() where id = t.id;
      update notifications set status='skipped' where ticket_id = t.id and template_code = 'Q02' and status='pending';
      perform enqueue_notification(t.id, 'Q03');
    when 'recall' then
      if t.status <> 'called' then raise exception '호출 상태에서만 재호출할 수 있습니다.'; end if;
      update tickets set called_at = now() where id = t.id;
      perform enqueue_notification(t.id, 'Q03');
    when 'checkin' then
      update tickets set status = 'checked_in', checked_in_at = now() where id = t.id;
      update notifications set status='skipped' where ticket_id = t.id and status='pending';
    when 'done' then
      update tickets set status = 'done' where id = t.id;
    when 'noshow' then
      update tickets set status = 'no_show' where id = t.id;
      update notifications set status='skipped' where ticket_id = t.id and status='pending';
      if t.slot_id is not null then moved := transfer_freed_seats(t.slot_id); end if;
    when 'restore' then
      update tickets set status = 'waiting', called_at = null where id = t.id;
    else raise exception '알 수 없는 동작: %', p_action;
  end case;
  insert into audit_logs(actor, action, target_type, target_id) values ('staff:'||b.slug, p_action, 'ticket', t.id);
  return jsonb_build_object('ok', true, 'ticket_no', t.ticket_no, 'name', t.name, 'transferred', moved);
end $$;

-- 손님 취소 시에도 이관
create or replace function cancel_ticket(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tickets;
begin
  select * into t from tickets where token = p_token for update;
  if not found then raise exception '티켓을 찾을 수 없습니다.'; end if;
  if t.status not in ('waiting','called') then raise exception '취소할 수 없는 상태입니다.'; end if;
  update tickets set status = 'cancelled' where id = t.id;
  update notifications set status = 'skipped' where ticket_id = t.id and status = 'pending';
  if t.slot_id is not null then
    perform enqueue_notification(t.id, 'R03');
    perform transfer_freed_seats(t.slot_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 스케줄러: 회차 노쇼 처리 후 이관
create or replace function run_scheduler() returns jsonb
language plpgsql security definer set search_path = public as $$
declare q02 int := 0; ns1 int := 0; ns2 int := 0; purged int := 0; moved int := 0; r record;
begin
  with cand as (
    select t.id from tickets t join booths b on b.id = t.booth_id
    where t.slot_id is null and t.status = 'waiting' and t.notified_ahead = false and t.phone is not null
      and t.ticket_date = kst_today()
      and ahead_count(t.id) <= coalesce((b.settings->>'notify_ahead_teams')::int, 2)
  ), upd as (update tickets set notified_ahead = true where id in (select id from cand) returning id)
  insert into notifications(ticket_id, template_code) select id, 'Q02' from upd;
  get diagnostics q02 = row_count;

  with upd as (
    update tickets t set status = 'no_show'
    from booths b where b.id = t.booth_id and t.status = 'called' and t.slot_id is null
      and t.called_at < now() - make_interval(mins => coalesce((b.settings->>'call_valid_min')::int, 5))
    returning t.id
  ) select count(*) into ns1 from upd;

  for r in
    update tickets t set status = 'no_show'
    from slots s, booths b where s.id = t.slot_id and b.id = t.booth_id and t.status = 'waiting'
      and s.starts_at < now() - make_interval(mins => coalesce((b.settings->>'noshow_after_start_min')::int, 10))
    returning t.slot_id
  loop
    ns2 := ns2 + 1;
    moved := moved + transfer_freed_seats(r.slot_id);
  end loop;

  -- 이관 대기자가 있는 hybrid 부스: 시작 임박 회차에 빈 자리가 있으면 이관 (취소분 등)
  for r in
    select s.id from slots s join booths b on b.id = s.booth_id
    where b.mode = 'hybrid' and s.status = 'open' and now() between s.starts_at - interval '15 minutes' and s.ends_at
  loop
    moved := moved + transfer_freed_seats(r.id);
  end loop;

  with ev as (select id from events where ends_at + make_interval(days => data_retention_days) < now()),
  u as (update tickets set name='삭제됨', phone=null, phone_hash=null where event_id in (select id from ev) and phone is not null returning id)
  select count(*) into purged from u;

  return jsonb_build_object('q02', q02, 'noshow_called', ns1, 'noshow_slot', ns2, 'transferred', moved, 'purged', purged);
end $$;

-- ───────────────────────── 손님 티켓: 예상 대기 추가
create or replace function get_ticket(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'party_size', t.party_size, 'ticket_no', t.ticket_no, 'status', t.status,
    'called_at', t.called_at, 'created_at', t.created_at, 'phone_tail', right(t.phone, 4), 'source', t.source,
    'ahead', case when t.slot_id is null then ahead_count(t.id) else null end,
    'est_wait_min', case when t.slot_id is null and t.status = 'waiting' then round(ahead_count(t.id) * booth_avg_service_min(t.booth_id)) else null end,
    'booth', jsonb_build_object('name', b.name, 'slug', b.slug, 'mode', b.mode, 'location', b.location, 'is_paused', b.is_paused, 'settings', b.settings),
    'event', jsonb_build_object('name', e.name, 'slug', e.slug, 'notice', e.notice),
    'slot', case when s.id is null then null else jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status) end,
    'can_cancel', t.status in ('waiting') and (s.id is null or now() < s.starts_at - make_interval(mins => coalesce((b.settings->>'cancel_until_before_min')::int,120)))
  )
  from tickets t join booths b on b.id = t.booth_id join events e on e.id = t.event_id
  left join slots s on s.id = t.slot_id
  where t.token = p_token
$$;

-- ───────────────────────── 공용 현황판 (안내부스 모니터)
create or replace function event_board(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object('name', e.name, 'notice', e.notice, 'status', e.status),
    'now', now(),
    'booths', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'mode', b.mode, 'is_paused', b.is_paused,
        'waiting_teams', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status = 'waiting'),
        'called', (select coalesce(jsonb_agg(t.ticket_no order by t.called_at desc), '[]'::jsonb) from (select ticket_no, called_at from tickets where booth_id = b.id and slot_id is null and ticket_date = kst_today() and status = 'called' order by called_at desc limit 4) t),
        'last_in', (select max(ticket_no) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('checked_in','done')),
        'avg_service_min', booth_avg_service_min(b.id),
        'next_slot', (select jsonb_build_object('starts_at', s.starts_at, 'left', s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0))
                      from slots s where s.booth_id = b.id and s.status = 'open' and s.ends_at > now() order by s.starts_at limit 1)
      ) order by b.sort_order, b.name), '[]'::jsonb) from booths b where b.event_id = e.id)
  ) from events e where e.slug = p_slug
$$;

-- ───────────────────────── 관리자 통계
create or replace function admin_event_stats(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_admin(p_event) then null else jsonb_build_object(
    'by_booth', (select coalesce(jsonb_agg(jsonb_build_object(
        'booth_id', b.id, 'name', b.name, 'mode', b.mode,
        'total', (select count(*) from tickets t where t.booth_id = b.id and t.status <> 'cancelled'),
        'queue_total', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.status <> 'cancelled'),
        'served', (select count(*) from tickets t where t.booth_id = b.id and t.status in ('checked_in','done')),
        'no_show', (select count(*) from tickets t where t.booth_id = b.id and t.status = 'no_show'),
        'cancelled', (select count(*) from tickets t where t.booth_id = b.id and t.status = 'cancelled'),
        'reserved_seats', (select coalesce(sum(party_size),0) from tickets t where t.booth_id = b.id and t.slot_id is not null and t.status in ('waiting','called','checked_in','done')),
        'capacity', (select coalesce(sum(capacity),0) from slots s where s.booth_id = b.id and s.status <> 'cancelled'),
        'avg_wait_min', (select round(avg(extract(epoch from (checked_in_at - created_at))/60)) from tickets t where t.booth_id = b.id and t.slot_id is null and t.checked_in_at is not null),
        'people', (select coalesce(sum(party_size),0) from tickets t where t.booth_id = b.id and t.status in ('checked_in','done'))
      ) order by b.sort_order), '[]'::jsonb) from booths b where b.event_id = p_event),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'count', c) order by h), '[]'::jsonb)
                from (select to_char(created_at at time zone 'Asia/Seoul', 'MM/DD HH24시') h, count(*) c from tickets where event_id = p_event and status <> 'cancelled' group by 1) x),
    'notifications', (select jsonb_object_agg(status, c) from (select n.status, count(*) c from notifications n join tickets t on t.id = n.ticket_id where t.event_id = p_event group by 1) y)
  ) end
$$;

grant execute on function booth_avg_service_min(uuid), event_board(text) to anon, authenticated;
grant execute on function admin_event_stats(uuid) to authenticated;

-- 0007 stats_by_channel: admin_event_stats 에 'by_channel' (sent 기준 alimtalk/sms 건수) 추가 — Supabase 적용본 참조
