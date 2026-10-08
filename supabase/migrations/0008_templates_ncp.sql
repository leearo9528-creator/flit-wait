-- 발송 대행: 솔라피 → 네이버 클라우드(SENS) 알림톡 (본문은 Supabase 적용본 templates_ncp 참조)
alter table templates add column if not exists ncp_template_code text;
alter table templates add column if not exists alimtalk_content text;
alter table templates add column if not exists button_name text;
alter table templates add column if not exists button_link text default 'https://wait.flitunion.com/t/#{token}';
-- notify_all_actions: Q04 입장 확인 / Q05 대기 노쇼 / Q06 대기 취소 / R04 예약 노쇼 / R05 체크인 완료 추가,
-- staff_update_ticket·cancel_ticket·run_scheduler 에서 해당 시점에 enqueue (본문은 Supabase 적용본 참조)
