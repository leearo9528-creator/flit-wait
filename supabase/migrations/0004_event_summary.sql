-- 행사 체험부스 목록 (통합 QR 진입점)
create or replace function event_summary(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice, 'starts_at', e.starts_at, 'ends_at', e.ends_at),
    'booths', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'mode', b.mode, 'is_paused', b.is_paused, 'location', b.location,
        'max_party_size', b.settings->>'max_party_size',
        'reserve_open_at', b.settings->>'reserve_open_at',
        'waiting_teams', (select count(*) from tickets t where t.booth_id = b.id and t.slot_id is null and t.ticket_date = kst_today() and t.status in ('waiting','called')),
        'today_slots', (select count(*) from slots s where s.booth_id = b.id and s.status = 'open' and (s.starts_at at time zone 'Asia/Seoul')::date = kst_today() and s.ends_at > now()),
        'today_left', (select coalesce(sum(s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0)),0)
                       from slots s where s.booth_id = b.id and s.status = 'open' and (s.starts_at at time zone 'Asia/Seoul')::date = kst_today() and s.ends_at > now()),
        'total_left', (select coalesce(sum(s.capacity - coalesce((select sum(party_size) from tickets t where t.slot_id = s.id and t.status in ('waiting','called','checked_in','done')),0)),0)
                       from slots s where s.booth_id = b.id and s.status = 'open' and s.ends_at > now())
      ) order by b.sort_order, b.name), '[]'::jsonb)
      from booths b where b.event_id = e.id)
  )
  from events e where e.slug = p_slug
$$;
grant execute on function event_summary(text) to anon, authenticated;
