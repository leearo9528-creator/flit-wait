-- ⚠️ 프로덕션 미적용 (2026-11-04) — 0036 다음에 Supabase SQL 편집기에서 실행
--
-- 축제 앱 2단계 — 기획자가 직접 넣는 콘텐츠 (관리자 RLS 직접 편집, 손님은 RPC 만)
--   programs   타임테이블 (무대·공연·이벤트). place_id 로 지도 핀과 연결
--   notices    공지 (예약 발행 publish_at, 긴급 urgent 는 손님 화면 상단 배너)
--   events.info_text / contact_text   행사 안내 (주차·화장실·셔틀) · 주최 연락처
--   places.menu   먹거리·마켓 핀의 메뉴 [{name, price}]
--   stamp_spots / stamp_cards / stamps   스탬프 투어 — 부스 QR(/e/:slug/stamp/:code) 찍으면 적립, 다 모으면 경품 코드
--   events.stamp_*   스탬프 투어 설정 (켜기, 목표 개수, 경품 안내)

alter table events
  add column if not exists info_text text,
  add column if not exists contact_text text,
  add column if not exists stamp_enabled boolean not null default false,
  add column if not exists stamp_goal int,
  add column if not exists stamp_reward_text text;

alter table places add column if not exists menu jsonb not null default '[]'::jsonb;

create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  place_id uuid references places(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'stage' check (kind in ('stage','event','workshop','other')),
  created_at timestamptz not null default now()
);
create index if not exists programs_event_idx on programs(event_id, starts_at);
alter table programs enable row level security;
drop policy if exists programs_admin on programs;
create policy programs_admin on programs for all using (is_admin(event_id)) with check (is_admin(event_id));

create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  body text,
  urgent boolean not null default false,
  pinned boolean not null default false,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notices_event_idx on notices(event_id, publish_at desc);
alter table notices enable row level security;
drop policy if exists notices_admin on notices;
create policy notices_admin on notices for all using (is_admin(event_id)) with check (is_admin(event_id));

-- 스탬프 투어
create table if not exists stamp_spots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  place_id uuid references places(id) on delete set null,
  name text not null,
  code text not null unique default encode(gen_random_bytes(6), 'hex'),  -- QR 에 들어가는 비밀 코드 (손님이 추측 못 하게)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists stamp_spots_event_idx on stamp_spots(event_id, sort_order);
alter table stamp_spots enable row level security;
drop policy if exists stamp_spots_admin on stamp_spots;
create policy stamp_spots_admin on stamp_spots for all using (is_admin(event_id)) with check (is_admin(event_id));

create table if not exists stamp_cards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  card_token text not null unique,            -- 손님 기기(localStorage)에 저장되는 카드 식별자
  reward_code text,                            -- 목표 달성 시 발급되는 6자리 (스태프가 확인하고 경품 지급)
  completed_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists stamp_cards_event_idx on stamp_cards(event_id, completed_at);
alter table stamp_cards enable row level security;
drop policy if exists stamp_cards_admin on stamp_cards;
create policy stamp_cards_admin on stamp_cards for all using (is_admin(event_id)) with check (is_admin(event_id));

create table if not exists stamps (
  card_id uuid not null references stamp_cards(id) on delete cascade,
  spot_id uuid not null references stamp_spots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, spot_id)
);
alter table stamps enable row level security;
drop policy if exists stamps_admin on stamps;
create policy stamps_admin on stamps for all using (is_admin((select event_id from stamp_cards where id = card_id)));

-- ───────── 손님용 RPC

-- 일정·공지·안내 (엣지 캐시 경유 — 모두에게 같은 응답)
create or replace function event_schedule(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice,
                                'starts_at', e.starts_at, 'ends_at', e.ends_at, 'info_text', e.info_text, 'contact_text', e.contact_text,
                                'stamp_enabled', e.stamp_enabled, 'image_url', e.image_url, 'map_image_url', e.map_image_url,
                                'booth_count', (select count(*) from booths b where b.event_id = e.id)),
    'programs', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'description', p.description, 'starts_at', p.starts_at, 'ends_at', p.ends_at, 'kind', p.kind,
        'place', case when pl.id is null then null else jsonb_build_object('id', pl.id, 'name', pl.name) end
      ) order by p.starts_at), '[]'::jsonb)
      from programs p left join places pl on pl.id = p.place_id where p.event_id = e.id),
    'notices', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'body', n.body, 'urgent', n.urgent, 'pinned', n.pinned, 'publish_at', n.publish_at
      ) order by n.pinned desc, n.publish_at desc), '[]'::jsonb)
      from notices n where n.event_id = e.id and n.publish_at <= now() and (n.expires_at is null or n.expires_at > now()))
  )
  from events e where e.slug = p_slug
$$;
grant execute on function event_schedule(text) to anon, authenticated;

-- event_guide 에 menu · stamp_enabled 추가 (0036 본문 + 두 필드)
create or replace function event_guide(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'image_url', e.image_url,
      'map_image_url', e.map_image_url, 'map_note', e.map_note, 'lat', e.lat, 'lng', e.lng, 'stamp_enabled', e.stamp_enabled
    ),
    'places', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'name', p.name, 'description', p.description, 'hours', p.hours,
        'image_url', p.image_url, 'x', p.x, 'y', p.y, 'lat', p.lat, 'lng', p.lng, 'sort_order', p.sort_order, 'menu', p.menu,
        'booth', case when b.id is null then null else jsonb_build_object(
          'id', b.id, 'slug', b.slug, 'mode', b.mode, 'is_paused', b.is_paused, 'location', b.location,
          'waiting_teams', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('waiting','called')),
          'today_left', (select coalesce(sum(s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0)),0)
                         from slots s where s.booth_id = b.id and s.status = 'open' and (s.starts_at at time zone 'Asia/Seoul')::date = kst_today() and s.ends_at > now())
        ) end
      ) order by p.sort_order, p.name), '[]'::jsonb)
      from places p left join booths b on b.id = p.booth_id where p.event_id = e.id)
  )
  from events e where e.slug = p_slug
$$;

-- 스탬프 카드 현황 (카드 토큰별 — 캐시 안 탐)
create or replace function stamp_status(p_slug text, p_card text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e events; c stamp_cards; v_total int; v_goal int;
begin
  select * into e from events where slug = p_slug;
  if e.id is null then raise exception '행사를 찾을 수 없습니다.'; end if;
  select count(*) into v_total from stamp_spots where event_id = e.id;
  v_goal := least(coalesce(e.stamp_goal, v_total), v_total);
  select * into c from stamp_cards where event_id = e.id and card_token = p_card;
  return jsonb_build_object(
    'enabled', e.stamp_enabled, 'goal', v_goal, 'total', v_total, 'reward_text', e.stamp_reward_text,
    'spots', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
                 'got', c.id is not null and exists(select 1 from stamps st where st.card_id = c.id and st.spot_id = s.id)) order by s.sort_order, s.name), '[]'::jsonb)
              from stamp_spots s where s.event_id = e.id),
    'count', case when c.id is null then 0 else (select count(*) from stamps where card_id = c.id) end,
    'reward_code', c.reward_code, 'completed_at', c.completed_at, 'redeemed_at', c.redeemed_at
  );
end $$;
grant execute on function stamp_status(text, text) to anon, authenticated;

-- 스탬프 적립 — 부스 QR(/e/:slug/stamp/:code) 를 찍으면 호출. 카드가 없으면 만든다. 목표 달성 시 경품 코드 발급
create or replace function stamp_collect(p_slug text, p_code text, p_card text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; s stamp_spots; c stamp_cards; v_cnt int; v_total int; v_goal int; v_new boolean := false;
begin
  if p_card is null or length(p_card) < 16 or length(p_card) > 64 then raise exception '카드 식별자가 올바르지 않습니다.'; end if;
  select * into e from events where slug = p_slug;
  if e.id is null then raise exception '행사를 찾을 수 없습니다.'; end if;
  if not e.stamp_enabled then raise exception '스탬프 투어가 진행 중이 아니에요.'; end if;
  select * into s from stamp_spots where event_id = e.id and code = p_code;
  if s.id is null then raise exception '등록되지 않은 스탬프 QR 이에요.'; end if;
  select * into c from stamp_cards where event_id = e.id and card_token = p_card;
  if c.id is null then
    insert into stamp_cards(event_id, card_token) values (e.id, p_card) returning * into c;
  end if;
  insert into stamps(card_id, spot_id) values (c.id, s.id) on conflict do nothing;
  v_new := found;
  select count(*) into v_cnt from stamps where card_id = c.id;
  select count(*) into v_total from stamp_spots where event_id = e.id;
  v_goal := least(coalesce(e.stamp_goal, v_total), v_total);
  if v_cnt >= v_goal and c.completed_at is null then
    update stamp_cards set completed_at = now(), reward_code = lpad((floor(random() * 1000000))::int::text, 6, '0') where id = c.id returning * into c;
  end if;
  return jsonb_build_object('spot', s.name, 'new', v_new, 'count', v_cnt, 'goal', v_goal, 'completed', c.completed_at is not null, 'reward_code', c.reward_code);
end $$;
grant execute on function stamp_collect(text, text, text) to anon, authenticated;
