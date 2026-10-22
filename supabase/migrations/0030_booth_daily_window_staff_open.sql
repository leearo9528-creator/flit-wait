-- 2026-10-23 프로덕션 적용 완료 (성남 행사 당일 새벽, 아로 지시)
-- 1) 대기표(queue/hybrid) 부스 일별 접수 시간대: settings.queue_open_daily_time / queue_close_daily_time ('HH:MM' KST).
--    비우면 기존처럼 행사 시간 전체. 성남 테크놀이터 1~3 = 14:00 ~ 20:00.
-- 2) 스태프 수동 오픈/마감 staff_set_open(p_open):
--    오픈 = is_paused 해제 + settings.open_override_date = 오늘 → 그날은 시간대와 무관하게 접수(대기표)·예약(회차) 받음.
--    마감 = 기존 '오늘 마감'(closed_today, 00:05 KST auto_reopen 으로 자동 해제) + override 제거.
--    우선순위: is_paused(마감·일시중단) > open_override_date(오늘) > 시간대 설정.
-- 3) slot(예약 전용) 부스는 is_paused 일 때 reserve_slot 도 막는다 — 지금까지 스태프 '마감'이 예약에는 안 들었다.
--    hybrid 는 기존대로(현장 대기만 멈추고 예약은 계속).
-- 4) event_summary / event_board 에 window_state·시간대 노출 → 손님 목록·현황판 뱃지.

create or replace function public.queue_window_state(p_settings jsonb) returns text
language sql stable set search_path = public as $$
  select case
    when p_settings->>'open_override_date' = kst_today()::text then 'open'
    when nullif(p_settings->>'queue_open_daily_time','') is not null
         and (now() at time zone 'Asia/Seoul')::time < (p_settings->>'queue_open_daily_time')::time then 'before_open'
    when nullif(p_settings->>'queue_close_daily_time','') is not null
         and (now() at time zone 'Asia/Seoul')::time >= (p_settings->>'queue_close_daily_time')::time then 'after_close'
    else 'open' end
$$;

create or replace function public.join_queue(p_slug text, p_name text, p_phone text, p_party integer, p_consent boolean)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare b booths; e events; ph text; t tickets; n int; st jsonb; nm text;
begin
  if not p_consent then raise exception '개인정보 수집·이용에 동의해 주세요.'; end if;
  nm := assert_name(p_name);
  select * into b from booths where slug = p_slug for update;
  if not found then raise exception '부스를 찾을 수 없습니다.'; end if;
  select * into e from events where id = b.event_id;
  if e.status <> 'open' then raise exception '현재 접수 기간이 아닙니다.'; end if;
  if now() < e.starts_at then raise exception '행사 시작 전입니다. % 부터 접수할 수 있어요.', to_char(e.starts_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI'); end if;
  if b.mode = 'slot' then raise exception '이 부스는 예약제로 운영됩니다.'; end if;
  if b.is_paused then
    if b.settings->>'pause_mode' = 'closed_today' then raise exception '오늘 접수가 마감되었습니다.'; end if;
    raise exception '현재 접수가 일시 중단되었습니다. 잠시 후 다시 시도해 주세요.';
  end if;
  st := b.settings;
  -- 일별 접수 시간대 (스태프가 오늘 '오픈'을 눌렀으면 통과)
  case queue_window_state(st)
    when 'before_open' then raise exception '오늘 대기 접수는 % 부터 받습니다.', st->>'queue_open_daily_time';
    when 'after_close' then raise exception '오늘 접수가 마감되었습니다. (% 마감)', st->>'queue_close_daily_time';
    else null;
  end case;
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
  values (b.event_id, b.id, nm, ph, md5(ph), p_party, n, 'onsite') returning * into t;
  perform enqueue_notification(t.id, 'Q01');
  return jsonb_build_object('token', t.token, 'ticket_no', t.ticket_no, 'ahead', ahead_count(t.id));
end $function$;

create or replace function public.reserve_slot(p_slot uuid, p_name text, p_phone text, p_party integer, p_consent boolean)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_slot slots; v_booth booths; v_event events; ph text; v_ticket tickets; used int; st jsonb; open_at timestamptz; day_open timestamptz; nm text; slot_day date;
begin
  if not p_consent then raise exception '개인정보 수집·이용에 동의해 주세요.'; end if;
  nm := assert_name(p_name);
  select * into v_slot from slots where id = p_slot for update;
  if not found or v_slot.status <> 'open' then raise exception '예약할 수 없는 회차입니다.'; end if;
  select * into v_booth from booths where id = v_slot.booth_id;
  select * into v_event from events where id = v_booth.event_id;
  st := v_booth.settings;
  slot_day := (v_slot.starts_at at time zone 'Asia/Seoul')::date;
  if v_event.status <> 'open' then raise exception '현재 예약 기간이 아닙니다.'; end if;
  -- 예약 전용 부스는 스태프 '마감'·'일시중단'이 예약에도 적용된다
  if v_booth.mode = 'slot' and v_booth.is_paused then
    if st->>'pause_mode' = 'closed_today' then raise exception '오늘 예약이 마감되었습니다.'; end if;
    raise exception '현재 예약 접수가 일시 중단되었습니다. 잠시 후 다시 시도해 주세요.';
  end if;
  open_at := nullif(st->>'reserve_open_at','')::timestamptz;
  if nullif(st->>'reserve_open_daily_time','') is not null then
    day_open := (slot_day + (st->>'reserve_open_daily_time')::time) at time zone 'Asia/Seoul';
    if open_at is null or day_open > open_at then open_at := day_open; end if;
  end if;
  -- 스태프가 그 날짜에 '오픈'을 눌렀으면 오픈 시각 전이라도 받는다
  if open_at is not null and now() < open_at and (st->>'open_override_date') is distinct from slot_day::text then
    raise exception '예약은 % 부터 가능합니다.', to_char(open_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI');
  end if;
  if now() > v_slot.starts_at - make_interval(mins => coalesce((st->>'reserve_close_before_min')::int, 60)) then
    raise exception '이 회차의 사전 예약이 마감되었습니다. 현장 대기를 이용해 주세요.';
  end if;
  if p_party < 1 or p_party > coalesce((st->>'max_party_size')::int, 4) then
    raise exception '인원은 1~%명까지 예약할 수 있습니다.', coalesce((st->>'max_party_size')::int, 4);
  end if;
  select coalesce(sum(party_size),0) into used from tickets where slot_id = v_slot.id and status in ('waiting','called','checked_in','done');
  if used + p_party > v_slot.capacity then raise exception '잔여석이 부족합니다. (남은 자리 %석)', v_slot.capacity - used; end if;
  ph := normalize_phone(p_phone);
  if ph is null or length(ph) < 10 then raise exception '휴대폰번호를 확인해 주세요.'; end if;
  if not coalesce((st->>'allow_duplicate_phone')::boolean, false) then
    if exists (select 1 from tickets tk join slots s2 on s2.id = tk.slot_id
               where tk.booth_id = v_booth.id and tk.phone_hash = md5(ph) and tk.status in ('waiting','called')
                 and (s2.starts_at at time zone 'Asia/Seoul')::date = slot_day) then
      raise exception '같은 날 이 부스에 이미 예약된 번호입니다.';
    end if;
  end if;
  insert into tickets(event_id, booth_id, slot_id, name, phone, phone_hash, party_size, source, ticket_date)
  values (v_booth.event_id, v_booth.id, v_slot.id, nm, ph, md5(ph), p_party, 'online', slot_day) returning * into v_ticket;
  perform enqueue_notification(v_ticket.id, 'R01');
  perform enqueue_notification(v_ticket.id, 'R02', r.at)
  from (
    select case
      when x->>'type' = 'day_before' then (slot_day - 1 + make_time(coalesce((x->>'hour')::int,19),0,0)) at time zone 'Asia/Seoul'
      when x->>'type' = 'before_min' then v_slot.starts_at - make_interval(mins => coalesce((x->>'min')::int,30))
    end as at
    from jsonb_array_elements(coalesce(st->'reminders','[]'::jsonb)) x
  ) r where r.at > now() + interval '15 minutes';
  return jsonb_build_object('token', v_ticket.token);
end $function$;

create or replace function public.staff_set_open(p_booth uuid, p_token text, p_open boolean)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare b booths;
begin
  b := assert_staff(p_booth, p_token);
  if p_open then
    update booths set is_paused = false,
      settings = (settings - 'pause_mode' - 'pause_date') || jsonb_build_object('open_override_date', kst_today()::text)
      where id = b.id;
  else
    update booths set is_paused = true,
      settings = (settings - 'open_override_date') || jsonb_build_object('pause_mode', 'closed_today', 'pause_date', kst_today()::text)
      where id = b.id;
  end if;
  insert into booth_versions(booth_id, version) values (b.id, 1) on conflict (booth_id) do update set version = booth_versions.version+1, updated_at = now();
  insert into audit_logs(actor, action, target_type, target_id) values ('staff:'||b.slug, case when p_open then 'open_today' else 'close_today' end, 'booth', b.id);
  return jsonb_build_object('ok', true, 'is_paused', not p_open, 'open_override_date', case when p_open then kst_today()::text end);
end $function$;
grant execute on function public.staff_set_open(uuid, text, boolean) to anon, authenticated;

create or replace function public.event_summary(p_slug text)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'image_url', e.image_url),
    'booths', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'mode', b.mode, 'is_paused', b.is_paused, 'pause_mode', b.settings->>'pause_mode', 'location', b.location, 'image_url', b.image_url, 'icon_url', b.icon_url, 'description', b.description,
        'group_name', b.group_name, 'category', b.category,
        'max_party_size', b.settings->>'max_party_size',
        'reserve_open_at', b.settings->>'reserve_open_at',
        'reserve_open_daily_time', b.settings->>'reserve_open_daily_time',
        'queue_open_daily_time', b.settings->>'queue_open_daily_time',
        'queue_close_daily_time', b.settings->>'queue_close_daily_time',
        'open_override_date', b.settings->>'open_override_date',
        'window_state', queue_window_state(b.settings),
        'next_slot_at', (select min(s.starts_at) from slots s where s.booth_id = b.id and s.status = 'open' and s.ends_at > now()),
        'waiting_teams', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('waiting','called')),
        'today_slots', (select count(*) from slots s where s.booth_id = b.id and s.status = 'open' and (s.starts_at at time zone 'Asia/Seoul')::date = kst_today() and s.ends_at > now()),
        'today_left', (select coalesce(sum(s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0)),0)
                       from slots s where s.booth_id = b.id and s.status = 'open' and (s.starts_at at time zone 'Asia/Seoul')::date = kst_today() and s.ends_at > now()),
        'total_left', (select coalesce(sum(s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0)),0)
                       from slots s where s.booth_id = b.id and s.status = 'open' and s.ends_at > now())
      ) order by b.sort_order, b.name), '[]'::jsonb)
      from booths b where b.event_id = e.id)
  )
  from events e where e.slug = p_slug
$function$;

create or replace function public.event_board(p_slug text)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'event', jsonb_build_object('name', e.name, 'notice', e.notice, 'status', e.status),
    'now', now(),
    'booths', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'mode', b.mode, 'is_paused', b.is_paused, 'pause_mode', b.settings->>'pause_mode',
        'window_state', queue_window_state(b.settings),
        'queue_open_daily_time', b.settings->>'queue_open_daily_time',
        'queue_close_daily_time', b.settings->>'queue_close_daily_time',
        'waiting_teams', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status = 'waiting'),
        'called', (select coalesce(jsonb_agg(t.ticket_no order by t.called_at desc), '[]'::jsonb) from (select ticket_no, called_at from tickets where booth_id = b.id and slot_id is null and ticket_date = kst_today() and status = 'called' order by called_at desc limit 4) t),
        'last_in', (select max(ticket_no) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('checked_in','done')),
        'avg_service_min', booth_avg_service_min(b.id),
        'next_slot', (select jsonb_build_object('starts_at', s.starts_at, 'left', s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0))
                      from slots s where s.booth_id = b.id and s.status = 'open' and s.ends_at > now() order by s.starts_at limit 1)
      ) order by b.sort_order, b.name), '[]'::jsonb) from booths b where b.event_id = e.id)
  ) from events e where e.slug = p_slug
$function$;

-- 성남 테크놀이터 1~3 접수 시간대 14:00~20:00 (코드 배포 뒤 별도 실행함)
-- update booths b set settings = b.settings || '{"queue_open_daily_time":"14:00","queue_close_daily_time":"20:00"}'::jsonb
--   from events e where e.id = b.event_id and e.slug = 'seongnam-2026' and b.slug in ('tech-1','tech-2','tech-3');
