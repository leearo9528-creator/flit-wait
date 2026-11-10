-- 프로덕션 적용 완료 (2026-11-10) — Supabase 마이그레이션으로 적용. 뒤 번호에서 다시 정의되는 함수의 중간 본문은 건너뛰고 최종 본문만 올림
--
-- 축제 앱 3단계 — 기획자 셀프 개설 · 방문 집계 · 결과 리포트
--   create_my_event(...)   로그인한 사용자(이메일 OTP·카카오)가 자기 행사를 만들고 그 행사의 manager 가 된다 (owner 불필요)
--   event_views            손님 화면 진입 집계 (페이지·날짜별 카운트만, 개인정보 없음). track_view RPC 로 적재
--   admin_event_report     리포트 한 장용 집계 (방문·대기·예약·스탬프·공지·일정)

-- 셀프 개설: slug 는 소문자·숫자·하이픈 3~40자. 같은 사용자는 행사 20개까지
create or replace function create_my_event(p_name text, p_slug text, p_starts_at timestamptz, p_ends_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요해요.'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception '행사명을 2자 이상 적어 주세요.'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception '주소(slug)는 영문 소문자·숫자·하이픈 3~40자여야 해요.'; end if;
  if p_ends_at <= p_starts_at then raise exception '종료가 시작보다 늦어야 해요.'; end if;
  if exists (select 1 from events where slug = p_slug) then raise exception '이미 쓰고 있는 주소예요. 다른 주소를 골라 주세요.'; end if;
  if (select count(*) from admins where user_id = v_uid and event_id is not null) >= 20 then raise exception '행사는 20개까지 만들 수 있어요.'; end if;
  insert into events(name, slug, starts_at, ends_at, status, created_by) values (trim(p_name), p_slug, p_starts_at, p_ends_at, 'draft', v_uid) returning id into v_id;
  insert into admins(user_id, event_id, role) values (v_uid, v_id, 'manager');
  return v_id;
end $$;
revoke execute on function create_my_event(text, text, timestamptz, timestamptz) from anon, public;
grant execute on function create_my_event(text, text, timestamptz, timestamptz) to authenticated;

-- 방문 집계 (개인정보 없음)
create table if not exists event_views (
  event_id uuid not null references events(id) on delete cascade,
  day date not null,
  page text not null,
  count int not null default 0,
  primary key (event_id, day, page)
);
alter table event_views enable row level security;
drop policy if exists event_views_admin on event_views;
create policy event_views_admin on event_views for select using (is_admin(event_id));

create or replace function track_view(p_slug text, p_page text) returns void
language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  if p_page !~ '^[a-z_]{1,24}$' then return; end if;
  select id into v_event from events where slug = p_slug;
  if v_event is null then return; end if;
  insert into event_views(event_id, day, page, count) values (v_event, kst_today(), p_page, 1)
  on conflict (event_id, day, page) do update set count = event_views.count + 1;
end $$;
grant execute on function track_view(text, text) to anon, authenticated;

-- 리포트 집계
create or replace function admin_event_report(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_admin(p_event) then null else jsonb_build_object(
    'event', (select jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'stamp_enabled', e.stamp_enabled, 'stamp_goal', e.stamp_goal) from events e where e.id = p_event),
    'views', jsonb_build_object(
      'total', (select coalesce(sum(count),0) from event_views where event_id = p_event),
      'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day), '[]'::jsonb) from (select day, sum(count) c from event_views where event_id = p_event group by day) x),
      'by_page', (select coalesce(jsonb_agg(jsonb_build_object('page', page, 'count', c) order by c desc), '[]'::jsonb) from (select page, sum(count) c from event_views where event_id = p_event group by page) x)
    ),
    'tickets', jsonb_build_object(
      'total', (select count(*) from tickets where event_id = p_event and status <> 'cancelled'),
      'queue', (select count(*) from tickets where event_id = p_event and slot_id is null and status <> 'cancelled'),
      'reserved', (select count(*) from tickets where event_id = p_event and slot_id is not null and status <> 'cancelled'),
      'served', (select count(*) from tickets where event_id = p_event and status in ('checked_in','done')),
      'people', (select coalesce(sum(party_size),0) from tickets where event_id = p_event and status in ('checked_in','done')),
      'no_show', (select count(*) from tickets where event_id = p_event and status = 'no_show'),
      'avg_wait_min', (select round(avg(extract(epoch from (checked_in_at - created_at))/60)) from tickets where event_id = p_event and slot_id is null and checked_in_at is not null),
      'by_booth', (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'mode', b.mode,
          'total', (select count(*) from tickets t where t.booth_id = b.id and t.status <> 'cancelled'),
          'served', (select count(*) from tickets t where t.booth_id = b.id and t.status in ('checked_in','done')),
          'people', (select coalesce(sum(party_size),0) from tickets t where t.booth_id = b.id and t.status in ('checked_in','done')),
          'no_show', (select count(*) from tickets t where t.booth_id = b.id and t.status = 'no_show')
        ) order by b.sort_order), '[]'::jsonb) from booths b where b.event_id = p_event),
      'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb) from (select ticket_date d, count(*) c from tickets where event_id = p_event and status <> 'cancelled' group by 1) x)
    ),
    'stamps', jsonb_build_object(
      'cards', (select count(*) from stamp_cards where event_id = p_event),
      'completed', (select count(*) from stamp_cards where event_id = p_event and completed_at is not null),
      'redeemed', (select count(*) from stamp_cards where event_id = p_event and redeemed_at is not null),
      'stamps', (select count(*) from stamps st join stamp_cards c on c.id = st.card_id where c.event_id = p_event),
      'by_spot', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'count', (select count(*) from stamps st where st.spot_id = s.id)) order by s.sort_order), '[]'::jsonb) from stamp_spots s where s.event_id = p_event)
    ),
    'content', jsonb_build_object(
      'places', (select count(*) from places where event_id = p_event),
      'programs', (select count(*) from programs where event_id = p_event),
      'notices', (select count(*) from notices where event_id = p_event),
      'urgent_notices', (select count(*) from notices where event_id = p_event and urgent)
    ),
    'notifications', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select n.status, count(*) c from notifications n join tickets t on t.id = n.ticket_id where t.event_id = p_event group by 1) y)
  ) end
$$;
grant execute on function admin_event_report(uuid) to authenticated;
