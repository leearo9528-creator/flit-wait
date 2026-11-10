-- 프로덕션 적용 완료 (2026-11-10)
-- 2026-11-10 주문 · 픽업 호출 (푸드존 · 마켓) — 1단계: 결제 없이 '받을 때 결제'
--
-- 손님: 장소 상세에서 메뉴를 담아 주문 → 주문번호 → 준비되면 화면이 '받으러 오세요' 로 바뀐다.
-- 사장님: 가게마다 비밀 링크(/vo/<token>) 하나. 본인 폰으로 주문 접수 · 준비 완료 · 전달 완료 · 품절 · 주문 잠시 중단.
-- 메뉴는 places.menu(jsonb) 를 그대로 쓴다 — [{ name, price:'5,000원', desc?, image_url?, sold_out? }]. 금액은 서버가 price 의 숫자만 뽑아 계산한다.
--
-- 결제(2단계)를 위해 칸만 미리 둔다: orders.pay_method('onsite' | 'app') · pay_status · payment_key, order_settings.pay_mode.
-- 앱결제는 PG 지급대행(가게 통장으로 직접 정산)으로 붙일 예정 — 이 단계에서는 돈이 플릿을 거치지 않는다(가게가 직접 받음).
-- 알림톡(주문 접수 · 준비 완료)은 카카오 템플릿 심사가 필요해 다음 단계. 지금은 주문 화면이 5초마다 스스로 바뀐다.

-- 가게별 주문 설정. 비밀 링크 토큰이 들어 있어 places 와 떼어 둔다 (손님용 event_guide 는 places 만 읽는다).
create table if not exists order_settings (
  place_id uuid primary key references places(id) on delete cascade,
  enabled boolean not null default false,
  paused boolean not null default false,
  token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  pay_mode text not null default 'onsite' check (pay_mode in ('onsite', 'app')),
  created_at timestamptz not null default now()
);
alter table order_settings enable row level security;
drop policy if exists order_settings_admin on order_settings;
create policy order_settings_admin on order_settings for all
  using (is_admin((select event_id from places p where p.id = place_id)))
  with check (is_admin((select event_id from places p where p.id = place_id)));

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  place_id uuid not null references places(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  order_no int not null,
  order_date date not null default (now() at time zone 'Asia/Seoul')::date,
  name text not null,
  phone text,
  user_id uuid,
  items jsonb not null,            -- 주문 시점 스냅숏 [{ name, price, qty }]
  total int not null,
  note text,
  status text not null default 'placed' check (status in ('placed', 'accepted', 'ready', 'picked_up', 'cancelled')),
  cancel_reason text,
  pay_method text not null default 'onsite' check (pay_method in ('onsite', 'app')),
  pay_status text not null default 'unpaid' check (pay_status in ('unpaid', 'paid', 'refunded')),
  payment_key text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  picked_at timestamptz,
  cancelled_at timestamptz,
  unique (place_id, order_date, order_no)
);
create index if not exists orders_place_idx on orders(place_id, order_date, status);
create index if not exists orders_event_idx on orders(event_id, created_at);
alter table orders enable row level security;
drop policy if exists orders_admin on orders;
create policy orders_admin on orders for select using (is_admin(event_id));

-- '5,000원' → 5000
create or replace function price_int(p text) returns int language sql immutable as $$
  select coalesce(nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')::int, 0)
$$;

-- 손님: 주문 넣기. p_items = [{ "name": "떡볶이", "qty": 2 }, …] — 금액은 서버가 메뉴에서 다시 계산한다.
create or replace function place_order(p_place uuid, p_name text, p_phone text, p_items jsonb, p_consent boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl places; e events; os order_settings; ph text; nm text; it jsonb; m jsonb; q int; n int; tot int := 0; cnt int := 0; snap jsonb := '[]'::jsonb; o orders;
begin
  if not coalesce(p_consent, false) then raise exception '개인정보 수집·이용에 동의해 주세요.'; end if;
  nm := assert_name(p_name);
  ph := normalize_phone(p_phone);
  if ph is null or length(ph) < 10 then raise exception '휴대폰번호를 확인해 주세요.'; end if;
  select * into pl from places where id = p_place;
  if not found then raise exception '가게를 찾을 수 없습니다.'; end if;
  select * into e from events where id = pl.event_id;
  if e.status <> 'open' then raise exception '지금은 주문을 받지 않아요.'; end if;
  select * into os from order_settings where place_id = pl.id;
  if not found or not os.enabled then raise exception '이 가게는 앱 주문을 받지 않아요.'; end if;
  if os.paused then raise exception '지금은 주문이 잠시 멈춰 있어요. 조금 뒤에 다시 해 주세요.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception '메뉴를 담아 주세요.'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception '한 번에 30가지까지 주문할 수 있어요.'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    q := coalesce((it->>'qty')::int, 0);
    if q < 1 or q > 20 then raise exception '수량은 1~20개까지 담을 수 있어요.'; end if;
    select x into m from jsonb_array_elements(coalesce(pl.menu, '[]'::jsonb)) x where x->>'name' = it->>'name' limit 1;
    if m is null then raise exception '메뉴가 바뀌었어요. 다시 담아 주세요. (%)', it->>'name'; end if;
    if coalesce((m->>'sold_out')::boolean, false) then raise exception '% 은(는) 품절됐어요.', m->>'name'; end if;
    if price_int(m->>'price') <= 0 then raise exception '% 은(는) 앱으로 주문할 수 없어요.', m->>'name'; end if;
    tot := tot + price_int(m->>'price') * q; cnt := cnt + q;
    snap := snap || jsonb_build_object('name', m->>'name', 'price', price_int(m->>'price'), 'qty', q);
  end loop;
  if cnt > 40 then raise exception '한 번에 40개까지 주문할 수 있어요.'; end if;

  -- 받을 때 결제라 안 찾아가는 주문이 쌓이지 않게: 같은 번호로 한 가게에 진행 중 주문은 2건까지
  if (select count(*) from orders where place_id = pl.id and phone = ph and order_date = kst_today() and status in ('placed', 'accepted', 'ready')) >= 2 then
    raise exception '이 가게에 아직 받지 않은 주문이 있어요. 먼저 받아 주세요.';
  end if;

  perform pg_advisory_xact_lock(hashtext('order:' || pl.id::text));
  select coalesce(max(order_no), 0) + 1 into n from orders where place_id = pl.id and order_date = kst_today();
  insert into orders(event_id, place_id, order_no, name, phone, user_id, items, total, note, pay_method)
  values (pl.event_id, pl.id, n, nm, ph, auth.uid(), snap, tot, nullif(left(trim(coalesce(p_note, '')), 80), ''), 'onsite')
  returning * into o;
  return jsonb_build_object('token', o.token, 'order_no', o.order_no, 'total', o.total);
end $$;

create or replace function order_out(o orders) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_no', o.order_no, 'status', o.status, 'items', o.items, 'total', o.total, 'name', o.name, 'note', o.note,
    'pay_method', o.pay_method, 'pay_status', o.pay_status, 'cancel_reason', o.cancel_reason,
    'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at, 'picked_at', o.picked_at,
    'ahead', case when o.status in ('placed', 'accepted') then
      (select count(*) from orders x where x.place_id = o.place_id and x.order_date = o.order_date and x.status in ('placed', 'accepted') and x.order_no < o.order_no) end,
    'can_cancel', o.status = 'placed',
    'place', (select jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind) from places p where p.id = o.place_id),
    'event', (select jsonb_build_object('slug', e.slug, 'name', e.name) from events e where e.id = o.event_id))
$$;
revoke execute on function order_out(orders) from public, anon, authenticated;

create or replace function get_order(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select order_out(o) from orders o where o.token = p_token
$$;

-- 손님 취소 — 가게가 접수하기 전까지만
create or replace function cancel_order(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where token = p_token for update;
  if not found then raise exception '주문을 찾을 수 없습니다.'; end if;
  if o.status <> 'placed' then raise exception '가게에서 이미 준비를 시작했어요. 취소는 가게에 직접 말씀해 주세요.'; end if;
  update orders set status = 'cancelled', cancelled_at = now(), cancel_reason = '손님 취소' where id = o.id returning * into o;
  return order_out(o);
end $$;

-- ───────── 사장님 화면 (/vo/<token>)
create or replace function vendor_place(p_token text) returns places language plpgsql stable security definer set search_path = public as $$
declare pl places;
begin
  select p.* into pl from order_settings s join places p on p.id = s.place_id where s.token = p_token;
  if not found then raise exception '주문 화면 주소가 맞지 않아요. 플릿에 문의해 주세요.'; end if;
  return pl;
end $$;
revoke execute on function vendor_place(text) from public, anon, authenticated;

create or replace function vendor_board(p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pl places; os order_settings;
begin
  pl := vendor_place(p_token);
  select * into os from order_settings where place_id = pl.id;
  return jsonb_build_object(
    'place', jsonb_build_object('id', pl.id, 'name', pl.name, 'menu', coalesce(pl.menu, '[]'::jsonb)),
    'event', (select jsonb_build_object('name', e.name, 'slug', e.slug) from events e where e.id = pl.event_id),
    'enabled', os.enabled, 'paused', os.paused, 'pay_mode', os.pay_mode,
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'order_no', o.order_no, 'status', o.status, 'items', o.items, 'total', o.total, 'name', o.name,
        'phone_tail', right(o.phone, 4), 'note', o.note, 'pay_status', o.pay_status, 'pay_method', o.pay_method, 'cancel_reason', o.cancel_reason,
        'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at, 'picked_at', o.picked_at
      ) order by o.order_no), '[]'::jsonb) from orders o where o.place_id = pl.id and o.order_date = kst_today()),
    'stats', (select jsonb_build_object('count', count(*) filter (where status = 'picked_up'), 'total', coalesce(sum(total) filter (where status = 'picked_up'), 0)) from orders o where o.place_id = pl.id and o.order_date = kst_today()));
end $$;

-- p_action: accept(접수) · ready(준비 완료 = 손님 호출) · picked(전달 완료) · cancel(취소, p_reason) · back(한 단계 되돌리기)
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
    update orders set status = 'placed', cancelled_at = null, cancel_reason = null where id = o.id;
  else
    raise exception '이미 처리된 주문이에요. 화면을 새로 고쳐 주세요.';
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function vendor_set_soldout(p_token text, p_name text, p_sold boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pl places;
begin
  pl := vendor_place(p_token);
  update places set menu = (
    select coalesce(jsonb_agg(case when x->>'name' = p_name then x || jsonb_build_object('sold_out', coalesce(p_sold, false)) else x end order by ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(menu, '[]'::jsonb)) with ordinality as t(x, ord)
  ) where id = pl.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function vendor_set_paused(p_token text, p_paused boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pl places;
begin
  pl := vendor_place(p_token);
  update order_settings set paused = coalesce(p_paused, false) where place_id = pl.id;
  return jsonb_build_object('ok', true);
end $$;

-- 관리자: 가게의 주문 설정 읽기/켜기/끄기. 처음 부르면 행(비밀 링크 포함)을 만든다.
create or replace function admin_order_settings(p_place uuid, p_enabled boolean default null, p_new_token boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl places; os order_settings;
begin
  select * into pl from places where id = p_place;
  if not found or not is_admin(pl.event_id) then raise exception '권한이 없습니다.'; end if;
  insert into order_settings(place_id) values (pl.id) on conflict (place_id) do nothing;
  update order_settings set
    enabled = coalesce(p_enabled, enabled),
    token = case when p_new_token then encode(extensions.gen_random_bytes(12), 'hex') else token end
  where place_id = pl.id returning * into os;
  return jsonb_build_object('enabled', os.enabled, 'paused', os.paused, 'token', os.token, 'pay_mode', os.pay_mode,
    'today', (select jsonb_build_object('count', count(*) filter (where status <> 'cancelled'), 'total', coalesce(sum(total) filter (where status = 'picked_up'), 0)) from orders o where o.place_id = pl.id and o.order_date = kst_today()));
end $$;

grant execute on function place_order(uuid, text, text, jsonb, boolean, text), get_order(text), cancel_order(text),
  vendor_board(text), vendor_update_order(text, uuid, text, text), vendor_set_soldout(text, text, boolean), vendor_set_paused(text, boolean) to anon, authenticated;
revoke execute on function admin_order_settings(uuid, boolean, boolean) from public, anon;
grant execute on function admin_order_settings(uuid, boolean, boolean) to authenticated;

-- 개인정보 파기에 주문도 포함 (기존 본문 + orders)
create or replace function admin_purge_event(p_event uuid) returns int
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if not is_admin(p_event) then raise exception '권한이 없습니다.'; end if;
  with u as (update tickets set name = '삭제됨', phone = null, phone_hash = null where event_id = p_event and phone is not null returning id)
  select count(*) into cnt from u;
  update notifications set payload = null where ticket_id in (select id from tickets where event_id = p_event);
  update orders set name = '삭제됨', phone = null, note = null where event_id = p_event and phone is not null;
  return cnt;
end $$;

-- event_guide: 장소마다 order_open · order_paused (0040 본문 + 두 필드)
create or replace function event_guide(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'image_url', e.image_url,
      'map_image_url', e.map_image_url, 'map_note', e.map_note, 'lat', e.lat, 'lng', e.lng, 'stamp_enabled', e.stamp_enabled,
      'directions_text', e.directions_text
    ),
    'places', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'name', p.name, 'description', p.description, 'hours', p.hours,
        'image_url', p.image_url, 'x', p.x, 'y', p.y, 'lat', p.lat, 'lng', p.lng, 'sort_order', p.sort_order, 'menu', coalesce(p.menu, '[]'::jsonb),
        'crowd', p.crowd, 'crowd_updated_at', p.crowd_updated_at,
        'order_open', coalesce(os.enabled, false), 'order_paused', coalesce(os.paused, false),
        'booth', case when b.id is null then null else jsonb_build_object(
          'id', b.id, 'slug', b.slug, 'mode', b.mode, 'is_paused', b.is_paused, 'location', b.location,
          'waiting_teams', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('waiting','called')),
          'today_left', (select coalesce(sum(s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0)),0)
                         from slots s where s.booth_id = b.id and s.status = 'open' and (s.starts_at at time zone 'Asia/Seoul')::date = kst_today() and s.ends_at > now())
        ) end
      ) order by p.sort_order, p.name), '[]'::jsonb)
      from places p left join booths b on b.id = p.booth_id left join order_settings os on os.place_id = p.id where p.event_id = e.id)
  )
  from events e where e.slug = p_slug
$$;

-- 보존기간이 지난 행사의 주문 개인정보 파기 (대기표는 run_scheduler 가 지운다 — 주문은 하루 한 번 따로)
create or replace function purge_old_orders() returns int language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  with u as (update orders set name = '삭제됨', phone = null, note = null
             where phone is not null and event_id in (select id from events where ends_at + make_interval(days => data_retention_days) < now()) returning id)
  select count(*) into cnt from u;
  return cnt;
end $$;
revoke execute on function purge_old_orders() from public, anon, authenticated;
select cron.schedule('flit-wait-purge-orders', '17 19 * * *', $$ select purge_old_orders(); $$);   -- 매일 04:17 KST
