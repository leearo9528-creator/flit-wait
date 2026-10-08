-- 2026-10-08: 성남 테스트 데이터 삭제 + 쿠킹 회차 재생성(10/23~25 × 14/15/16/17시 · 30분 · 정원 20) + 예약 오픈 10/20 10:00 복구 + 테스트 행사(slug test) 생성
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전(멱등).
begin;
-- (적용본) DELETE 대신 소프트 취소 — 2026-10-08 Supabase 적용 완료. 테스트 티켓은 ticket_date=10/08 이라 행사일 화면엔 안 나온다
update notifications set status='skipped' where status in ('pending','sending') and ticket_id in (select id from tickets where event_id = (select id from events where slug='seongnam-2026'));
update tickets set status='cancelled' where event_id = (select id from events where slug='seongnam-2026') and status <> 'cancelled';
update slots set status='cancelled' where booth_id in (select id from booths where event_id = (select id from events where slug='seongnam-2026')) and status <> 'cancelled';

insert into slots(booth_id, starts_at, ends_at, capacity)
select b.id, (d + tm) at time zone 'Asia/Seoul', (d + tm + interval '30 min') at time zone 'Asia/Seoul', 20
from booths b
cross join unnest(array['2026-10-23','2026-10-24','2026-10-25']::date[]) d
cross join unnest(array['14:00','15:00','16:00','17:00']::time[]) tm
where b.mode='hybrid' and b.event_id=(select id from events where slug='seongnam-2026');

update booths set settings = settings || '{"reserve_open_at":"2026-10-20T10:00:00+09:00"}'::jsonb
where mode='hybrid' and event_id=(select id from events where slug='seongnam-2026');

insert into events(name, slug, starts_at, ends_at, status, privacy_text, data_retention_days, notice)
select '플릿 테스트 행사', 'test', now() - interval '1 day', '2026-12-31 23:59+09', 'open', e.privacy_text, 7, '테스트용 행사입니다. 실제 알림이 발송될 수 있습니다.'
from events e where e.slug='seongnam-2026' and not exists (select 1 from events where slug='test');

insert into booths(event_id, name, slug, mode, location, sort_order, settings, description, pin_hash)
select (select id from events where slug='test'), b.name, 't-' || b.slug, b.mode, b.location, b.sort_order,
       b.settings || '{"reserve_open_at":null}'::jsonb, b.description, extensions.crypt('1234', extensions.gen_salt('bf'))
from booths b where b.event_id=(select id from events where slug='seongnam-2026')
  and not exists (select 1 from booths x where x.slug = 't-' || b.slug);

insert into slots(booth_id, starts_at, ends_at, capacity)
select b.id, (d::date + tm) at time zone 'Asia/Seoul', (d::date + tm + interval '30 min') at time zone 'Asia/Seoul', 20
from booths b
cross join generate_series(kst_today()::timestamp, (kst_today() + 7)::timestamp, interval '1 day') d
cross join unnest(array['14:00','15:00','16:00','17:00']::time[]) tm
where b.mode='hybrid' and b.event_id=(select id from events where slug='test')
  and not exists (select 1 from slots s where s.booth_id = b.id);
commit;

select e.slug, b.slug booth, b.settings->>'reserve_open_at' open_at, (select count(*) from slots s where s.booth_id=b.id) slots, (select count(*) from tickets t where t.booth_id=b.id) tickets
from booths b join events e on e.id=b.event_id order by e.slug desc, b.sort_order;
