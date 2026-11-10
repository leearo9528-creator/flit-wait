-- 2026-11-11 주문 알림톡 + 주문·매출 리포트
--
-- 1) 주문 알림: O01 주문 접수 · O02 준비 완료(픽업 호출) · O03 가게 취소. 기존 notifications 큐를 같이 쓴다 (order_id 추가, ticket_id 는 비워도 됨).
--    orders 에 트리거를 걸어 넣는다 — place_order / vendor_update_order 본문은 그대로.
--    템플릿은 꺼 둔 채로 들어간다(enabled=false). 카카오 심사가 끝나 ncp_template_code · alimtalk_content 를 넣고 켜면 그때부터 나간다.
--    ⚠️ notify Edge Function 도 같이 올려야 한다 (주문 알림을 읽는 부분). 안 올리면 주문 알림은 pending 으로 쌓이기만 한다 → 그래서 템플릿을 꺼 둔다.
-- 2) admin_order_report: 가게별 · 시간대별 · 메뉴별 주문과 매출 (전달 완료 기준)

alter table notifications alter column ticket_id drop not null;
alter table notifications add column if not exists order_id uuid references orders(id) on delete cascade;
create index if not exists notifications_order_idx on notifications(order_id);
alter table notifications drop constraint if exists notifications_target_check;
alter table notifications add constraint notifications_target_check check (ticket_id is not null or order_id is not null);

insert into templates(code, description, sms_fallback_text, button_name, button_link, enabled) values
 ('O01', '주문 접수', '[#{행사명}] #{가게명} 주문 접수. 주문번호 #{주문번호}번, #{메뉴}, #{금액}. 준비되면 알려 드려요. #{링크}', '주문 확인', 'https://wait.flitunion.com/o/#{token}', false),
 ('O02', '주문 준비 완료', '[#{행사명}] #{이름}님 #{가게명} 주문번호 #{주문번호}번이 준비됐어요. 가게에서 받아 가세요. #{링크}', '주문 확인', 'https://wait.flitunion.com/o/#{token}', false),
 ('O03', '주문 취소', '[#{행사명}] #{가게명} 주문번호 #{주문번호}번이 취소됐어요. 사유: #{사유}', '주문 확인', 'https://wait.flitunion.com/o/#{token}', false)
on conflict (code) do nothing;

create or replace function orders_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if new.phone is null then return new; end if;
  if tg_op = 'INSERT' then code := 'O01';
  elsif new.status = 'ready' and old.status is distinct from 'ready' then code := 'O02';
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' and coalesce(new.cancel_reason, '') <> '손님 취소' then code := 'O03';
  end if;
  if code is null or not exists (select 1 from templates t where t.code = code and t.enabled) then return new; end if;
  insert into notifications(order_id, template_code) values (new.id, code);
  perform kick_notify();
  return new;
end $$;
drop trigger if exists orders_notify on orders;
create trigger orders_notify after insert or update of status on orders for each row execute function orders_notify();

-- 개인정보 파기: 주문 알림 내용도 지운다 (0046 본문 + notifications.order_id)
create or replace function admin_purge_event(p_event uuid) returns int
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if not is_admin(p_event) then raise exception '권한이 없습니다.'; end if;
  with u as (update tickets set name = '삭제됨', phone = null, phone_hash = null where event_id = p_event and phone is not null returning id)
  select count(*) into cnt from u;
  update notifications set payload = null where ticket_id in (select id from tickets where event_id = p_event);
  update notifications set payload = null where order_id in (select id from orders where event_id = p_event);
  update orders set name = '삭제됨', phone = null, note = null where event_id = p_event and phone is not null;
  return cnt;
end $$;

create or replace function purge_old_orders() returns int language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  update notifications set payload = null where payload is not null and order_id in (
    select o.id from orders o join events e on e.id = o.event_id where e.ends_at + make_interval(days => e.data_retention_days) < now());
  with u as (update orders set name = '삭제됨', phone = null, note = null
             where phone is not null and event_id in (select id from events where ends_at + make_interval(days => data_retention_days) < now()) returning id)
  select count(*) into cnt from u;
  return cnt;
end $$;
revoke execute on function purge_old_orders() from public, anon, authenticated;

-- 주문 · 매출 리포트 (매출은 전달 완료 기준)
create or replace function admin_order_report(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(p_event) then raise exception '권한이 없습니다.'; end if;
  return jsonb_build_object(
    'orders', (select count(*) from orders where event_id = p_event),
    'picked', (select count(*) from orders where event_id = p_event and status = 'picked_up'),
    'cancelled', (select count(*) from orders where event_id = p_event and status = 'cancelled'),
    'sales', (select coalesce(sum(total), 0) from orders where event_id = p_event and status = 'picked_up'),
    'avg_ready_min', (select round(avg(extract(epoch from (ready_at - created_at)) / 60)::numeric, 1) from orders where event_id = p_event and ready_at is not null and status in ('ready', 'picked_up')),
    'by_place', (select coalesce(jsonb_agg(x order by (x->>'sales')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('name', p.name, 'orders', count(o.*), 'picked', count(*) filter (where o.status = 'picked_up'), 'cancelled', count(*) filter (where o.status = 'cancelled'),
          'sales', coalesce(sum(o.total) filter (where o.status = 'picked_up'), 0),
          'avg_ready_min', round(avg(extract(epoch from (o.ready_at - o.created_at)) / 60) filter (where o.ready_at is not null and o.status in ('ready', 'picked_up'))::numeric, 1)) x
        from orders o join places p on p.id = o.place_id where o.event_id = p_event group by p.id, p.name) q),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'orders', c, 'sales', s) order by h), '[]'::jsonb) from (
        select extract(hour from (created_at at time zone 'Asia/Seoul'))::int h, count(*) c, coalesce(sum(total) filter (where status = 'picked_up'), 0) s
        from orders where event_id = p_event and status <> 'cancelled' group by 1) q),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', c, 'sales', s) order by d), '[]'::jsonb) from (
        select order_date d, count(*) filter (where status <> 'cancelled') c, coalesce(sum(total) filter (where status = 'picked_up'), 0) s from orders where event_id = p_event group by 1) q),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'place', pl, 'qty', q, 'sales', s) order by s desc), '[]'::jsonb) from (
        select it->>'name' nm, p.name pl, sum((it->>'qty')::int) q, sum((it->>'qty')::int * (it->>'price')::int) s
        from orders o join places p on p.id = o.place_id, jsonb_array_elements(o.items) it
        where o.event_id = p_event and o.status = 'picked_up' group by 1, 2 order by s desc limit 10) q));
end $$;
revoke execute on function admin_order_report(uuid) from public, anon;
grant execute on function admin_order_report(uuid) to authenticated;
