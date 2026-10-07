-- 성남테크아트페스티벌 탄천마켓 2026 — 부스 구성 시드 (Supabase SQL Editor 에서 1회 실행)
-- 체험부스: 테크놀이터 3개 (현장 대기표) + 쿠킹 클래스 2개 (사전 시간 예약: 또띠아 / 요거트 파르페)

-- 0) 테스트 데이터·이전 구성 정리
delete from tickets where event_id = (select id from events where slug = 'seongnam-2026');
delete from slots where booth_id in (select id from booths where event_id = (select id from events where slug = 'seongnam-2026'));
delete from booths where event_id = (select id from events where slug = 'seongnam-2026');

-- 1) 부스 5개
insert into booths(event_id, name, slug, mode, sort_order, location, settings)
select e.id, v.name, v.slug, v.mode, v.ord, v.loc,
  '{
    "max_party_size": 4, "allow_duplicate_phone": false, "queue_close_before_min": 30,
    "notify_ahead_teams": 2, "call_valid_min": 5, "reserve_open_at": null, "reserve_close_before_min": 60,
    "reminders": [{"type":"day_before","hour":19},{"type":"before_min","min":30}],
    "noshow_after_start_min": 10, "transfer_noshow_to_queue": true, "cancel_until_before_min": 120, "sms_fallback": true
  }'::jsonb || v.extra
from events e,
(values
  ('테크놀이터 1', 'tech-1', 'queue', 1, '탄천마켓 체험존', '{}'::jsonb),
  ('테크놀이터 2', 'tech-2', 'queue', 2, '탄천마켓 체험존', '{}'::jsonb),
  ('테크놀이터 3', 'tech-3', 'queue', 3, '탄천마켓 체험존', '{}'::jsonb),
  ('쿠킹 클래스 · 또띠아 만들기', 'cooking-tortilla', 'hybrid', 4, '탄천마켓 쿠킹존', '{"max_party_size": 2, "reserve_open_at": "2026-10-20T10:00:00+09:00"}'::jsonb),
  ('쿠킹 클래스 · 요거트 파르페 만들기', 'cooking-parfait', 'hybrid', 5, '탄천마켓 쿠킹존', '{"max_party_size": 2, "reserve_open_at": "2026-10-20T10:00:00+09:00"}'::jsonb)
) v(name, slug, mode, ord, loc, extra)
where e.slug = 'seongnam-2026';

-- 2) 쿠킹 회차: 10/24(토)·10/25(일) 11:00 13:00 14:30 16:00 17:30 · 60분 · 8명  (시간은 확정 후 관리자 화면에서 수정 가능)
insert into slots(booth_id, starts_at, ends_at, capacity)
select b.id, (d + tm) at time zone 'Asia/Seoul', ((d + tm) at time zone 'Asia/Seoul') + interval '60 minutes', 8
from booths b
cross join unnest(array['2026-10-24','2026-10-25']::date[]) d
cross join unnest(array['11:00','13:00','14:30','16:00','17:30']::time[]) tm
where b.mode = 'hybrid' and b.event_id = (select id from events where slug = 'seongnam-2026');

-- 3) 스태프 PIN (현장 교육 때 바꿔도 됨)
update booths set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf'))
where event_id = (select id from events where slug = 'seongnam-2026');

-- 4) 관리자: 이메일 계정 불필요. /admin 에서 접속 코드 FLIT-OWNER-2026 (admin_codes 테이블) 로 입장.

select b.name, b.slug, b.mode, (select count(*) from slots s where s.booth_id = b.id) slots from booths b order by sort_order;
