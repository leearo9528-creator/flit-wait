-- 2026-10-23 11:15 KST 프로덕션 적용 완료
-- 0031 버그: open_override_date 가 NULL 인 부스(= 대부분)에서 `opened_today := (NULL = '2026-10-23')` 이 NULL 이 되고,
-- `if now() < starts_at and not NULL` 은 거짓으로 평가돼 **행사 시작 전 잠금이 통째로 무시**됐다 (약 9시간 동안, 성남은 그 사이 10:00 에 정상 시작해 실제 영향 없음).
-- 교훈: plpgsql boolean 변수에 비교식을 넣을 때는 항상 coalesce(..., false). 검증은 "막혀야 하는 케이스"부터 돌린다.
create or replace function public.join_queue(p_slug text, p_name text, p_phone text, p_party integer, p_consent boolean)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare b booths; e events; ph text; t tickets; n int; st jsonb; nm text; opened_today boolean;
begin
  if not p_consent then raise exception '개인정보 수집·이용에 동의해 주세요.'; end if;
  nm := assert_name(p_name);
  select * into b from booths where slug = p_slug for update;
  if not found then raise exception '부스를 찾을 수 없습니다.'; end if;
  select * into e from events where id = b.event_id;
  if e.status <> 'open' then raise exception '현재 접수 기간이 아닙니다.'; end if;
  st := b.settings;
  opened_today := coalesce((st->>'open_override_date') = kst_today()::text, false);
  if now() < e.starts_at and not opened_today then raise exception '행사 시작 전입니다. % 부터 접수할 수 있어요.', to_char(e.starts_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI'); end if;
  if b.mode = 'slot' then raise exception '이 부스는 예약제로 운영됩니다.'; end if;
  if b.is_paused then
    if st->>'pause_mode' = 'closed_today' then raise exception '오늘 접수가 마감되었습니다.'; end if;
    raise exception '현재 접수가 일시 중단되었습니다. 잠시 후 다시 시도해 주세요.';
  end if;
  case queue_window_state(st)
    when 'before_open' then raise exception '오늘 대기 접수는 % 부터 받습니다.', st->>'queue_open_daily_time';
    when 'after_close' then raise exception '오늘 접수가 마감되었습니다. (% 마감)', st->>'queue_close_daily_time';
    else null;
  end case;
  if p_party < 1 or p_party > coalesce((st->>'max_party_size')::int, 4) then
    raise exception '인원은 1~%명까지 접수할 수 있습니다.', coalesce((st->>'max_party_size')::int, 4);
  end if;
  if now() > e.ends_at - make_interval(mins => coalesce((st->>'queue_close_before_min')::int, 30)) then
    raise exception '오늘 접수가 마감되었습니다.';
  end if;
  ph := normalize_phone(p_phone);
  if ph is null or length(ph) < 10 then raise exception '휴대폰번호를 확인해 주세요.'; end if;
  if not coalesce((st->>'allow_duplicate_phone')::boolean, false) then
    if exists (select 1 from tickets where booth_id = b.id and phone_hash = md5(ph) and ticket_date = kst_today() and status in ('waiting','called')) then
      raise exception '이미 이 부스에 대기 중인 번호입니다.';
    end if;
  end if;
  select coalesce(max(ticket_no),0)+1 into n from tickets where booth_id = b.id and ticket_date = kst_today() and slot_id is null;
  insert into tickets(event_id, booth_id, name, phone, phone_hash, party_size, ticket_no, source)
  values (b.event_id, b.id, nm, ph, md5(ph), p_party, n, 'onsite') returning * into t;
  perform enqueue_notification(t.id, 'Q01');
  return jsonb_build_object('token', t.token, 'ticket_no', t.ticket_no, 'ahead', ahead_count(t.id));
end $function$;
