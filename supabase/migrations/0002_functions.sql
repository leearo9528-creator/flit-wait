-- ───────────────────────── helpers
create or replace function kst_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

create or replace function normalize_phone(p text) returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p,''), '\D', '', 'g'), '')
$$;

create or replace function enqueue_notification(p_ticket uuid, p_code text, p_at timestamptz default now())
returns void language sql security definer set search_path = public as $$
  insert into notifications(ticket_id, template_code, scheduled_at)
  select p_ticket, p_code, p_at
  where exists (select 1 from tickets where id = p_ticket and phone is not null);
$$;

-- 내 앞 대기 팀 수
create or replace function ahead_count(p_ticket uuid) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from tickets a, tickets me
  where me.id = p_ticket and a.booth_id = me.booth_id and a.slot_id is null and me.slot_id is null
    and a.ticket_date = me.ticket_date and a.status in ('waiting','called') and a.created_at < me.created_at
$$;

-- 공개 부스 요약 (손님 접수 화면 상단)
create or replace function booth_summary(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'booth', jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'mode', b.mode, 'is_paused', b.is_paused, 'settings', b.settings, 'location', b.location),
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status, 'privacy_text', e.privacy_text, 'notice', e.notice, 'starts_at', e.starts_at, 'ends_at', e.ends_at),
    'waiting_teams', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('waiting','called')),
    'slots', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'capacity', s.capacity, 'status', s.status,
                'reserved', (select coalesce(sum(party_size),0) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done'))
              ) order by s.starts_at), '[]'::jsonb)
              from slots s where s.booth_id = b.id and s.status <> 'cancelled' and s.ends_at > now() - interval '1 day')
  )
  from booths b join events e on e.id = b.event_id
  where b.slug = p_slug
$$;

-- ───────────────────────── 손님: 대기표 접수
create or replace function join_queue(p_slug text, p_name text, p_phone text, p_party int, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b booths; e events; ph text; t tickets; n int; st jsonb;
begin
  if not p_consent then raise exception '개인정보 수집·이용에 동의해 주세요.'; end if;
  select * into b from booths where slug = p_slug for update;
  if not found then raise exception '부스를 찾을 수 없습니다.'; end if;
  select * into e from events where id = b.event_id;
  if e.status <> 'open' then raise exception '현재 접수 기간이 아닙니다.'; end if;
  if b.mode = 'slot' then raise exception '이 부스는 예약제로 운영됩니다.'; end if;
  if b.is_paused then raise exception '현재 접수가 일시 중단되었습니다. 잠시 후 다시 시도해 주세요.'; end if;
  st := b.settings;
  if p_party < 1 or p_party > coalesce((st->>'max_party_size')::int, 4) then
    raise exception '인원은 1~%명까지 접수할 수 있습니다.', coalesce((st->>'max_party_size')::int, 4);
  end if;
  if now() > e.ends_at - make_interval(mins => coalesce((st->>'queue_close_before_min')::int, 30)) then
    raise exception '오늘 접수가 마감되었습니다.';
  end if;
  ph := normalize_phone(p_phone);
  if ph is null or length(ph) < 10 then raise exception '휴대폰번호를 확인해 주세요.'; end if;
  if not coalesce((st->>'allow_duplicate_phone')::boolean, false) then
    if exists (select 1 from tickets where booth_id = b.id and phone_hash = md5(ph) and ticket_date = kst_today() and status in ('waiting','called')) then
      raise exception '이미 이 부스에 대기 중인 번호입니다.';
    end if;
  end if;
  select coalesce(max(ticket_no),0)+1 into n from tickets where booth_id = b.id and ticket_date = kst_today() and slot_id is null;
  insert into tickets(event_id, booth_id, name, phone, phone_hash, party_size, ticket_no, source)
  values (b.event_id, b.id, trim(p_name), ph, md5(ph), p_party, n, 'onsite') returning * into t;
  perform enqueue_notification(t.id, 'Q01');
  return jsonb_build_object('token', t.token, 'ticket_no', t.ticket_no, 'ahead', ahead_count(t.id));
end $$;

-- ───────────────────────── 손님: 회차 예약
create or replace function reserve_slot(p_slot uuid, p_name text, p_phone text, p_party int, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s slots; b booths; e events; ph text; t tickets; used int; st jsonb; open_at timestamptz;
begin
  if not p_consent then raise exception '개인정보 수집·이용에 동의해 주세요.'; end if;
  select * into s from slots where id = p_slot for update;
  if not found or s.status <> 'open' then raise exception '예약할 수 없는 회차입니다.'; end if;
  select * into b from booths where id = s.booth_id;
  select * into e from events where id = b.event_id;
  st := b.settings;
  if e.status <> 'open' then raise exception '현재 예약 기간이 아닙니다.'; end if;
  open_at := nullif(st->>'reserve_open_at','')::timestamptz;
  if open_at is not null and now() < open_at then
    raise exception '예약은 % 부터 가능합니다.', to_char(open_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI');
  end if;
  if now() > s.starts_at - make_interval(mins => coalesce((st->>'reserve_close_before_min')::int, 60)) then
    raise exception '이 회차의 사전 예약이 마감되었습니다. 현장 대기를 이용해 주세요.';
  end if;
  if p_party < 1 or p_party > coalesce((st->>'max_party_size')::int, 4) then
    raise exception '인원은 1~%명까지 예약할 수 있습니다.', coalesce((st->>'max_party_size')::int, 4);
  end if;
  select coalesce(sum(party_size),0) into used from tickets where slot_id = s.id and status in ('waiting','called','checked_in','done');
  if used + p_party > s.capacity then raise exception '잔여석이 부족합니다. (남은 자리 %석)', s.capacity - used; end if;
  ph := normalize_phone(p_phone);
  if ph is null or length(ph) < 10 then raise exception '휴대폰번호를 확인해 주세요.'; end if;
  if not coalesce((st->>'allow_duplicate_phone')::boolean, false) then
    if exists (select 1 from tickets t join slots s2 on s2.id = t.slot_id
               where t.booth_id = b.id and t.phone_hash = md5(ph) and t.status in ('waiting','called')
                 and s2.starts_at::date = s.starts_at::date) then
      raise exception '같은 날 이 부스에 이미 예약된 번호입니다.';
    end if;
  end if;
  insert into tickets(event_id, booth_id, slot_id, name, phone, phone_hash, party_size, source, ticket_date)
  values (b.event_id, b.id, s.id, trim(p_name), ph, md5(ph), p_party, 'online', (s.starts_at at time zone 'Asia/Seoul')::date) returning * into t;
  perform enqueue_notification(t.id, 'R01');
  -- 리마인드 예약
  perform enqueue_notification(t.id, 'R02', r.at)
  from (
    select case
      when x->>'type' = 'day_before' then ((s.starts_at at time zone 'Asia/Seoul')::date - 1 + make_time(coalesce((x->>'hour')::int,19),0,0)) at time zone 'Asia/Seoul'
      when x->>'type' = 'before_min' then s.starts_at - make_interval(mins => coalesce((x->>'min')::int,30))
    end as at
    from jsonb_array_elements(coalesce(st->'reminders','[]'::jsonb)) x
  ) r where r.at > now();
  return jsonb_build_object('token', t.token);
end $$;

-- ───────────────────────── 손님: 내 티켓 조회
create or replace function get_ticket(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'party_size', t.party_size, 'ticket_no', t.ticket_no, 'status', t.status,
    'called_at', t.called_at, 'created_at', t.created_at, 'phone_tail', right(t.phone, 4),
    'ahead', case when t.slot_id is null then ahead_count(t.id) else null end,
    'booth', jsonb_build_object('name', b.name, 'slug', b.slug, 'mode', b.mode, 'location', b.location, 'is_paused', b.is_paused, 'settings', b.settings),
    'event', jsonb_build_object('name', e.name, 'notice', e.notice),
    'slot', case when s.id is null then null else jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status) end,
    'can_cancel', t.status in ('waiting') and (s.id is null or now() < s.starts_at - make_interval(mins => coalesce((b.settings->>'cancel_until_before_min')::int,120)))
  )
  from tickets t join booths b on b.id = t.booth_id join events e on e.id = t.event_id
  left join slots s on s.id = t.slot_id
  where t.token = p_token
$$;

-- ───────────────────────── 손님: 취소
create or replace function cancel_ticket(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tickets;
begin
  select * into t from tickets where token = p_token for update;
  if not found then raise exception '티켓을 찾을 수 없습니다.'; end if;
  if t.status not in ('waiting','called') then raise exception '취소할 수 없는 상태입니다.'; end if;
  update tickets set status = 'cancelled' where id = t.id;
  update notifications set status = 'skipped' where ticket_id = t.id and status = 'pending';
  if t.slot_id is not null then perform enqueue_notification(t.id, 'R03'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────── 스태프: PIN 검증 → 스태프 토큰(부스 id + 서명) 발급
-- 단순화: PIN 맞으면 booth_id 와 pin_hash 일부로 만든 토큰을 반환, 이후 RPC 마다 재검증.
create or replace function staff_login(p_slug text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare b booths;
begin
  select * into b from booths where slug = p_slug;
  if not found or b.pin_hash is null or b.pin_hash is distinct from crypt(coalesce(p_pin,''), b.pin_hash) then
    raise exception 'PIN이 올바르지 않습니다.';
  end if;
  return jsonb_build_object('booth_id', b.id, 'staff_token', md5(b.id::text || b.pin_hash), 'booth', jsonb_build_object('name', b.name, 'mode', b.mode, 'slug', b.slug, 'settings', b.settings, 'is_paused', b.is_paused));
end $$;

create or replace function assert_staff(p_booth uuid, p_token text) returns booths
language plpgsql stable security definer set search_path = public as $$
declare b booths;
begin
  select * into b from booths where id = p_booth;
  if not found then raise exception '부스를 찾을 수 없습니다.'; end if;
  if b.pin_hash is null or p_token is distinct from md5(b.id::text || b.pin_hash) then
    if not is_admin(b.event_id) then raise exception '스태프 인증이 만료되었습니다. 다시 로그인해 주세요.'; end if;
  end if;
  return b;
end $$;

-- 스태프: 부스 전체 상태 (대기열 + 회차)
create or replace function staff_board(p_booth uuid, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b booths;
begin
  b := assert_staff(p_booth, p_token);
  return jsonb_build_object(
    'booth', jsonb_build_object('id', b.id, 'name', b.name, 'mode', b.mode, 'is_paused', b.is_paused, 'settings', b.settings),
    'queue', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'ticket_no', t.ticket_no, 'name', t.name, 'phone_tail', right(t.phone,4), 'party_size', t.party_size,
        'status', t.status, 'called_at', t.called_at, 'created_at', t.created_at, 'source', t.source
      ) order by t.created_at), '[]'::jsonb)
      from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('waiting','called')),
    'done_today', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('checked_in','done')),
    'noshow_today', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status = 'no_show'),
    'slots', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'capacity', s.capacity, 'status', s.status,
        'tickets', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'name', t.name, 'phone_tail', right(t.phone,4), 'party_size', t.party_size, 'status', t.status, 'checked_in_at', t.checked_in_at
          ) order by t.created_at), '[]'::jsonb) from tickets t where t.slot_id = s.id and t.status <> 'cancelled')
      ) order by s.starts_at), '[]'::jsonb)
      from slots s where s.booth_id = b.id and (s.starts_at at time zone 'Asia/Seoul')::date = kst_today() and s.status <> 'cancelled')
  );
end $$;

-- 스태프: 티켓 상태 변경
create or replace function staff_update_ticket(p_booth uuid, p_token text, p_ticket uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b booths; t tickets; valid_min int;
begin
  b := assert_staff(p_booth, p_token);
  select * into t from tickets where id = p_ticket and booth_id = b.id for update;
  if not found then raise exception '티켓을 찾을 수 없습니다.'; end if;
  case p_action
    when 'call' then
      update tickets set status = 'called', called_at = now() where id = t.id;
      update notifications set status='skipped' where ticket_id = t.id and template_code = 'Q02' and status='pending';
      perform enqueue_notification(t.id, 'Q03');
    when 'checkin' then
      update tickets set status = 'checked_in', checked_in_at = now() where id = t.id;
      update notifications set status='skipped' where ticket_id = t.id and status='pending';
    when 'done' then
      update tickets set status = 'done' where id = t.id;
    when 'noshow' then
      update tickets set status = 'no_show' where id = t.id;
      update notifications set status='skipped' where ticket_id = t.id and status='pending';
    when 'restore' then
      update tickets set status = 'waiting', called_at = null where id = t.id;
    else raise exception '알 수 없는 동작: %', p_action;
  end case;
  insert into audit_logs(actor, action, target_type, target_id) values ('staff:'||b.slug, p_action, 'ticket', t.id);
  return jsonb_build_object('ok', true);
end $$;

-- 스태프: 대리 접수 (전화번호 없음, 알림 없음)
create or replace function staff_add_walkin(p_booth uuid, p_token text, p_name text, p_party int, p_slot uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b booths; t tickets; n int;
begin
  b := assert_staff(p_booth, p_token);
  if p_slot is null then
    select coalesce(max(ticket_no),0)+1 into n from tickets where booth_id = b.id and ticket_date = kst_today() and slot_id is null;
  end if;
  insert into tickets(event_id, booth_id, slot_id, name, party_size, ticket_no, source, ticket_date)
  values (b.event_id, b.id, p_slot, coalesce(nullif(trim(p_name),''),'현장'), greatest(p_party,1), n, 'staff',
          coalesce((select (starts_at at time zone 'Asia/Seoul')::date from slots where id = p_slot), kst_today()))
  returning * into t;
  return jsonb_build_object('id', t.id, 'ticket_no', t.ticket_no);
end $$;

-- 스태프: 접수 일시정지 토글
create or replace function staff_toggle_pause(p_booth uuid, p_token text, p_paused boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b booths;
begin
  b := assert_staff(p_booth, p_token);
  update booths set is_paused = p_paused where id = b.id;
  insert into booth_versions(booth_id, version) values (b.id, 1) on conflict (booth_id) do update set version = booth_versions.version+1, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────── 관리자: PIN 설정
create or replace function admin_set_pin(p_booth uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin((select event_id from booths where id = p_booth)) then raise exception '권한이 없습니다.'; end if;
  if p_pin !~ '^\d{4,6}$' then raise exception 'PIN은 숫자 4~6자리여야 합니다.'; end if;
  update booths set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_booth;
end $$;

-- 관리자: 회차 일괄 생성
create or replace function admin_generate_slots(p_booth uuid, p_date date, p_times time[], p_duration_min int, p_capacity int) returns int
language plpgsql security definer set search_path = public as $$
declare tm time; cnt int := 0; st timestamptz;
begin
  if not is_admin((select event_id from booths where id = p_booth)) then raise exception '권한이 없습니다.'; end if;
  foreach tm in array p_times loop
    st := (p_date + tm) at time zone 'Asia/Seoul';
    insert into slots(booth_id, starts_at, ends_at, capacity) values (p_booth, st, st + make_interval(mins => p_duration_min), p_capacity);
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

-- 관리자: 회차 취소 (예약자 전원 R03)
create or replace function admin_cancel_slot(p_slot uuid) returns int
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if not is_admin((select b.event_id from slots s join booths b on b.id = s.booth_id where s.id = p_slot)) then raise exception '권한이 없습니다.'; end if;
  update slots set status = 'cancelled' where id = p_slot;
  with c as (update tickets set status = 'cancelled' where slot_id = p_slot and status in ('waiting','called') returning id)
  select count(*) into cnt from c;
  update notifications set status='skipped' where ticket_id in (select id from tickets where slot_id = p_slot) and status='pending';
  insert into notifications(ticket_id, template_code) select id, 'R03' from tickets where slot_id = p_slot and status = 'cancelled' and phone is not null;
  return cnt;
end $$;

-- 관리자: 개인정보 파기
create or replace function admin_purge_event(p_event uuid) returns int
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if not is_admin(p_event) then raise exception '권한이 없습니다.'; end if;
  with u as (update tickets set name = '삭제됨', phone = null, phone_hash = null where event_id = p_event and phone is not null returning id)
  select count(*) into cnt from u;
  update notifications set payload = null where ticket_id in (select id from tickets where event_id = p_event);
  return cnt;
end $$;

-- ───────────────────────── 스케줄러 (pg_cron 에서 1분마다)
-- 1) 순서 임박 알림 Q02  2) 호출 후 유효시간 경과 노쇼  3) 회차 시작 N분 후 미체크인 노쇼  4) 보존기간 경과 파기
create or replace function run_scheduler() returns jsonb
language plpgsql security definer set search_path = public as $$
declare q02 int := 0; ns1 int := 0; ns2 int := 0; purged int := 0;
begin
  -- Q02: 앞 대기 <= notify_ahead_teams 이고 아직 안 보냈으면
  with cand as (
    select t.id from tickets t join booths b on b.id = t.booth_id
    where t.slot_id is null and t.status = 'waiting' and t.notified_ahead = false and t.phone is not null
      and t.ticket_date = kst_today()
      and ahead_count(t.id) <= coalesce((b.settings->>'notify_ahead_teams')::int, 2)
  ), upd as (update tickets set notified_ahead = true where id in (select id from cand) returning id)
  insert into notifications(ticket_id, template_code) select id, 'Q02' from upd;
  get diagnostics q02 = row_count;

  -- 호출 후 유효시간 경과 → no_show
  with upd as (
    update tickets t set status = 'no_show'
    from booths b where b.id = t.booth_id and t.status = 'called' and t.slot_id is null
      and t.called_at < now() - make_interval(mins => coalesce((b.settings->>'call_valid_min')::int, 5))
    returning t.id
  ) select count(*) into ns1 from upd;

  -- 회차 시작 N분 후 미체크인 → no_show
  with upd as (
    update tickets t set status = 'no_show'
    from slots s, booths b where s.id = t.slot_id and b.id = t.booth_id and t.status = 'waiting'
      and s.starts_at < now() - make_interval(mins => coalesce((b.settings->>'noshow_after_start_min')::int, 10))
    returning t.id
  ) select count(*) into ns2 from upd;

  -- 보존기간 경과 파기
  with ev as (select id from events where ends_at + make_interval(days => data_retention_days) < now()),
  u as (update tickets set name='삭제됨', phone=null, phone_hash=null where event_id in (select id from ev) and phone is not null returning id)
  select count(*) into purged from u;

  return jsonb_build_object('q02', q02, 'noshow_called', ns1, 'noshow_slot', ns2, 'purged', purged);
end $$;

grant execute on function booth_summary, join_queue, reserve_slot, get_ticket, cancel_ticket, staff_login, staff_board, staff_update_ticket, staff_add_walkin, staff_toggle_pause to anon, authenticated;
grant execute on function admin_set_pin, admin_generate_slots, admin_cancel_slot, admin_purge_event to authenticated;
