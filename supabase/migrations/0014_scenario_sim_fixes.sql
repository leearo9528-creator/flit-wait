-- 2026-10-12 시나리오 시뮬레이션(32케이스) 결과 보완 — 프로덕션 적용 완료 (apply_migration: sim2_fixes)
-- 1) normalize_phone: +82 10… → 010… (국제형식으로 접수해도 중복 체크·알림톡 발송이 국내형식과 일치)
-- 2) assert_name: 공백 이름 거부, 30자 상한 — join_queue / reserve_slot 에 적용
-- 3) cancel_ticket: 회차 예약은 cancel_until_before_min(기본 120분) 을 서버에서 강제 (UI 만 막으면 RPC 직접 호출로 우회 가능)
-- 4) staff_update_ticket 'restore': 회차 예약 복구 시 정원 검사 (복구로 초과예약 발생 방지). 대기열 복구는 정원 무관
-- 5) admin_generate_slots: 같은 부스·같은 시각 회차가 있으면 건너뜀 (중복 생성 방지), 정원·시간 1 이상 검사
-- 함수 본문은 Supabase 대시보드 > Database > Functions 가 정본. 아래는 핵심 변경만 발췌.

create or replace function public.normalize_phone(p text) returns text
language sql immutable set search_path = public as $$
  select case when d like '82%' and length(d) in (11,12) then '0' || substr(d, 3) else d end
  from (select nullif(regexp_replace(coalesce(p,''), '\D', '', 'g'), '') d) x
$$;

create or replace function public.assert_name(p text) returns text
language plpgsql immutable as $$
begin
  if p is null or length(trim(p)) = 0 then raise exception '이름을 입력해 주세요.'; end if;
  if length(trim(p)) > 30 then raise exception '이름은 30자 이내로 입력해 주세요.'; end if;
  return trim(p);
end $$;
revoke execute on function public.assert_name(text) from anon, authenticated, public;

-- cancel_ticket 추가 분기:
--   if t.slot_id is not null and now() > s.starts_at - make_interval(mins => coalesce((b.settings->>'cancel_until_before_min')::int, 120))
--     then raise exception '취소 가능 시간이 지났습니다. 부스 스태프에게 문의해 주세요.';
-- staff_update_ticket 'restore' 추가 분기:
--   if t.slot_id is not null and used + t.party_size > capacity then raise exception '회차 정원이 가득 차 복구할 수 없습니다. (남은 자리 N석)';
-- admin_generate_slots 루프:
--   if exists (select 1 from slots where booth_id = p_booth and starts_at = st and status <> 'cancelled') then continue; end if;
