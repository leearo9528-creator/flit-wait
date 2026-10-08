-- 2026-10-08 부하 테스트 후: 대기번호 발급·ahead_count 가 하루 티켓 수에 비례하지 않도록 (2,500건에서 10ms → 0.2ms)
create index if not exists tickets_booth_date_no_idx on tickets (booth_id, ticket_date, ticket_no desc) where slot_id is null;
create index if not exists tickets_booth_date_status_created_idx on tickets (booth_id, ticket_date, status, created_at, ticket_no) where slot_id is null;
alter function public.kst_today() stable;
-- booths.group_name (손님 목록 대분류 접기/펼치기) 는 booth_group_name 마이그레이션으로 추가됨
alter table booths add column if not exists group_name text;
