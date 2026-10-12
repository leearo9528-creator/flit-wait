-- 2026-10-12 프로덕션 적용 완료 (admin_code_grant_and_pin4)
-- 1) gen_admin_code: 0011 에서 함께 회수돼 관리자 '코드 발급'이 permission denied → authenticated 에 EXECUTE 복구
--    (난수 문자열 생성뿐, admin_codes INSERT 는 RLS is_admin() 이 막는다)
-- 2) admin_set_pin: 스태프 PIN 4자리 고정 (기존 4~6자리) — 스태프 로그인 화면도 4자리 입력·자동 입장으로 통일
grant execute on function public.gen_admin_code(text) to authenticated;
create or replace function public.admin_set_pin(p_booth uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin((select event_id from booths where id = p_booth)) then raise exception '권한이 없습니다.'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN은 숫자 4자리여야 합니다.'; end if;
  update booths set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_booth;
end $$;
