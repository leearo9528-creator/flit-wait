-- 프로덕션 적용 완료 (2026-11-10)
-- 스태프 화면 대기 목록에 defer_count 를 내려 준다 — 손님이 순서를 미룬 표에 '순서 미룸' 표시.
-- staff_board(uuid,text,date) 본문에서 대기 목록(queue) 항목에 한 칸만 더한다. 본문이 예상과 다르면 아무것도 바꾸지 않는다.
do $$
declare src text; old text := E'''source'', t.source\n      ) order by t.created_at, t.ticket_no)'; neu text := E'''source'', t.source, ''defer_count'', t.defer_count\n      ) order by t.created_at, t.ticket_no)';
begin
  src := pg_get_functiondef('public.staff_board(uuid,text,date)'::regprocedure);
  if position('''defer_count'', t.defer_count' in src) > 0 then return; end if;   -- 이미 적용됨
  if (length(src) - length(replace(src, old, ''))) / length(old) <> 1 then raise exception 'staff_board 본문이 예상과 달라 바꾸지 않았어요'; end if;
  execute replace(src, old, neu);
end $$;
