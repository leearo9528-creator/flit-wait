-- 프로덕션 적용 완료 (2026-11-11)
-- 2026-11-11 주최 화면 (/h/<token>) — 주최 담당자가 로그인 없이 여는 한 장.
-- 숫자 한 줄(지금 대기 · 오늘 방문 · 오늘 주문) + 긴급 공지 올리기 + 장소 혼잡도 누르기. 세팅은 플릿이 관리자 화면에서 한다.
-- events 는 누구나 읽을 수 있는 표(events_read)라 토큰을 따로 둔다.

create table if not exists event_hosts (
  event_id uuid primary key references events(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);
alter table event_hosts enable row level security;
drop policy if exists event_hosts_admin on event_hosts;
create policy event_hosts_admin on event_hosts for all using (is_admin(event_id)) with check (is_admin(event_id));

-- 관리자: 주최 화면 링크 받기 (없으면 만든다). p_new = true 면 새 링크로 바꾼다
create or replace function admin_host_link(p_event uuid, p_new boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare tk text;
begin
  if not is_admin(p_event) then raise exception '권한이 없습니다.'; end if;
  insert into event_hosts(event_id) values (p_event) on conflict (event_id) do nothing;
  if p_new then update event_hosts set token = encode(extensions.gen_random_bytes(12), 'hex') where event_id = p_event; end if;
  select token into tk from event_hosts where event_id = p_event;
  return tk;
end $$;
revoke execute on function admin_host_link(uuid, boolean) from public, anon;
grant execute on function admin_host_link(uuid, boolean) to authenticated;

create or replace function host_event(p_token text) returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select event_id into v from event_hosts where token = p_token;
  if v is null then raise exception '주최 화면 주소가 맞지 않아요. 플릿에 문의해 주세요.'; end if;
  return v;
end $$;
revoke execute on function host_event(text) from public, anon, authenticated;

create or replace function host_board(p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ev uuid := host_event(p_token);
begin
  return jsonb_build_object(
    'event', (select jsonb_build_object('name', e.name, 'slug', e.slug, 'status', e.status) from events e where e.id = ev),
    'stats', jsonb_build_object(
      'waiting', (select count(*) from tickets t where t.event_id = ev and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('waiting', 'called')),
      'served', (select count(*) from tickets t where t.event_id = ev and t.ticket_date = kst_today() and t.status in ('done', 'checked_in')),
      'visits', (select coalesce(sum(v.count), 0) from event_views v where v.event_id = ev and v.day = kst_today() and v.page = 'home'),
      'orders', (select count(*) from orders o where o.event_id = ev and o.order_date = kst_today() and o.status <> 'cancelled'),
      'sales', (select coalesce(sum(o.total), 0) from orders o where o.event_id = ev and o.order_date = kst_today() and o.status = 'picked_up')),
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'urgent', n.urgent, 'publish_at', n.publish_at) order by n.publish_at desc), '[]'::jsonb)
                from notices n where n.event_id = ev and n.publish_at <= now() and (n.expires_at is null or n.expires_at > now())),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'crowd', p.crowd, 'crowd_updated_at', p.crowd_updated_at) order by p.sort_order, p.name), '[]'::jsonb)
               from places p where p.event_id = ev and p.booth_id is null and p.kind in ('parking', 'food', 'market', 'stage', 'facility', 'shuttle')));
end $$;

create or replace function host_post_notice(p_token text, p_title text, p_body text default null, p_urgent boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev uuid := host_event(p_token); t text := left(trim(coalesce(p_title, '')), 60);
begin
  if length(t) < 2 then raise exception '공지 제목을 적어 주세요.'; end if;
  insert into notices(event_id, title, body, urgent) values (ev, t, nullif(left(trim(coalesce(p_body, '')), 300), ''), coalesce(p_urgent, false));
  return jsonb_build_object('ok', true);
end $$;

-- 공지 내리기 (지우지 않고 만료시킨다)
create or replace function host_end_notice(p_token text, p_notice uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev uuid := host_event(p_token);
begin
  update notices set expires_at = now() where id = p_notice and event_id = ev;
  return jsonb_build_object('ok', true);
end $$;

create or replace function host_set_crowd(p_token text, p_place uuid, p_crowd text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev uuid := host_event(p_token);
begin
  if p_crowd is not null and p_crowd not in ('low', 'mid', 'high') then raise exception '혼잡도 값이 맞지 않아요.'; end if;
  update places set crowd = p_crowd where id = p_place and event_id = ev;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function host_board(text), host_post_notice(text, text, text, boolean), host_end_notice(text, uuid), host_set_crowd(text, uuid, text) to anon, authenticated;
