-- Minimal stand-in for the parts of Supabase that schema.sql uses, so the schema and its RLS
-- policies can be tested on a plain local Postgres (see supabase/tests/run-local.sh).
-- NOT for the real Supabase project: it already has all of this.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id         uuid primary key,
  email      text,
  created_at timestamptz not null default now()
);
-- Supabase reads the signed-in user from the JWT; the tests set it with set_config('request.jwt.claim.sub', ...).
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (id bigserial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
