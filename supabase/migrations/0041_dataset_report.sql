-- ⚠️ 일부만 프로덕션 적용 (2026-11-10): event_views 기본 키 교체(아래 drop constraint / add primary key 두 줄)는 사용자 확인이 필요해 보류.
--    그때까지 프로덕션 track_view 는 0038 본문(시간대 구분 없음)이라 리포트의 '시간대별 유입'만 비어 있다.
--    남은 작업: 아래 두 줄 + 이 파일의 track_view 를 SQL 편집기에서 실행. 나머지(hour 컬럼·crowd_log·places_crowd_touch·admin_event_dataset)는 적용 완료
-- 1) event_views 에 시간대(hour) — 시간대별 유입 그래프. 0038 이 아직 프로덕션에 안 올라가 PK 를 바꿔도 데이터 손실 없음
-- 2) crowd_log — 혼잡도 변경 이력 (스태프가 누를 때마다 한 줄) → "구역별 혼잡 지속 시간"
-- 3) admin_event_dataset — 동선(스탬프 시각)·시간대 유입·혼잡 이력 집계. 방문·대기·설문은 기존 RPC 그대로 쓴다

alter table event_views drop constraint if exists event_views_pkey;
alter table event_views add column if not exists hour smallint not null default -1;
alter table event_views add primary key (event_id, day, hour, page);

create or replace function track_view(p_slug text, p_page text) returns void
language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_hour smallint := extract(hour from (now() at time zone 'Asia/Seoul'))::smallint;
begin
  if p_page !~ '^[a-z_]{1,24}$' then return; end if;
  select id into v_event from events where slug = p_slug;
  if v_event is null then return; end if;
  insert into event_views(event_id, day, hour, page, count) values (v_event, kst_today(), v_hour, p_page, 1)
  on conflict (event_id, day, hour, page) do update set count = event_views.count + 1;
end $$;

create table if not exists crowd_log (
  id bigserial primary key,
  event_id uuid not null references events(id) on delete cascade,
  place_id uuid not null references places(id) on delete cascade,
  crowd text,                     -- null = 해제
  at timestamptz not null default now()
);
create index if not exists crowd_log_event_idx on crowd_log(event_id, at);
alter table crowd_log enable row level security;
drop policy if exists crowd_log_admin on crowd_log;
create policy crowd_log_admin on crowd_log for select using (is_admin(event_id));

create or replace function places_crowd_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.crowd is distinct from old.crowd then
    new.crowd_updated_at := case when new.crowd is null then null else now() end;
    insert into crowd_log(event_id, place_id, crowd) values (new.event_id, new.id, new.crowd);
  end if;
  return new;
end $$;

-- 동선·시간대·혼잡 집계
create or replace function admin_event_dataset(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_admin(p_event) then null else jsonb_build_object(
    -- 시간대별 유입 (홈 진입, 전 일자 합)
    'views_by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', hour, 'count', c) order by hour), '[]'::jsonb)
                      from (select hour, sum(count) c from event_views where event_id = p_event and hour >= 0 and page = 'home' group by hour) x),
    -- 동선: 카드별 첫·마지막 스탬프 → 체류(분), 지점 도달률, 첫 지점 분포, 지점 간 이동 상위
    'journey', (with cards as (
        select c.id, min(st.created_at) first_at, max(st.created_at) last_at, count(*) n
        from stamp_cards c join stamps st on st.card_id = c.id where c.event_id = p_event group by c.id
      ), ordered as (
        select st.card_id, st.spot_id, st.created_at, row_number() over (partition by st.card_id order by st.created_at) rn
        from stamps st join stamp_cards c on c.id = st.card_id where c.event_id = p_event
      )
      select jsonb_build_object(
        'cards', (select count(*) from cards),
        'cards_2plus', (select count(*) from cards where n >= 2),
        'dwell_median_min', (select round(percentile_cont(0.5) within group (order by extract(epoch from (last_at - first_at)) / 60)) from cards where n >= 2),
        'dwell_avg_min', (select round(avg(extract(epoch from (last_at - first_at)) / 60)) from cards where n >= 2),
        'reach', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'cards', (select count(distinct st.card_id) from stamps st where st.spot_id = s.id)) order by s.sort_order), '[]'::jsonb) from stamp_spots s where s.event_id = p_event),
        'first_spot', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'count', c) order by c desc), '[]'::jsonb)
                       from (select o.spot_id, count(*) c from ordered o where o.rn = 1 group by o.spot_id) x join stamp_spots s on s.id = x.spot_id),
        'transitions', (select coalesce(jsonb_agg(jsonb_build_object('from', a.name, 'to', b.name, 'count', c) order by c desc), '[]'::jsonb)
                        from (select o1.spot_id f, o2.spot_id t, count(*) c from ordered o1 join ordered o2 on o2.card_id = o1.card_id and o2.rn = o1.rn + 1 group by 1, 2 order by c desc limit 8) x
                        join stamp_spots a on a.id = x.f join stamp_spots b on b.id = x.t),
        'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'count', c) order by h), '[]'::jsonb)
                    from (select extract(hour from (st.created_at at time zone 'Asia/Seoul'))::int h, count(*) c from stamps st join stamp_cards c on c.id = st.card_id where c.event_id = p_event group by 1) x)
      )),
    -- 혼잡 이력: 구역별 '혼잡' 상태였던 총 분, 변경 횟수
    'crowd', (with log as (
        select l.place_id, l.crowd, l.at, lead(l.at) over (partition by l.place_id order by l.at) next_at from crowd_log l where l.event_id = p_event
      )
      select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'kind', p.kind, 'changes', x.changes, 'high_min', x.high_min, 'mid_min', x.mid_min) order by x.high_min desc), '[]'::jsonb)
      from (select place_id, count(*) changes,
                   round(coalesce(sum(case when crowd = 'high' then extract(epoch from (coalesce(next_at, now()) - at)) / 60 end), 0)) high_min,
                   round(coalesce(sum(case when crowd = 'mid' then extract(epoch from (coalesce(next_at, now()) - at)) / 60 end), 0)) mid_min
            from log group by place_id) x join places p on p.id = x.place_id),
    -- 공지 이력 (긴급 포함) — 운영 기록
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'urgent', urgent, 'at', publish_at) order by publish_at), '[]'::jsonb) from notices where event_id = p_event),
    'vendors', jsonb_build_object('submitted', (select count(*) from vendor_submissions where event_id = p_event), 'approved', (select count(*) from vendor_submissions where event_id = p_event and status = 'approved')),
    'draws', (select coalesce(jsonb_agg(jsonb_build_object('title', d.title, 'entries', (select count(*) from draw_entries e where e.draw_id = d.id), 'winners', d.winners_count)), '[]'::jsonb) from draws d where d.event_id = p_event)
  ) end
$$;
grant execute on function admin_event_dataset(uuid) to authenticated;
