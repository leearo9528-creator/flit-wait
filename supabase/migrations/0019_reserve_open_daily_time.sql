-- 2026-10-18 일별 예약 오픈 시각 (booths.settings.reserve_open_daily_time = 'HH:MM')
-- 성남 쿠킹클래스 요청: "10/23~10/25 3일간 매일 12:00부터 그날 회차 신청 접수".
-- 회차 날짜(KST) + 일별 오픈 시각과 전체 오픈 일시(reserve_open_at) 중 늦은 쪽부터 예약 가능.
-- 손님 화면(Reserve/EventHome)도 같은 규칙으로 날짜 탭별 "예약 오픈 전" 판정.

create or replace function public.event_summary(p_slug text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'image_url', e.image_url),
    'booths', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'mode', b.mode, 'is_paused', b.is_paused, 'location', b.location, 'image_url', b.image_url, 'description', b.description,
        'group_name', b.group_name, 'category', b.category,
        'max_party_size', b.settings->>'max_party_size',
        'reserve_open_at', b.settings->>'reserve_open_at',
        'reserve_open_daily_time', b.settings->>'reserve_open_daily_time',
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

create or replace function public.reserve_slot(p_slot uuid, p_name text, p_phone text, p_party integer, p_consent boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_slot slots; v_booth booths; v_event events; ph text; v_ticket tickets; used int; st jsonb; open_at timestamptz; day_open timestamptz; nm text;
begin
  if not p_consent then raise exception '개인정보 수집·이용에 동의해 주세요.'; end if;
  nm := assert_name(p_name);
  select * into v_slot from slots where id = p_slot for update;
  if not found or v_slot.status <> 'open' then raise exception '예약할 수 없는 회차입니다.'; end if;
  select * into v_booth from booths where id = v_slot.booth_id;
  select * into v_event from events where id = v_booth.event_id;
  st := v_booth.settings;
  if v_event.status <> 'open' then raise exception '현재 예약 기간이 아닙니다.'; end if;
  open_at := nullif(st->>'reserve_open_at','')::timestamptz;
  -- 일별 오픈: 회차 날짜(KST) + HH:MM. 전체 오픈 일시와 둘 중 늦은 쪽
  if nullif(st->>'reserve_open_daily_time','') is not null then
    day_open := ((v_slot.starts_at at time zone 'Asia/Seoul')::date + (st->>'reserve_open_daily_time')::time) at time zone 'Asia/Seoul';
    if open_at is null or day_open > open_at then open_at := day_open; end if;
  end if;
  if open_at is not null and now() < open_at then
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
                 and (s2.starts_at at time zone 'Asia/Seoul')::date = (v_slot.starts_at at time zone 'Asia/Seoul')::date) then
      raise exception '같은 날 이 부스에 이미 예약된 번호입니다.';
    end if;
  end if;
  insert into tickets(event_id, booth_id, slot_id, name, phone, phone_hash, party_size, source, ticket_date)
  values (v_booth.event_id, v_booth.id, v_slot.id, nm, ph, md5(ph), p_party, 'online', (v_slot.starts_at at time zone 'Asia/Seoul')::date) returning * into v_ticket;
  perform enqueue_notification(v_ticket.id, 'R01');
  perform enqueue_notification(v_ticket.id, 'R02', r.at)
  from (
    select case
      when x->>'type' = 'day_before' then ((v_slot.starts_at at time zone 'Asia/Seoul')::date - 1 + make_time(coalesce((x->>'hour')::int,19),0,0)) at time zone 'Asia/Seoul'
      when x->>'type' = 'before_min' then v_slot.starts_at - make_interval(mins => coalesce((x->>'min')::int,30))
    end as at
    from jsonb_array_elements(coalesce(st->'reminders','[]'::jsonb)) x
  ) r where r.at > now();
  return jsonb_build_object('token', v_ticket.token);
end $function$;
