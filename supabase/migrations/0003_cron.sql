-- 스케줄러: 매분 run_scheduler() + notify Edge Function 호출
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vault 에 secrets 저장 (한 번만; 값은 Supabase 대시보드 Vault 에서도 수정 가능)
--   select vault.create_secret('https://mqrafomyngxsixakbnzu.supabase.co', 'project_url');
--   select vault.create_secret('<CRON_SECRET 와 동일한 값>', 'cron_secret');

select cron.schedule('flit-wait-scheduler', '* * * * *', $$ select run_scheduler(); $$);

select cron.schedule('flit-wait-notify', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
$$);
