-- 발송 대행: 솔라피 → 네이버 클라우드(SENS) 알림톡 (본문은 Supabase 적용본 templates_ncp 참조)
alter table templates add column if not exists ncp_template_code text;
alter table templates add column if not exists alimtalk_content text;
alter table templates add column if not exists button_name text;
alter table templates add column if not exists button_link text default 'https://wait.flitunion.com/t/#{token}';
