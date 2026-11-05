-- RLS test for editing fragments (PATCH /api/me/entries/:id -> updateEntry in src/server/db/data.ts).
-- Run with supabase/tests/run-local.sh. Every check prints [PASS] or raises an error ([FAIL]).

\set ON_ERROR_STOP on

-- Two users. A has an open day (11-05) and a closed day (11-04, has a picture). B is the other user.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test');
insert into public.entries (id, user_id, day, written_at, body) values
  ('e0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-05', '2026-11-05T01:00:00Z', '원래 조각'),
  ('e0000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-04', '2026-11-04T01:00:00Z', '마감한 날 조각');
insert into public.daily_artworks (user_id, day, style, scene, summary)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '2026-11-04', 'water', 'rain', '요약');

create or replace function pg_temp.expect(name text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice '[PASS] %', name; else raise exception '[FAIL] %', name; end if;
end $$;

-- Act as user A through the API's role.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);

-- 1) own fragment on an open day: text changes, time and day stay
with u as (update public.entries set body = '고친 조각' where id = 'e0000000-0000-4000-8000-000000000001' returning 1)
select pg_temp.expect('A edits own fragment on open day (1 row)', (select count(*) from u) = 1);
select pg_temp.expect('text changed, written_at and day unchanged',
  (select body = '고친 조각' and written_at = '2026-11-05T01:00:00Z' and day = '2026-11-05'
     from public.entries where id = 'e0000000-0000-4000-8000-000000000001'));

-- 2) fragment of a closed day: 0 rows (the API answers 404)
with u as (update public.entries set body = 'x' where id = 'e0000000-0000-4000-8000-000000000002' returning 1)
select pg_temp.expect('A cannot edit a closed day (0 rows)', (select count(*) from u) = 0);

-- 3) only the text column may change
do $$ begin
  update public.entries set day = '2026-11-04' where id = 'e0000000-0000-4000-8000-000000000001';
  raise exception '[FAIL] changing day should be refused';
exception when insufficient_privilege then raise notice '[PASS] changing day is refused (column privilege)';
end $$;
do $$ begin
  update public.entries set written_at = now() where id = 'e0000000-0000-4000-8000-000000000001';
  raise exception '[FAIL] changing written_at should be refused';
exception when insufficient_privilege then raise notice '[PASS] changing written_at is refused (column privilege)';
end $$;
do $$ begin
  update public.entries set user_id = 'bbbbbbbb-0000-4000-8000-000000000002' where id = 'e0000000-0000-4000-8000-000000000001';
  raise exception '[FAIL] changing user_id should be refused';
exception when insufficient_privilege then raise notice '[PASS] changing user_id is refused (column privilege)';
end $$;

-- 4) the 140-character limit still holds
do $$ begin
  update public.entries set body = repeat('a', 141) where id = 'e0000000-0000-4000-8000-000000000001';
  raise exception '[FAIL] 141 characters should be refused';
exception when check_violation then raise notice '[PASS] 141-character text is refused (check constraint)';
end $$;

-- 5) another user cannot edit A's fragment
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
with u as (update public.entries set body = '남의 조각' where id = 'e0000000-0000-4000-8000-000000000001' returning 1)
select pg_temp.expect('B cannot edit A''s fragment (0 rows)', (select count(*) from u) = 0);

-- 6) signed out (anon) cannot edit at all
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  update public.entries set body = 'x';
  raise exception '[FAIL] anon update should be refused';
exception when insufficient_privilege then raise notice '[PASS] anon cannot update entries';
end $$;

reset role;
select pg_temp.expect('A''s fragment still reads "고친 조각" after the attacks',
  (select body = '고친 조각' from public.entries where id = 'e0000000-0000-4000-8000-000000000001'));
