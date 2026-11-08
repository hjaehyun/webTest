-- 2026-11-08: 그림 파일 저장 (specs/haru-image-ai.spl)
-- 이미 schema.sql로 만든 DB에 이 파일만 실행하면 됩니다. (schema.sql 전체를 다시 실행해도 같은 결과)
-- Supabase 대시보드 → SQL Editor → 붙여넣기 → Run. 여러 번 실행해도 안전합니다.

-- 1) 버킷 artworks를 비공개로. 이제 URL만으로는 그림을 열 수 없고, 서버가 1시간짜리 서명 URL을 줍니다.
insert into storage.buckets (id, name, public) values ('artworks', 'artworks', false)
  on conflict (id) do update set public = false;

-- 2) 본인 폴더의 파일은 본인이 읽을 수 있게 (업로드·수정·삭제 정책은 이미 있음)
drop policy if exists "artworks bucket: read own files" on storage.objects;
create policy "artworks bucket: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'artworks' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3) 그림 파일 경로. "{user_id}/{YYYY-MM-DD}-{영숫자 32자}.jpg" 형식이고, 첫 칸은 그 그림의 주인이어야 합니다.
alter table public.daily_artworks
  add column if not exists image_path text
    check (image_path ~ '^[0-9a-f-]{36}/[0-9]{4}-[0-9]{2}-[0-9]{2}-[A-Za-z0-9]{32}\.jpg$');
alter table public.daily_artworks drop constraint if exists daily_artworks_image_path_owner;
alter table public.daily_artworks add constraint daily_artworks_image_path_owner
  check (image_path is null or split_part(image_path, '/', 1) = user_id::text);

-- 4) 그림을 만들 때 경로도 함께 저장
grant insert (user_id, day, style, scene, summary, tags, mood, song_query, image_path) on public.daily_artworks to authenticated;

-- 5) 다시 그리기: 새 그림 경로를 받고, 지울 수 있게 이전 경로를 돌려줍니다 (예전 5인자 버전은 지움)
drop function if exists public.redraw_artwork(date, text, text, text, text[]);
create or replace function public.redraw_artwork(
  p_day date, p_style text, p_scene text, p_summary text, p_tags text[], p_image_path text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := auth.uid();
  old    public.daily_artworks%rowtype;
  old_id bigint;
  new_id bigint;
  hung   jsonb;
begin
  if uid is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;

  select * into old from public.daily_artworks
   where user_id = uid and day = p_day
   for update;
  old_id := old.id;
  if old_id is null then
    raise exception '그림이 없는 날이에요' using errcode = 'P0002';
  end if;

  -- Remember where the picture hangs; deleting it cascades to exhibition_items.
  select coalesce(jsonb_agg(jsonb_build_object('ex', exhibition_id, 'pos', position, 'note', note)), '[]')
    into hung
    from public.exhibition_items where artwork_id = old_id;

  delete from public.daily_artworks where id = old_id;
  -- The song and its match key stay with the day (a redraw keeps the picture's song); the image is the new one.
  insert into public.daily_artworks (user_id, day, style, scene, summary, tags, mood, weather, time_of_day, song_id, song_query, image_path)
    values (uid, p_day, p_style, p_scene, p_summary, coalesce(p_tags, '{}'),
            old.mood, old.weather, old.time_of_day, old.song_id, old.song_query, p_image_path)
    returning id into new_id;

  insert into public.exhibition_items (exhibition_id, artwork_id, position, note)
    select (h ->> 'ex')::uuid, new_id, (h ->> 'pos')::int, h ->> 'note'
      from jsonb_array_elements(hung) h;

  return old.image_path; -- null when the old picture had no file
end;
$$;
revoke execute on function public.redraw_artwork(date, text, text, text, text[], text) from public, anon;
grant execute on function public.redraw_artwork(date, text, text, text, text[], text) to authenticated;

-- 확인용: public 이 false 이고, image_path 한 줄이 나오면 적용된 것입니다.
select id, public from storage.buckets where id = 'artworks';
select column_name from information_schema.columns where table_name = 'daily_artworks' and column_name = 'image_path';
