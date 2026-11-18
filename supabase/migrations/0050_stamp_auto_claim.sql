-- 0050 스탬프 자동 적립 (2026-11-18)
--
-- 지금까지는 부스에 붙은 스탬프 QR 을 찍어야만 적립됐다. 그래서
--   · QR 사진 한 장이 돌면 가지 않고도 다 모을 수 있었고
--   · 줄서기·주문과 따로 놀아서 손님이 QR 을 한 번 더 찍어야 했다.
-- 이제 스탬프 지점(stamp_spots.place_id)에 이어진 곳에서
--   · 체험 대기표·예약이 입장 처리되거나 (tickets.status in checked_in · done — 스태프가 누른다)
--   · 주문한 것을 받으면 (orders.status = picked_up — 사장님이 누른다)
-- 그 지점 스탬프가 찍힌다. 손님 기기가 자기 표·주문 토큰을 들고 와서 청구하는 방식이라
-- (stamp_claim) tickets · orders 표와 기존 함수는 건드리지 않는다. 토큰은 그 손님만 아는 값이다.
-- 장소에 이어지지 않은 지점(무대·포토존 등)은 전처럼 QR 로만 적립된다 (stamp_collect 그대로).

create or replace function stamp_claim(p_slug text, p_card text, p_tickets text[] default '{}', p_orders text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; c stamp_cards; v_added text[] := '{}'; v_cnt int := 0; v_total int; v_goal int;
begin
  if p_card is null or length(p_card) < 16 or length(p_card) > 64 then raise exception '카드 식별자가 올바르지 않습니다.'; end if;
  if coalesce(array_length(p_tickets, 1), 0) > 100 or coalesce(array_length(p_orders, 1), 0) > 100 then raise exception '요청이 너무 큽니다.'; end if;
  select * into e from events where slug = p_slug;
  if e.id is null then raise exception '행사를 찾을 수 없습니다.'; end if;
  select count(*) into v_total from stamp_spots where event_id = e.id;
  v_goal := least(coalesce(e.stamp_goal, v_total), v_total);
  select * into c from stamp_cards where event_id = e.id and card_token = p_card;

  if e.stamp_enabled then
    -- 받을 자격이 생긴 지점이 하나라도 있을 때만 카드를 만든다 (스탬프 화면을 안 연 손님의 빈 카드를 쌓지 않는다)
    if c.id is null and exists (
      select 1 from stamp_spots s join places pl on pl.id = s.place_id
      where s.event_id = e.id and (
        exists (select 1 from tickets t where t.token = any(p_tickets) and t.event_id = e.id and t.booth_id = pl.booth_id and t.status in ('checked_in', 'done'))
        or exists (select 1 from orders o where o.token = any(p_orders) and o.event_id = e.id and o.place_id = pl.id and o.status = 'picked_up'))
    ) then
      insert into stamp_cards(event_id, card_token) values (e.id, p_card) on conflict (card_token) do nothing;
      select * into c from stamp_cards where event_id = e.id and card_token = p_card;
    end if;

    if c.id is not null then
      with ins as (
        insert into stamps(card_id, spot_id)
        select c.id, s.id from stamp_spots s join places pl on pl.id = s.place_id
        where s.event_id = e.id and (
          exists (select 1 from tickets t where t.token = any(p_tickets) and t.event_id = e.id and t.booth_id = pl.booth_id and t.status in ('checked_in', 'done'))
          or exists (select 1 from orders o where o.token = any(p_orders) and o.event_id = e.id and o.place_id = pl.id and o.status = 'picked_up'))
        on conflict do nothing
        returning spot_id
      )
      select coalesce(array_agg(s.name order by s.sort_order, s.name), '{}') into v_added from ins join stamp_spots s on s.id = ins.spot_id;
    end if;
  end if;

  if c.id is not null then
    select count(*) into v_cnt from stamps where card_id = c.id;
    if v_goal > 0 and v_cnt >= v_goal and c.completed_at is null then
      update stamp_cards set completed_at = now(), reward_code = lpad((floor(random() * 1000000))::int::text, 6, '0') where id = c.id returning * into c;
    end if;
  end if;
  return jsonb_build_object('added', to_jsonb(v_added), 'count', v_cnt, 'goal', v_goal, 'completed', c.completed_at is not null);
end $$;
revoke all on function stamp_claim(text, text, text[], text[]) from public;
grant execute on function stamp_claim(text, text, text[], text[]) to anon, authenticated;
