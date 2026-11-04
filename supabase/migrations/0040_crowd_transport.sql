-- 0040 (2026-11-04) 레퍼런스(페스티컴퍼니·페스티맵·축집사) 대조 후 보강 — ⚠️ 프로덕션 미적용 (0036→0039 다음에 실행)
-- 1) 핀 종류에 주차장·셔틀 정류장·의무실 추가 — 지자체 축제 디지털 가이드의 기본 항목
-- 2) 핀별 수동 혼잡도(여유/보통/혼잡) — 센서 없이 스태프가 관리자 화면에서 누르는 방식. 주차장·푸드존·인기 부스에 쓴다
-- 3) events.directions_text 오시는 길(대중교통·셔틀·주차) — info_text 와 분리해 홈에 '오시는 길' 카드로 띄운다

alter table places drop constraint if exists places_kind_check;
alter table places add constraint places_kind_check
  check (kind in ('booth','food','market','stage','facility','info','parking','shuttle','medical','other'));

alter table places
  add column if not exists crowd text check (crowd in ('low','mid','high')),
  add column if not exists crowd_updated_at timestamptz;

alter table events add column if not exists directions_text text;

-- 혼잡도 갱신: 관리자(RLS) 가 places 를 update 하면 crowd_updated_at 이 따라온다
create or replace function places_crowd_touch() returns trigger language plpgsql as $$
begin
  if new.crowd is distinct from old.crowd then new.crowd_updated_at := case when new.crowd is null then null else now() end; end if;
  return new;
end $$;
drop trigger if exists places_crowd_touch on places;
create trigger places_crowd_touch before update on places for each row execute function places_crowd_touch();

-- event_guide: crowd · crowd_updated_at · directions_text (0037 본문 + 세 필드)
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

-- event_schedule: directions_text · lat · lng (0039 본문 + 세 필드)
create or replace function event_schedule(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice,
                                'starts_at', e.starts_at, 'ends_at', e.ends_at, 'info_text', e.info_text, 'contact_text', e.contact_text,
                                'stamp_enabled', e.stamp_enabled, 'image_url', e.image_url, 'map_image_url', e.map_image_url,
                                'booth_count', (select count(*) from booths b where b.event_id = e.id),
                                'accent_color', e.accent_color, 'directions_text', e.directions_text, 'lat', e.lat, 'lng', e.lng,
                                'survey_enabled', coalesce((select s.enabled from surveys s where s.event_id = e.id), false),
                                'draw_open', exists (select 1 from draws d where d.event_id = e.id and d.status in ('open','drawn'))),
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
