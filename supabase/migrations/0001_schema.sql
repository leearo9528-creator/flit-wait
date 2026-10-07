-- flit-wait v1 schema
create extension if not exists pgcrypto;

-- ───────────────────────── events
create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Seoul',
  status text not null default 'draft' check (status in ('draft','open','closed')),
  privacy_text text not null default '수집 항목: 이름, 휴대폰번호, 인원. 이용 목적: 대기·예약 안내 알림 발송. 보유 기간: 행사 종료 후 7일 이내 파기.',
  data_retention_days int not null default 7,
  notice text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ───────────────────────── booths
create table booths (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  slug text not null unique,
  mode text not null default 'queue' check (mode in ('queue','slot','hybrid')),
  pin_hash text,
  is_paused boolean not null default false,
  sort_order int not null default 0,
  location text,
  settings jsonb not null default '{
    "max_party_size": 4,
    "allow_duplicate_phone": false,
    "queue_close_before_min": 30,
    "notify_ahead_teams": 2,
    "call_valid_min": 5,
    "reserve_open_at": null,
    "reserve_close_before_min": 60,
    "reminders": [{"type":"day_before","hour":19},{"type":"before_min","min":30}],
    "noshow_after_start_min": 10,
    "transfer_noshow_to_queue": true,
    "cancel_until_before_min": 120,
    "sms_fallback": true
  }'::jsonb,
  created_at timestamptz not null default now()
);
create index on booths(event_id);

-- ───────────────────────── slots
create table slots (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references booths(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity > 0),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  created_at timestamptz not null default now()
);
create index on slots(booth_id, starts_at);

-- ───────────────────────── tickets
create table tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  booth_id uuid not null references booths(id) on delete cascade,
  slot_id uuid references slots(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(16),'hex'),
  name text not null,
  phone text,                 -- 010XXXXXXXX (digits only). null = 스태프 대리 접수
  phone_hash text,            -- 중복 접수 검사용
  party_size int not null default 1 check (party_size > 0),
  ticket_no int,              -- 부스별·일자별 순번 (queue)
  ticket_date date not null default (now() at time zone 'Asia/Seoul')::date,
  status text not null default 'waiting'
    check (status in ('waiting','called','checked_in','done','no_show','cancelled')),
  source text not null default 'online' check (source in ('online','onsite','staff','transfer')),
  called_at timestamptz,
  checked_in_at timestamptz,
  notified_ahead boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tickets(booth_id, status, created_at);
create index on tickets(slot_id, status);
create index on tickets(booth_id, phone_hash) where status in ('waiting','called');

-- ───────────────────────── notifications (발송 로그 + 큐)
create table notifications (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  template_code text not null,
  channel text not null default 'alimtalk' check (channel in ('alimtalk','sms')),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_msg_id text,
  error text,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index on notifications(status, scheduled_at);
create index on notifications(ticket_id);

-- ───────────────────────── templates (솔라피 템플릿 ID 매핑)
create table templates (
  code text primary key,            -- Q01, Q02, Q03, R01, R02, R03
  description text,
  solapi_template_id text,          -- 승인 후 입력
  sms_fallback_text text,           -- 알림톡 미승인/실패 시 SMS 본문 (변수 #{} 그대로 사용)
  enabled boolean not null default true
);
insert into templates(code, description, sms_fallback_text) values
 ('Q01','대기 접수 완료','[#{행사명}] #{이름}님 #{부스명} 대기 접수 완료. 대기번호 #{대기번호}번, 앞 #{앞대기수}팀. 현황: #{링크}'),
 ('Q02','순서 임박','[#{행사명}] #{이름}님 #{부스명} 입장까지 #{앞대기수}팀 남았습니다. 부스 근처로 이동해 주세요. (대기번호 #{대기번호}번)'),
 ('Q03','입장 호출','[#{행사명}] #{이름}님 지금 #{부스명}으로 입장해 주세요. #{유효시간}분 내 미도착 시 다음 순서로 넘어갑니다. (대기번호 #{대기번호}번)'),
 ('R01','예약 확정','[#{행사명}] #{이름}님 #{부스명} 예약 확정. 일시 #{일시}, 인원 #{인원}명. 확인/취소: #{링크}'),
 ('R02','리마인드','[#{행사명}] #{이름}님 #{부스명} 체험이 #{일시}에 시작됩니다. 시작 10분 전까지 부스로 와주세요. 확인: #{링크}'),
 ('R03','취소 확인','[#{행사명}] #{이름}님 #{부스명} #{일시} 예약이 취소되었습니다.');

-- ───────────────────────── admins
create table admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,   -- null = 전체 관리자(owner)
  role text not null default 'manager' check (role in ('owner','manager')),
  unique (user_id, event_id)
);

create table audit_logs (
  id bigserial primary key,
  actor text,
  action text not null,
  target_type text,
  target_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ───────────────────────── updated_at trigger
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger tickets_updated before update on tickets for each row execute function set_updated_at();

-- ───────────────────────── helper: is_admin
create or replace function is_admin(p_event uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins a
    where a.user_id = auth.uid()
      and (a.event_id is null or p_event is null or a.event_id = p_event)
  );
$$;

-- ───────────────────────── RLS
alter table events enable row level security;
alter table booths enable row level security;
alter table slots enable row level security;
alter table tickets enable row level security;
alter table notifications enable row level security;
alter table templates enable row level security;
alter table admins enable row level security;
alter table audit_logs enable row level security;

-- 공개 읽기: 행사·부스·회차 (손님 화면용). 티켓은 RPC로만.
create policy events_read on events for select using (true);
create policy booths_read on booths for select using (true);
create policy slots_read on slots for select using (true);

-- 관리자 전체 권한
create policy events_admin on events for all using (is_admin(id)) with check (is_admin(id));
create policy booths_admin on booths for all using (is_admin(event_id)) with check (is_admin(event_id));
create policy slots_admin on slots for all using (is_admin((select event_id from booths where id = booth_id))) with check (is_admin((select event_id from booths where id = booth_id)));
create policy tickets_admin on tickets for all using (is_admin(event_id)) with check (is_admin(event_id));
create policy notifications_admin on notifications for all using (is_admin((select event_id from tickets where id = ticket_id)));
create policy templates_admin on templates for all using (is_admin()) with check (is_admin());
create policy admins_self on admins for select using (user_id = auth.uid() or is_admin());
create policy audit_admin on audit_logs for select using (is_admin());

-- Realtime: tickets 는 RLS 때문에 anon 이 구독 못 함.
-- 대신 공개 테이블 booth_versions 를 트리거로 bump → 클라이언트는 이걸 구독하고 RPC로 재조회.
create table booth_versions (
  booth_id uuid primary key references booths(id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table booth_versions enable row level security;
create policy booth_versions_read on booth_versions for select using (true);

create or replace function bump_booth_version() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into booth_versions(booth_id, version, updated_at)
  values (coalesce(new.booth_id, old.booth_id), 1, now())
  on conflict (booth_id) do update set version = booth_versions.version + 1, updated_at = now();
  return null;
end $$;
create trigger tickets_bump after insert or update or delete on tickets for each row execute function bump_booth_version();
create trigger slots_bump after insert or update or delete on slots for each row execute function bump_booth_version();

alter publication supabase_realtime add table booth_versions;
