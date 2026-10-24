-- 2026-10-24 15:20 KST 프로덕션 적용 완료 (행사 2일차, 아로 지시 "1팀에 7분 내외")
-- 예상 대기 = 대기 팀 수 × settings.service_min (분, 관리자 부스 설정). 비우거나 0 이면 기존 자동 측정(입장 간격 → 최근 60분 호출 간격).
-- 60분 넘으면 화면에서 '60분 이상' (fmtWait). 성남 테크 1~3 = 7.
create or replace function public.booth_avg_service_min(p_booth uuid) returns numeric
language sql stable security definer set search_path to 'public' as $function$
  select coalesce(
    (select case when nullif(settings->>'service_min','')::numeric > 0 then (settings->>'service_min')::numeric end from booths where id = p_booth),
    (select case when count(*) >= 3 then round(extract(epoch from (max(checked_in_at) - min(checked_in_at))) / 60.0 / (count(*) - 1), 1) end
       from tickets where booth_id = p_booth and slot_id is null and ticket_date = kst_today() and checked_in_at is not null),
    (select case when count(*) >= 3 then round(extract(epoch from (max(called_at) - min(called_at))) / 60.0 / (count(*) - 1), 1) end
       from tickets where booth_id = p_booth and slot_id is null and ticket_date = kst_today() and called_at is not null and called_at > now() - interval '60 minutes')
  )
$function$;
-- update booths b set settings = b.settings || '{"service_min":7}' from events e where e.id=b.event_id and e.slug='seongnam-2026' and b.mode='queue';  -- 적용 완료
