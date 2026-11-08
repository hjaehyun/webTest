-- 2026-11-08: 조각글의 날씨 (specs/haru-weather.spl)
-- 이미 schema.sql로 만든 DB에 이 파일만 실행하면 됩니다. (schema.sql 전체를 다시 실행해도 같은 결과)
-- Supabase 대시보드 → SQL Editor → 붙여넣기 → Run. 여러 번 실행해도 안전합니다.

-- 조각글을 쓸 때의 날씨(위치를 허용한 경우). 날씨 낱말과 기온만 저장하고 좌표는 저장하지 않습니다.
alter table public.entries
  add column if not exists weather text check (weather in ('clear', 'cloudy', 'overcast', 'rain', 'rain_snow', 'snow', 'shower')),
  add column if not exists temp_c  smallint check (temp_c between -50 and 60);

-- 확인용: weather, temp_c 두 줄이 나오면 적용된 것입니다.
select column_name, data_type from information_schema.columns
 where table_name = 'entries' and column_name in ('weather', 'temp_c') order by column_name;
