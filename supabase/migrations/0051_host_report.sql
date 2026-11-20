-- 2026-11-21 주최 화면 결과보고서 (/h/<token>/report) — 주최 담당자가 로그인 없이 여는 인쇄용 한 장.
-- 관리자 리포트(admin_event_report · admin_order_report)의 요약판. 읽기 전용, 개인정보 없음.
-- 가게별 매출은 싣지 않는다(주문 건수까지만) — 입점 업체의 매출은 업체 것이라 주최에게 자동으로 넘기지 않는다.

create or replace function host_report(p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ev uuid := host_event(p_token);
begin
  return jsonb_build_object(
    'event', (select jsonb_build_object('name', e.name, 'slug', e.slug, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'stamp_enabled', e.stamp_enabled) from events e where e.id = ev),
    'views', jsonb_build_object(
      'total', (select coalesce(sum(count), 0) from event_views where event_id = ev and page = 'home'),
      'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day), '[]'::jsonb) from (select day, sum(count) c from event_views where event_id = ev and page = 'home' group by day) x)),
    'tickets', jsonb_build_object(
      'total', (select count(*) from tickets where event_id = ev and status <> 'cancelled'),
      'queue', (select count(*) from tickets where event_id = ev and slot_id is null and status <> 'cancelled'),
      'reserved', (select count(*) from tickets where event_id = ev and slot_id is not null and status <> 'cancelled'),
      'served', (select count(*) from tickets where event_id = ev and status in ('checked_in', 'done')),
      'people', (select coalesce(sum(party_size), 0) from tickets where event_id = ev and status in ('checked_in', 'done')),
      'no_show', (select count(*) from tickets where event_id = ev and status = 'no_show'),
      'avg_wait_min', (select round(avg(extract(epoch from (checked_in_at - created_at)) / 60)) from tickets where event_id = ev and slot_id is null and checked_in_at is not null),
      'by_booth', (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'mode', b.mode,
          'total', (select count(*) from tickets t where t.booth_id = b.id and t.status <> 'cancelled'),
          'served', (select count(*) from tickets t where t.booth_id = b.id and t.status in ('checked_in', 'done')),
          'people', (select coalesce(sum(party_size), 0) from tickets t where t.booth_id = b.id and t.status in ('checked_in', 'done')),
          'no_show', (select count(*) from tickets t where t.booth_id = b.id and t.status = 'no_show')
        ) order by b.sort_order), '[]'::jsonb) from booths b where b.event_id = ev),
      'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb) from (select ticket_date d, count(*) c from tickets where event_id = ev and status <> 'cancelled' group by 1) x)),
    'orders', jsonb_build_object(
      'orders', (select count(*) from orders where event_id = ev),
      'picked', (select count(*) from orders where event_id = ev and status = 'picked_up'),
      'cancelled', (select count(*) from orders where event_id = ev and status = 'cancelled'),
      'sales', (select coalesce(sum(total), 0) from orders where event_id = ev and status = 'picked_up'),
      'avg_ready_min', (select round(avg(extract(epoch from (ready_at - created_at)) / 60)::numeric, 1) from orders where event_id = ev and ready_at is not null and status in ('ready', 'picked_up')),
      'by_place', (select coalesce(jsonb_agg(x order by (x->>'orders')::int desc), '[]'::jsonb) from (
          select jsonb_build_object('name', p.name, 'orders', count(o.*), 'picked', count(*) filter (where o.status = 'picked_up'), 'cancelled', count(*) filter (where o.status = 'cancelled')) x
          from orders o join places p on p.id = o.place_id where o.event_id = ev group by p.id, p.name) q),
      'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'orders', c) order by h), '[]'::jsonb) from (
          select extract(hour from (created_at at time zone 'Asia/Seoul'))::int h, count(*) c from orders where event_id = ev and status <> 'cancelled' group by 1) q)),
    'stamps', jsonb_build_object(
      'cards', (select count(*) from stamp_cards where event_id = ev),
      'completed', (select count(*) from stamp_cards where event_id = ev and completed_at is not null),
      'redeemed', (select count(*) from stamp_cards where event_id = ev and redeemed_at is not null)),
    'notices', jsonb_build_object(
      'total', (select count(*) from notices where event_id = ev),
      'urgent', (select count(*) from notices where event_id = ev and urgent)));
end $$;
revoke execute on function host_report(text) from public;
grant execute on function host_report(text) to anon, authenticated;
