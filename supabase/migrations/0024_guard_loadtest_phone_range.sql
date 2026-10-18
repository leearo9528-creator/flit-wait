-- 2026-10-18 프로덕션 적용 완료
-- 부하테스트 오발송(총 208건: 15:27 53건, 15:31 155건) 재발 방지.
-- 1) notify Edge Function v8: 010-00xx-xxxx(^01000\d{6}$) 번호는 실발송하지 않고 skipped(TEST_NUMBER)
-- 2) 아래 트리거: 부하테스트 티켓(이름 k6*)이 그 번호대가 아니면 insert 자체를 거부
create or replace function public.guard_loadtest_phone() returns trigger language plpgsql as $$
begin
  if new.name like 'k6%' and new.phone is not null and new.phone !~ '^01000\d{6}$' then
    raise exception '부하테스트 티켓은 테스트 번호대(010-00xx-xxxx)만 허용됩니다.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_loadtest_phone on tickets;
create trigger trg_guard_loadtest_phone before insert on tickets for each row execute function public.guard_loadtest_phone();
