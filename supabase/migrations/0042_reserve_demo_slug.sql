-- 프로덕션 적용 완료 (2026-11-10)
-- 행사 주소 'demo' 는 데모 전용으로 예약 — /e/demo 는 앱이 데모 화면으로 보내므로 실제 행사가 그 주소를 쓰면 열리지 않는다.
-- create_my_event 에 검사 한 줄 추가 (0038 본문 + 예약어 검사)
create or replace function create_my_event(p_name text, p_slug text, p_starts_at timestamptz, p_ends_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요해요.'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception '행사명을 2자 이상 적어 주세요.'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception '주소(slug)는 영문 소문자·숫자·하이픈 3~40자여야 해요.'; end if;
  if p_slug = 'demo' then raise exception '''demo'' 는 데모 전용 주소라 쓸 수 없어요. 다른 주소를 골라 주세요.'; end if;
  if p_ends_at <= p_starts_at then raise exception '종료가 시작보다 늦어야 해요.'; end if;
  if exists (select 1 from events where slug = p_slug) then raise exception '이미 쓰고 있는 주소예요. 다른 주소를 골라 주세요.'; end if;
  if (select count(*) from admins where user_id = v_uid and event_id is not null) >= 20 then raise exception '행사는 20개까지 만들 수 있어요.'; end if;
  insert into events(name, slug, starts_at, ends_at, status, created_by) values (trim(p_name), p_slug, p_starts_at, p_ends_at, 'draft', v_uid) returning id into v_id;
  insert into admins(user_id, event_id, role) values (v_uid, v_id, 'manager');
  return v_id;
end $$;
revoke execute on function create_my_event(text, text, timestamptz, timestamptz) from anon, public;
grant execute on function create_my_event(text, text, timestamptz, timestamptz) to authenticated;
