-- 2026-11-08: AI가 쓴 노래 검색어 (specs/haru-gemini-text-ai.spl)
-- 이미 schema.sql로 만든 DB에 이 파일만 실행하면 됩니다. (schema.sql 전체를 다시 실행해도 같은 결과)
-- Supabase 대시보드 → SQL Editor → 붙여넣기 → Run. 여러 번 실행해도 안전합니다.

-- 그날의 노래 검색어 (장르·분위기 단어만, 1~40자). 본인만 보는 그림 행에만 저장합니다.
alter table public.daily_artworks
  add column if not exists song_query text check (char_length(song_query) between 1 and 40);

-- 그림을 만들 때 검색어도 함께 저장할 수 있게 합니다.
grant insert (user_id, day, style, scene, summary, tags, mood, song_query) on public.daily_artworks to authenticated;

-- 다시 그리기에서도 검색어를 유지합니다.
create or replace function public.redraw_artwork(
  p_day date, p_style text, p_scene text, p_summary text, p_tags text[]
)
returns void language plpgsql security definer set search_path = '' as $$
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
  -- The song and its match key stay with the day (a redraw keeps the picture's song).
  insert into public.daily_artworks (user_id, day, style, scene, summary, tags, mood, weather, time_of_day, song_id, song_query)
    values (uid, p_day, p_style, p_scene, p_summary, coalesce(p_tags, '{}'),
            old.mood, old.weather, old.time_of_day, old.song_id, old.song_query)
    returning id into new_id;

  insert into public.exhibition_items (exhibition_id, artwork_id, position, note)
    select (h ->> 'ex')::uuid, new_id, (h ->> 'pos')::int, h ->> 'note'
      from jsonb_array_elements(hung) h;
end;
$$;
revoke execute on function public.redraw_artwork(date, text, text, text, text[]) from public, anon;
grant execute on function public.redraw_artwork(date, text, text, text, text[]) to authenticated;

-- 확인용: 아래 쿼리에 song_query 한 줄이 나오면 적용된 것입니다.
select column_name, data_type from information_schema.columns where table_name = 'daily_artworks' and column_name = 'song_query';
