-- 프로덕션 적용 완료 (2026-11-10) — Supabase 마이그레이션으로 적용. 뒤 번호에서 다시 정의되는 함수의 중간 본문은 건너뛰고 최종 본문만 올림
--
-- 축제 앱 4단계 — 겨울 페어·연말 마켓용
--   events.accent_color / template      테마 색(행사 홈·버튼) · 생성 템플릿 이름(기록용)
--   events.vendor_token                 셀러·푸드트럭 셀프 등록 링크 (/v/:token). 기획자가 단톡방에 뿌리면 업체가 직접 메뉴·사진을 올린다
--   vendor_submissions                  셀프 등록 접수 → 기획자 승인 시 places 로 들어간다
--   draws / draw_entries                럭키드로우 (응모: 이름·전화, 스탬프 완주자 한정 옵션, 당첨 추첨은 관리자 RPC)
--   surveys / survey_responses          만족도 설문 (질문 jsonb, 응답은 기기 카드 토큰당 1회)

alter table events
  add column if not exists accent_color text,
  add column if not exists template text,
  add column if not exists vendor_token text unique default encode(gen_random_bytes(9), 'hex'),
  add column if not exists vendor_open boolean not null default false;

-- ───────── 셀러 셀프 등록
create table if not exists vendor_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  kind text not null default 'market' check (kind in ('market','food','booth','other')),
  name text not null,
  description text,
  menu jsonb not null default '[]'::jsonb,
  image_url text,
  contact text,                     -- 업체 연락처 (관리자만 봄)
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  place_id uuid references places(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists vendor_submissions_event_idx on vendor_submissions(event_id, status, created_at);
alter table vendor_submissions enable row level security;
drop policy if exists vendor_submissions_admin on vendor_submissions;
create policy vendor_submissions_admin on vendor_submissions for all using (is_admin(event_id)) with check (is_admin(event_id));

create or replace function vendor_info(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('event_name', e.name, 'slug', e.slug, 'open', e.vendor_open, 'starts_at', e.starts_at, 'ends_at', e.ends_at)
  from events e where e.vendor_token = p_token
$$;
grant execute on function vendor_info(text) to anon, authenticated;

create or replace function vendor_submit(p_token text, p_kind text, p_name text, p_description text, p_menu jsonb, p_image_url text, p_contact text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e events; v_id uuid;
begin
  select * into e from events where vendor_token = p_token;
  if e.id is null then raise exception '등록 링크가 올바르지 않아요.'; end if;
  if not e.vendor_open then raise exception '지금은 셀러 등록을 받지 않아요.'; end if;
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 60 then raise exception '업체명을 적어 주세요.'; end if;
  if p_contact is null or length(regexp_replace(p_contact, '\D', '', 'g')) < 9 then raise exception '연락처를 적어 주세요.'; end if;
  if p_kind not in ('market','food','booth','other') then raise exception '구분이 올바르지 않아요.'; end if;
  if (select count(*) from vendor_submissions where event_id = e.id and created_at > now() - interval '1 day') > 500 then raise exception '접수가 많아 잠시 후 다시 시도해 주세요.'; end if;
  insert into vendor_submissions(event_id, kind, name, description, menu, image_url, contact)
    values (e.id, p_kind, trim(p_name), nullif(trim(coalesce(p_description,'')), ''), coalesce(p_menu, '[]'::jsonb), p_image_url, p_contact) returning id into v_id;
  return v_id;
end $$;
grant execute on function vendor_submit(text, text, text, text, jsonb, text, text) to anon, authenticated;

-- 승인: 제출 내용을 places 로 복사(핀 자리는 가운데, 기획자가 지도에서 옮긴다)
create or replace function admin_vendor_approve(p_submission uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s vendor_submissions; v_place uuid;
begin
  select * into s from vendor_submissions where id = p_submission;
  if s.id is null or not is_admin(s.event_id) then raise exception '권한이 없어요.'; end if;
  if s.status = 'approved' and s.place_id is not null then return s.place_id; end if;
  insert into places(event_id, kind, name, description, menu, image_url, x, y, sort_order)
    values (s.event_id, case when s.kind = 'other' then 'other' else s.kind end, s.name, s.description, s.menu, s.image_url, 50, 50,
            (select coalesce(max(sort_order),0) + 10 from places where event_id = s.event_id)) returning id into v_place;
  update vendor_submissions set status = 'approved', place_id = v_place where id = s.id;
  return v_place;
end $$;
grant execute on function admin_vendor_approve(uuid) to authenticated;

-- ───────── 럭키드로우
create table if not exists draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  prize text,
  description text,
  draw_at timestamptz,
  winners_count int not null default 1 check (winners_count between 1 and 500),
  require_stamp boolean not null default false,     -- 스탬프 완주자만 응모
  status text not null default 'open' check (status in ('draft','open','closed','drawn')),
  created_at timestamptz not null default now()
);
create index if not exists draws_event_idx on draws(event_id, created_at);
alter table draws enable row level security;
drop policy if exists draws_admin on draws;
create policy draws_admin on draws for all using (is_admin(event_id)) with check (is_admin(event_id));

create table if not exists draw_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references draws(id) on delete cascade,
  card_token text not null,
  name text not null,
  phone text not null,
  won boolean not null default false,
  created_at timestamptz not null default now(),
  unique (draw_id, card_token),
  unique (draw_id, phone)
);
alter table draw_entries enable row level security;
drop policy if exists draw_entries_admin on draw_entries;
create policy draw_entries_admin on draw_entries for all using (is_admin((select event_id from draws where id = draw_id)));

-- 손님: 응모 가능한 추첨 목록 + 내 응모·당첨 여부 (전화번호는 뒷자리만)
create or replace function draw_status(p_slug text, p_card text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'title', d.title, 'prize', d.prize, 'description', d.description, 'draw_at', d.draw_at, 'winners_count', d.winners_count,
    'require_stamp', d.require_stamp, 'status', d.status,
    'entries', (select count(*) from draw_entries x where x.draw_id = d.id),
    'mine', (select jsonb_build_object('name', x.name, 'won', x.won) from draw_entries x where x.draw_id = d.id and x.card_token = p_card),
    'winners', case when d.status = 'drawn' then (select coalesce(jsonb_agg(jsonb_build_object('name', left(x.name,1) || '**', 'phone_tail', right(x.phone, 4)) order by x.created_at), '[]'::jsonb) from draw_entries x where x.draw_id = d.id and x.won) else '[]'::jsonb end
  ) order by d.draw_at nulls last, d.created_at), '[]'::jsonb)
  from draws d join events e on e.id = d.event_id where e.slug = p_slug and d.status <> 'draft'
$$;
grant execute on function draw_status(text, text) to anon, authenticated;

create or replace function draw_enter(p_slug text, p_draw uuid, p_card text, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d draws; e events; ph text; v_goal int; v_cnt int;
begin
  if p_card is null or length(p_card) < 16 or length(p_card) > 64 then raise exception '카드 식별자가 올바르지 않습니다.'; end if;
  select * into e from events where slug = p_slug;
  select * into d from draws where id = p_draw and event_id = e.id;
  if d.id is null then raise exception '추첨을 찾을 수 없어요.'; end if;
  if d.status <> 'open' then raise exception '지금은 응모를 받지 않아요.'; end if;
  if d.draw_at is not null and d.draw_at < now() then raise exception '응모가 마감됐어요.'; end if;
  ph := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  if ph !~ '^01[016789]\d{7,8}$' then raise exception '휴대폰 번호를 확인해 주세요.'; end if;
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 20 then raise exception '이름을 적어 주세요.'; end if;
  if d.require_stamp then
    select count(*) into v_cnt from stamps st join stamp_cards c on c.id = st.card_id where c.event_id = e.id and c.card_token = p_card;
    select least(coalesce(e.stamp_goal, (select count(*) from stamp_spots where event_id = e.id)), (select count(*) from stamp_spots where event_id = e.id)) into v_goal;
    if v_goal = 0 or v_cnt < v_goal then raise exception '스탬프 %개를 모아야 응모할 수 있어요. (지금 %개)', v_goal, v_cnt; end if;
  end if;
  insert into draw_entries(draw_id, card_token, name, phone) values (d.id, p_card, trim(p_name), ph);
  return jsonb_build_object('ok', true, 'entries', (select count(*) from draw_entries where draw_id = d.id));
exception when unique_violation then
  raise exception '이미 응모했어요.';
end $$;
grant execute on function draw_enter(text, uuid, text, text, text) to anon, authenticated;

-- 관리자: 추첨 실행 (무작위, 재실행 시 기존 당첨 초기화)
create or replace function admin_draw_pick(p_draw uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d draws;
begin
  select * into d from draws where id = p_draw;
  if d.id is null or not is_admin(d.event_id) then raise exception '권한이 없어요.'; end if;
  update draw_entries set won = false where draw_id = d.id;
  update draw_entries set won = true where id in (select id from draw_entries where draw_id = d.id order by random() limit d.winners_count);
  update draws set status = 'drawn' where id = d.id;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'phone', phone)), '[]'::jsonb) from draw_entries where draw_id = d.id and won);
end $$;
grant execute on function admin_draw_pick(uuid) to authenticated;

-- ───────── 만족도 설문
create table if not exists surveys (
  event_id uuid primary key references events(id) on delete cascade,
  enabled boolean not null default false,
  title text not null default '오늘 행사, 어떠셨어요?',
  questions jsonb not null default '[]'::jsonb,   -- [{id, type: rating|choice|text, label, options?}]
  thanks text,
  updated_at timestamptz not null default now()
);
alter table surveys enable row level security;
drop policy if exists surveys_admin on surveys;
create policy surveys_admin on surveys for all using (is_admin(event_id)) with check (is_admin(event_id));

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  card_token text not null,
  answers jsonb not null,
  created_at timestamptz not null default now(),
  unique (event_id, card_token)
);
alter table survey_responses enable row level security;
drop policy if exists survey_responses_admin on survey_responses;
create policy survey_responses_admin on survey_responses for select using (is_admin(event_id));

create or replace function survey_get(p_slug text, p_card text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('enabled', coalesce(s.enabled, false), 'title', s.title, 'questions', coalesce(s.questions, '[]'::jsonb), 'thanks', s.thanks,
    'done', exists (select 1 from survey_responses r where r.event_id = e.id and r.card_token = p_card))
  from events e left join surveys s on s.event_id = e.id where e.slug = p_slug
$$;
grant execute on function survey_get(text, text) to anon, authenticated;

create or replace function survey_submit(p_slug text, p_card text, p_answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e events; s surveys;
begin
  if p_card is null or length(p_card) < 16 or length(p_card) > 64 then raise exception '카드 식별자가 올바르지 않습니다.'; end if;
  select * into e from events where slug = p_slug;
  select * into s from surveys where event_id = e.id;
  if s.event_id is null or not s.enabled then raise exception '지금은 설문을 받지 않아요.'; end if;
  if jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 8000 then raise exception '답변 형식이 올바르지 않아요.'; end if;
  insert into survey_responses(event_id, card_token, answers) values (e.id, p_card, p_answers)
  on conflict (event_id, card_token) do update set answers = excluded.answers, created_at = now();
end $$;
grant execute on function survey_submit(text, text, jsonb) to anon, authenticated;

-- 관리자: 설문 집계 (평점 평균·선택 분포·주관식 목록)
create or replace function admin_survey_summary(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s surveys; q jsonb; out jsonb := '[]'::jsonb; qid text; qtype text;
begin
  if not is_admin(p_event) then return null; end if;
  select * into s from surveys where event_id = p_event;
  if s.event_id is null then return jsonb_build_object('responses', 0, 'questions', '[]'::jsonb); end if;
  for q in select * from jsonb_array_elements(s.questions) loop
    qid := q->>'id'; qtype := q->>'type';
    out := out || jsonb_build_object('id', qid, 'label', q->>'label', 'type', qtype,
      'avg', case when qtype = 'rating' then (select round(avg((answers->>qid)::numeric), 2) from survey_responses where event_id = p_event and answers ? qid and answers->>qid ~ '^\d+$') end,
      'dist', case when qtype in ('rating','choice') then (select coalesce(jsonb_object_agg(v, c), '{}'::jsonb) from (select answers->>qid v, count(*) c from survey_responses where event_id = p_event and answers ? qid group by 1) x) end,
      'texts', case when qtype = 'text' then (select coalesce(jsonb_agg(answers->>qid order by created_at desc), '[]'::jsonb) from survey_responses where event_id = p_event and answers ? qid and length(answers->>qid) > 0) end);
  end loop;
  return jsonb_build_object('responses', (select count(*) from survey_responses where event_id = p_event), 'questions', out);
end $$;
grant execute on function admin_survey_summary(uuid) to authenticated;

-- event_schedule 에 테마·설문·추첨 유무 추가 (0037 본문 + 세 필드)
create or replace function event_schedule(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'notice', e.notice,
                                'starts_at', e.starts_at, 'ends_at', e.ends_at, 'info_text', e.info_text, 'contact_text', e.contact_text,
                                'stamp_enabled', e.stamp_enabled, 'image_url', e.image_url, 'map_image_url', e.map_image_url,
                                'booth_count', (select count(*) from booths b where b.event_id = e.id),
                                'accent_color', e.accent_color,
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

-- 리포트에 설문·추첨 (0038 본문 재정의 대신 보조 RPC — AdminReport 가 둘을 합친다)
create or replace function admin_event_report_extra(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_admin(p_event) then null else jsonb_build_object(
    'survey', admin_survey_summary(p_event),
    'draws', (select coalesce(jsonb_agg(jsonb_build_object('title', d.title, 'status', d.status, 'entries', (select count(*) from draw_entries x where x.draw_id = d.id), 'winners', d.winners_count)), '[]'::jsonb) from draws d where d.event_id = p_event),
    'vendors', jsonb_build_object('pending', (select count(*) from vendor_submissions where event_id = p_event and status = 'pending'),
                                  'approved', (select count(*) from vendor_submissions where event_id = p_event and status = 'approved'))
  ) end
$$;
grant execute on function admin_event_report_extra(uuid) to authenticated;

-- ───────── Storage 정책 보정
-- 기존 "images admin write" 는 is_admin() (행사 미지정 = owner 만) 이라 셀프 가입한 기획자(manager)가 사진을 못 올렸다.
-- → admins 에 한 줄이라도 있으면 업로드 허용. 셀러 셀프 등록은 익명이라 vendors/ 경로만 열어 둔다 (버킷 용량·MIME 제한은 그대로).
drop policy if exists "images admin write" on storage.objects;
create policy "images admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and exists (select 1 from admins where user_id = auth.uid()));
drop policy if exists "images admin update" on storage.objects;
create policy "images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'images' and exists (select 1 from admins where user_id = auth.uid()));
drop policy if exists "images vendor write" on storage.objects;
create policy "images vendor write" on storage.objects for insert to anon
  with check (bucket_id = 'images' and name like 'vendors/%');
