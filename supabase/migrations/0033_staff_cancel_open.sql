-- 2026-10-23 11:52 KST 프로덕션 적용 완료
-- 스태프 '오픈 취소' — 수동 오픈(open_override_date)만 지워 예정 시각·행사 시작 규칙으로 되돌린다.
-- 마감(closed_today)과 달리 접수를 막지 않고 기존 티켓도 유지. 잘못 누른 '접수 오픈'의 되돌리기.
create or replace function public.staff_cancel_open(p_booth uuid, p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare b booths;
begin
  b := assert_staff(p_booth, p_token);
  update booths set settings = settings - 'open_override_date' where id = b.id;
  insert into booth_versions(booth_id, version) values (b.id, 1) on conflict (booth_id) do update set version = booth_versions.version+1, updated_at = now();
  insert into audit_logs(actor, action, target_type, target_id) values ('staff:'||b.slug, 'cancel_open', 'booth', b.id);
  return jsonb_build_object('ok', true);
end $function$;
grant execute on function public.staff_cancel_open(uuid, text) to anon, authenticated;
