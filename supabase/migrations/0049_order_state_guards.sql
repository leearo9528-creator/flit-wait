-- 프로덕션 적용 완료 (2026-11-17)
-- 2026-11-17 주문 상태 머신 가드 — 되돌리기(back)와 준비 완료 알림
--
-- 1) 손님이 취소한 주문(cancel_reason = '손님 취소')은 가게가 되돌릴 수 없다.
--    지난 주문 탭의 '되돌리기'를 잘못 누르면 취소된 줄 알고 자리를 뜬 손님의 주문이 '새 주문'으로 되살아났다.
-- 2) 가게가 취소했던 주문을 되돌리면, 접수했던 주문은 '준비 중'(accepted)으로 돌아간다 (전에는 무조건 '새 주문' → 손님 화면에 취소 버튼이 다시 생겼다).
--    ready_at 은 비운다 (다시 준비 완료를 누를 때 새로 찍힌다).
-- 3) O02(준비 완료 알림)는 placed · accepted → ready 로 갈 때만 보낸다.
--    전달 완료를 되돌릴 때(picked_up → ready)는 손님이 이미 받은 알림이라 다시 보내지 않는다.
--    (O02 템플릿은 아직 꺼져 있어 지금까지 실제로 두 번 나간 적은 없다)
-- 화면 사본: src/lib/orders.ts vendorActions · docs/state-machines.md

create or replace function vendor_update_order(p_token text, p_order uuid, p_action text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl places; o orders;
begin
  pl := vendor_place(p_token);
  select * into o from orders where id = p_order and place_id = pl.id for update;
  if not found then raise exception '주문을 찾을 수 없습니다.'; end if;
  if p_action = 'accept' and o.status = 'placed' then
    update orders set status = 'accepted', accepted_at = now() where id = o.id;
  elsif p_action = 'ready' and o.status in ('placed', 'accepted') then
    update orders set status = 'ready', accepted_at = coalesce(accepted_at, now()), ready_at = now() where id = o.id;
  elsif p_action = 'picked' and o.status in ('ready', 'accepted') then
    update orders set status = 'picked_up', ready_at = coalesce(ready_at, now()), picked_at = now() where id = o.id;
  elsif p_action = 'cancel' and o.status in ('placed', 'accepted', 'ready') then
    update orders set status = 'cancelled', cancelled_at = now(), cancel_reason = coalesce(nullif(left(trim(coalesce(p_reason, '')), 40), ''), '가게 사정') where id = o.id;
  elsif p_action = 'back' and o.status = 'ready' then
    update orders set status = 'accepted', ready_at = null where id = o.id;
  elsif p_action = 'back' and o.status = 'picked_up' then
    update orders set status = 'ready', picked_at = null where id = o.id;
  elsif p_action = 'back' and o.status = 'cancelled' then
    if o.cancel_reason = '손님 취소' then raise exception '손님이 취소한 주문은 되돌릴 수 없어요.'; end if;
    update orders set status = case when accepted_at is not null then 'accepted' else 'placed' end,
      ready_at = null, cancelled_at = null, cancel_reason = null where id = o.id;
  else
    raise exception '이미 처리된 주문이에요. 화면을 새로 고쳐 주세요.';
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function orders_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if new.phone is null then return new; end if;
  if tg_op = 'INSERT' then v_code := 'O01';
  elsif new.status = 'ready' and old.status in ('placed', 'accepted') then v_code := 'O02';
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' and coalesce(new.cancel_reason, '') <> '손님 취소' then v_code := 'O03';
  end if;
  if v_code is null or not exists (select 1 from templates t where t.code = v_code and t.enabled) then return new; end if;
  insert into notifications(order_id, template_code) values (new.id, v_code);
  perform kick_notify();
  return new;
end $$;
