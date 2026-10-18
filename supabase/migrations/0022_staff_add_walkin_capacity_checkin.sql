-- 2026-10-18 프로덕션 적용 완료 (행사 전 점검에서 발견)
-- 현장 손님 추가(staff_add_walkin) 보강
-- 1) 회차에 넣을 때 정원 초과를 서버에서 차단 (스태프 폰 여러 대 동시 조작 대비, 행 락)
-- 2) 이미 시작했거나 15분 내 시작하는 회차면 손님이 눈앞에 있는 것이므로 바로 checked_in
--    (waiting 으로 두면 시작 10분 후 자동 노쇼로 넘어가 통계·좌석이 틀어짐). 그 외 미래 회차는 waiting(자리 확보).
create or replace function public.staff_add_walkin(p_booth uuid, p_token text, p_name text, p_party integer, p_slot uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare b booths; s slots; t tickets; n int; used int; v_status text := 'waiting'; v_party int := greatest(coalesce(p_party,1),1);
begin
  b := assert_staff(p_booth, p_token);
  if p_slot is null then
    select coalesce(max(ticket_no),0)+1 into n from tickets where booth_id = b.id and ticket_date = kst_today() and slot_id is null;
  else
    select * into s from slots where id = p_slot and booth_id = b.id for update;
    if not found or s.status <> 'open' then raise exception '추가할 수 없는 회차입니다.'; end if;
    select coalesce(sum(party_size),0) into used from tickets where slot_id = s.id and status in ('waiting','called','checked_in','done');
    if used + v_party > s.capacity then raise exception '회차 정원을 초과합니다. (남은 자리 %석)', s.capacity - used; end if;
    if now() >= s.starts_at - interval '15 minutes' then v_status := 'checked_in'; end if;
  end if;
  insert into tickets(event_id, booth_id, slot_id, name, party_size, ticket_no, source, ticket_date, status, checked_in_at)
  values (b.event_id, b.id, p_slot, coalesce(nullif(trim(p_name),''),'현장'), v_party, n, 'staff',
          coalesce((s.starts_at at time zone 'Asia/Seoul')::date, kst_today()), v_status, case when v_status = 'checked_in' then now() end)
  returning * into t;
  insert into audit_logs(actor, action, target_type, target_id) values ('staff:'||b.slug, 'walkin', 'ticket', t.id);
  return jsonb_build_object('ok', true, 'id', t.id, 'ticket_no', t.ticket_no, 'status', t.status);
end $function$;
