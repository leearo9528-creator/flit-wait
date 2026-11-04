-- ⚠️ 프로덕션 미적용 (2026-11-04) — Supabase SQL 편집기에서 이 파일 전체를 실행한 뒤 이 줄을 "프로덕션 적용 완료" 로 바꿀 것
-- 2026-11-04 행사장 지도 + 부스 안내 (축제 앱 1단계)
--
-- events.map_image_url : 행사장 배치도 이미지 (Storage images/events/<id>/map-*.webp)
-- events.map_note      : 지도 아래 한 줄 안내 (예: "탄천 사송교~하탑교 구간")
-- events.lat / lng     : 행사장 대표 좌표 — 손님 화면 '행사장까지 길찾기'(카카오맵 링크)
-- places               : 지도 위 핀. 체험부스(booths 와 연결) · 먹거리 · 편의시설 · 무대 · 안내소 등.
--                        x,y 는 배치도 이미지 기준 백분율(0~100) — 이미지 크기가 바뀌어도 위치가 유지된다.
--
-- 손님은 테이블을 직접 읽지 않고 event_guide(p_slug) 만 호출한다 (event_summary 와 같은 패턴, api/public.ts 캐시 경유).
-- 관리자는 places 테이블을 RLS(is_admin(event_id)) 로 직접 편집한다.

alter table events
  add column if not exists map_image_url text,
  add column if not exists map_note text,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  booth_id uuid references booths(id) on delete set null,
  kind text not null default 'booth' check (kind in ('booth','food','market','stage','facility','info','other')),
  name text not null,
  description text,
  hours text,
  image_url text,
  x numeric(5,2) not null default 50 check (x >= 0 and x <= 100),
  y numeric(5,2) not null default 50 check (y >= 0 and y <= 100),
  lat double precision,
  lng double precision,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists places_event_idx on places(event_id, sort_order);

alter table places enable row level security;
drop policy if exists places_admin on places;
create policy places_admin on places for all using (is_admin(event_id)) with check (is_admin(event_id));

-- 손님용: 행사 + 지도 + 핀 (부스와 연결된 핀은 대기 현황을 함께 싣는다)
create or replace function event_guide(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'image_url', e.image_url,
      'map_image_url', e.map_image_url, 'map_note', e.map_note, 'lat', e.lat, 'lng', e.lng
    ),
    'places', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'name', p.name, 'description', p.description, 'hours', p.hours,
        'image_url', p.image_url, 'x', p.x, 'y', p.y, 'lat', p.lat, 'lng', p.lng, 'sort_order', p.sort_order,
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
grant execute on function event_guide(text) to anon, authenticated;
