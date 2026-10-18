-- 2026-10-18 프로덕션 적용 완료
-- 손님 목록 썸네일용 아이콘(booths.icon_url)을 상세 헤더 배너(image_url)와 분리.
-- 성남 주최 측 요청: 목록은 리플렛 아이콘(드론·쿠킹·로봇)으로 구분, 상세는 배너 이미지.
-- 없으면 목록도 image_url 을 쓴다 (BoothThumb).
alter table booths add column if not exists icon_url text;
-- event_summary: 'icon_url', b.icon_url 키 추가 (본문은 0019 와 동일, Supabase 적용본 참조)
