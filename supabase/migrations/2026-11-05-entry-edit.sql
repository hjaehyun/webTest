-- 2026-11-05: 조각 수정 (PATCH /api/me/entries/:id)
-- 이미 schema.sql 로 만든 DB에 이 파일만 실행하면 됩니다. (schema.sql 전체를 다시 실행해도 같은 결과)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용 붙여넣기 → Run. 여러 번 실행해도 안전합니다.

-- 본문(body)만 고칠 수 있게 합니다. 날짜/시각/주인은 바꿀 수 없습니다.
revoke update on public.entries from anon, authenticated;
grant update (body) on public.entries to authenticated;

-- 마감 안 한 날의 내 조각만 고칠 수 있습니다.
drop policy if exists "entries: edit on open day" on public.entries;
create policy "entries: edit on open day" on public.entries
  for update to authenticated
  using (user_id = (select auth.uid()) and not public.day_is_closed(user_id, day))
  with check (user_id = (select auth.uid()) and not public.day_is_closed(user_id, day));

-- 확인용: 아래 쿼리 결과에 "entries: edit on open day" 한 줄이 나오면 적용된 것입니다.
select policyname, cmd from pg_policies where tablename = 'entries' order by policyname;
