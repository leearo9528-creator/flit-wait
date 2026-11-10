-- 프로덕션 적용 완료 (2026-11-10) — 버튼은 VITE_CUSTOMER_LOGIN=1 일 때만 보인다
-- 손님 로그인(카카오) — 이름·번호를 계정에 저장해 부스마다, 폰을 바꿔도, 다음 행사에서도 다시 적지 않게 한다.
-- 로그인은 선택. 로그인하지 않은 손님은 지금처럼 이름·번호만 적고 쓴다.

create table if not exists customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text,                                   -- 숫자만
  party int not null default 1 check (party between 1 and 20),
  marketing_ok boolean not null default false,  -- '다음 행사 소식 받기' 선택 동의
  marketing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table customer_profiles enable row level security;   -- 정책 없음: 아래 RPC 로만 읽고 쓴다

alter table tickets add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists tickets_user_idx on tickets(user_id, created_at desc) where user_id is not null;

-- 로그인한 손님이 직접 접수한 건만 계정에 묶는다 (스태프 대리 접수 제외, 손님 프로필이 있는 계정만)
create or replace function tickets_set_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null and new.source in ('online','onsite') and auth.uid() is not null
     and exists (select 1 from customer_profiles where user_id = auth.uid()) then
    new.user_id := auth.uid();
  end if;
  return new;
end $$;
revoke execute on function tickets_set_user() from public, anon, authenticated;
drop trigger if exists tickets_set_user on tickets;
create trigger tickets_set_user before insert on tickets for each row execute function tickets_set_user();

create or replace function my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'phone', coalesce(phone, ''), 'party', party, 'marketing_ok', marketing_ok)
  from customer_profiles where user_id = auth.uid()
$$;

create or replace function save_my_profile(p_name text, p_phone text, p_party int, p_marketing boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := normalize_phone(p_phone); v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요해요.'; end if;
  if ph is not null and length(ph) < 10 then raise exception '휴대폰번호를 확인해 주세요.'; end if;
  insert into customer_profiles(user_id, name, phone, party, marketing_ok, marketing_at)
  values (v_uid, left(trim(coalesce(p_name, '')), 20), ph, least(greatest(coalesce(p_party, 1), 1), 20), coalesce(p_marketing, false), case when p_marketing then now() end)
  on conflict (user_id) do update set
    name = excluded.name, phone = excluded.phone, party = excluded.party,
    marketing_at = case when excluded.marketing_ok and not customer_profiles.marketing_ok then now() when not excluded.marketing_ok then null else customer_profiles.marketing_at end,
    marketing_ok = excluded.marketing_ok, updated_at = now();
  return my_profile();
end $$;

-- 내 정보 지우기 — 프로필을 지우고 접수 내역과 계정의 연결을 끊는다
create or replace function delete_my_profile() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  update tickets set user_id = null where user_id = auth.uid();
  delete from customer_profiles where user_id = auth.uid();
end $$;

-- 내 접수·예약 (find_my_tickets 와 같은 모양)
create or replace function my_tickets(p_event_slug text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('token', t.token, 'booth', b.name, 'status', t.status, 'ticket_no', t.ticket_no,
           'slot_at', s.starts_at, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
  from tickets t join booths b on b.id = t.booth_id join events e on e.id = t.event_id left join slots s on s.id = t.slot_id
  where auth.uid() is not null and t.user_id = auth.uid() and e.slug = p_event_slug and t.created_at > now() - interval '14 days'
$$;

revoke execute on function my_profile(), save_my_profile(text, text, int, boolean), delete_my_profile(), my_tickets(text) from public, anon;
grant execute on function my_profile(), save_my_profile(text, text, int, boolean), delete_my_profile(), my_tickets(text) to authenticated;
