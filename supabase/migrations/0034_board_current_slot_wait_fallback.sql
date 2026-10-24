-- 2026-10-24 14:25 KST 프로덕션 적용 완료 (행사 2일차 운영 중)
-- 1) booth_avg_service_min: 입장 기록 3건 미만이면 최근 60분 호출 간격으로 추정 (호출 = 줄이 줄어드는 속도).
--    현황판 '예상 대기'와 손님 대기표 est_wait_min 이 같은 함수를 쓴다. 테크 부스는 노쇼가 많아 입장 기준 표본이 안 모였었다.
-- 2) event_board: 진행 중 회차(current_slot)와 다음 회차(next_slot = 아직 시작 안 한 첫 회차) 분리.
--    전에는 14:22 에 이미 시작한 14:00 회차가 '다음 회차 · 잔여 1석'으로 보였다.
create or replace function public.booth_avg_service_min(p_booth uuid) returns numeric
language sql stable security definer set search_path to 'public' as $function$
  select coalesce(
    (select case when count(*) >= 3 then round(extract(epoch from (max(checked_in_at) - min(checked_in_at))) / 60.0 / (count(*) - 1), 1) end
       from tickets where booth_id = p_booth and slot_id is null and ticket_date = kst_today() and checked_in_at is not null),
    (select case when count(*) >= 3 then round(extract(epoch from (max(called_at) - min(called_at))) / 60.0 / (count(*) - 1), 1) end
       from tickets where booth_id = p_booth and slot_id is null and ticket_date = kst_today() and called_at is not null and called_at > now() - interval '60 minutes')
  )
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
        'current_slot', (select jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at)
                         from slots s where s.booth_id = b.id and s.status = 'open' and s.starts_at <= now() and s.ends_at > now() order by s.starts_at limit 1),
        'next_slot', (select jsonb_build_object('starts_at', s.starts_at, 'left', s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0))
                      from slots s where s.booth_id = b.id and s.status = 'open' and s.starts_at > now() order by s.starts_at limit 1)
      ) order by b.sort_order, b.name), '[]'::jsonb) from booths b where b.event_id = e.id)
  ) from events e where e.slug = p_slug
$function$;
