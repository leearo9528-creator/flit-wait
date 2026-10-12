-- 2026-10-12 프로덕션 적용 완료 (is_admin_scope_fix)
-- 담당자(manager, event_id 지정) 코드로 로그인하면 행사 미지정 is_admin() 호출이 true 로 평가됐다
-- → admin_codes / templates / audit_logs / admins 정책이 담당자에게도 열려 있었음.
-- 수정: 행사 미지정 = owner 만. 담당자는 자기 행사에만. 접속 코드는 행사 범위 정책 추가.
-- 화면: 행사 목록을 my_admin_scope() 로 필터, '새 행사' 는 owner 만, 행사 상세 URL 직접 진입도 범위 검사.
create or replace function public.is_admin(p_event uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins a
    where a.user_id = auth.uid()
      and (a.event_id is null or (p_event is not null and a.event_id = p_event))
  );
$$;
create policy admin_codes_scoped on admin_codes for all using (is_admin(event_id)) with check (is_admin(event_id));
create or replace function public.my_admin_scope() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner', exists (select 1 from admins where user_id = auth.uid() and event_id is null),
    'event_ids', coalesce((select jsonb_agg(event_id) from admins where user_id = auth.uid() and event_id is not null), '[]'::jsonb)
  );
$$;
revoke execute on function public.my_admin_scope() from anon, public;
grant execute on function public.my_admin_scope() to authenticated;
