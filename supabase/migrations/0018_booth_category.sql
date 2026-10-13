-- 2026-10-13 프로덕션 적용 완료 (booth_category)
-- 손님 화면을 주문 앱(PAMP) 구조로 재편: 존(group_name) 칩 탭 + 카드(사진·상태 뱃지·카테고리·이름·대기 현황).
-- booths.category = 카드/상세의 소분류 텍스트. event_summary / booth_summary 에 group_name·category 포함.
alter table booths add column if not exists category text;
-- event_summary / booth_summary 본문은 Supabase 에 적용된 버전 참조 (category, group_name 키 추가)
