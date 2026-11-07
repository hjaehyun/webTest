# 그림에 어울리는 노래 추천 — 설계

- 작성: 2026-11-05
- 상태: 초안 (재현님 검토 대기)
- 범위: 하루조각 앱(`haru-jogak/`)에 "오늘의 노래" 기능 추가
- 관련: 날씨 연동(기상청 단기예보, 카카오 로컬)은 **별도 설계**. 이 문서는 날씨 값이 있으면 쓰고 없으면 `unknown`으로 동작한다.

---

## 1. 왜 만드나

- 마감하면 그림 한 장이 나온다. 여기에 그날 분위기에 맞는 노래 한 곡을 붙이면 "그림 + 노래 = 그날"로 기억이 더 진해진다.
- 조사한 그림일기 앱(픽셀로그, 오늘 하루를 그려줘)에는 노래 추천이 없다. Day One은 IFTTT로 Spotify 재생 기록을 가져올 뿐 추천은 아니다. 차별점이 된다.
- 과제 요구사항인 "외부 API 3개"의 하나(YouTube Data API)를 날씨·AI·DB와 한 흐름으로 묶어서 쓴다. 억지로 붙인 API처럼 보이지 않는다.

## 2. 목표 / 비목표 / 안티목표

**목표**
- 그림마다 노래 1곡. 그림 상세와 공개 전시에서 YouTube 임베드로 재생할 수 있다.
- 분위기 + 날씨 + 시간대를 **고정된 단어 목록**의 키로 만들고, 같은 키를 가진 사람들이 노래 풀(`song_pool`)을 공유한다. 풀이 차면 YouTube를 호출하지 않는다.
- 👍 / "다른 곡"으로 반응을 모아 추천 가중치에 반영한다. 사용자가 늘수록 추천이 좋아진다.

**비목표**
- 음원을 직접 저장하거나 재생하지 않는다. 공식 임베드만 쓴다.
- Spotify, 멜론 등 다른 음악 서비스는 쓰지 않는다.
- 임베딩 유사도 검색(pgvector)은 하지 않는다. 고정 단어 키로 충분하다.
- AI가 곡명을 직접 고르는 방식(후보 곡명 → 검색 검증)은 AI 업체가 정해진 뒤 2차로 붙인다. 1차는 키 기반 검색만 한다.

**안티목표 (이렇게 되면 실패)**
- 공유 테이블에서 다른 사람의 일기 내용이나 신원이 드러난다.
- 사용자가 아무 영상이나 풀에 넣을 수 있다.
- 모두가 매번 같은 노래만 받는다.
- 할당량이 바닥나서 마감이 실패한다. 노래는 부가 기능이라 실패해도 그림은 정상으로 남아야 한다.

## 3. 사용자 흐름

1. 오늘 화면에서 "오늘 마감" → 기존 흐름(summarize → draw → `POST /api/me/artworks`)이 그대로 돈다.
2. 그림 저장이 성공하면 클라이언트가 `POST /api/me/artworks/[date]/song`을 호출한다. 실패하면 조용히 넘어간다(그림은 이미 저장됨).
3. 그림 상세(`/gallery/[date]`)의 그림 아래에 노래 카드가 나온다.
   - 곡 제목, 채널, YouTube 임베드(자동재생 끔)
   - 👍 버튼, "다른 곡" 버튼
   - 노래가 없으면(실패, 영상 삭제) "노래 추천받기" 버튼
4. 공개 전시(`/e/[id]`)에서도 그림마다 노래 카드를 보여준다. 반응 버튼은 없다. *(내 판단: 노래는 개인정보가 아니고 전시 경험에 도움이 된다)*

## 4. 매칭 키

키 = `mood | weather | time_of_day`. 세 값 모두 아래 목록에서만 고른다. DB check 제약과 `src/server/validate.ts`를 같은 값으로 맞춘다.

| 축 | 값 (DB id → 검색어 단어) |
|---|---|
| **mood** (10) | `calm` 잔잔한 · `upbeat` 신나는 · `flutter` 설레는 · `proud` 뿌듯한 · `lazy` 나른한 · `tired` 지친 날 위로가 되는 · `blue` 우울할 때 듣는 · `nostalgic` 그리운 · `busy` 바쁜 날 힘나는 · `cozy` 포근한 |
| **weather** (6) | `clear` 맑은 날 · `cloudy` 흐린 날 · `rain` 비 오는 날 · `snow` 눈 오는 날 · `hot` 더운 날 · `unknown` (검색어에서 생략) |
| **time_of_day** (3) | `morning` 아침에 (05–11시) · `day` 오후에 (11–18시) · `night` 밤에 (18–05시) |

- 조합은 10 × 6 × 3 = 180개다.
- **mood**: summarize 단계에서 텍스트 AI가 목록 중 하나를 고른다. mock은 `mock.ts`의 키워드 규칙을 늘려서 정한다(예: 과제·시험 → `busy`, 비 → `calm`, 기본값 `calm`).
- **weather**: 날씨 기능이 붙으면 그날 조각글에 저장된 날씨 중 가장 많은 값을 쓴다. 그 전에는 `unknown`이다.
- **time_of_day**: 그날 조각글의 `written_at`(Asia/Seoul)을 구간별로 세서 가장 많은 구간으로 정한다. 같으면 늦은 구간을 고른다.
- 검색어는 `"{weather} {time} {mood} 노래"` 형식이다. 예: `비 오는 날 밤에 잔잔한 노래`. `unknown`은 단어를 뺀다.

## 5. 데이터 모델 (`supabase/schema.sql`에 추가, 재실행 안전)

```sql
-- Shared song pool. No user_id and no diary text: only the match key and YouTube data.
create table if not exists public.song_pool (
  id          bigint generated always as identity primary key,
  mood        text not null check (mood in ('calm','upbeat','flutter','proud','lazy','tired','blue','nostalgic','busy','cozy')),
  weather     text not null check (weather in ('clear','cloudy','rain','snow','hot','unknown')),
  time_of_day text not null check (time_of_day in ('morning','day','night')),
  video_id    text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title       text not null check (char_length(title) <= 200),
  channel     text not null check (char_length(channel) <= 100),
  fetched_at  timestamptz not null default now(),
  unique (mood, weather, time_of_day, video_id)
);

-- One reaction per user per pool song. Readable only by its owner; counts are aggregated in pick_song().
create table if not exists public.song_feedback (
  user_id uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  song_id bigint not null references public.song_pool (id) on delete cascade,
  vote    smallint not null check (vote in (1, -1)),   -- 1 = 👍, -1 = 다른 곡
  primary key (user_id, song_id)
);

-- The picture's song and its key.
alter table public.daily_artworks
  add column if not exists mood        text check (mood in ('calm','upbeat','flutter','proud','lazy','tired','blue','nostalgic','busy','cozy')),
  add column if not exists weather     text check (weather in ('clear','cloudy','rain','snow','hot','unknown')),
  add column if not exists time_of_day text check (time_of_day in ('morning','day','night')),
  add column if not exists song_id     bigint references public.song_pool (id) on delete set null;
```

- `daily_artworks`의 insert 권한에 `mood`를 추가한다. `weather`·`time_of_day`는 서버가 조각글에서 계산하므로 클라이언트가 보내지 않는다.
- `song_id`, `weather`, `time_of_day`는 `set_artwork_song` RPC로만 바꾼다. 직접 UPDATE 금지(M3)는 그대로 유지한다. 사용자가 RPC를 직접 불러 weather·time_of_day를 바꿀 수는 있지만, 목록 안의 값이고 본인 그림에만 적용되니 허용한다.
- `redraw_artwork()`는 새 행을 만들므로 `mood`, `weather`, `time_of_day`, `song_id`도 새 행에 복사하도록 고친다(13절 4번).
- `song_pool`에 `(mood, weather, time_of_day, fetched_at)` 인덱스를 둔다.
- 노래 제목과 채널은 그림에 복사하지 않고 `song_pool`을 join해서 가져온다. 풀이 30일마다 갱신되니 화면에도 늘 최신 값이 나온다(정책 III.E.4.f).
- `ai_usage.kind`에 `'song'`을 추가한다. `consume_ai_quota('song')` 한도는 하루 10회(처음 추천과 "다른 곡"을 합친 횟수).

**권한**

| 대상 | anon | authenticated | 서버(secret key) |
|---|---|---|---|
| `song_pool` | select (공개 전시용) | select | insert / update / delete |
| `song_feedback` | 없음 | 본인 행만 select / insert / update / delete (RLS) | — |
| `set_artwork_song(p_day, p_song_id, p_weather, p_time)` RPC | 없음 | execute. security definer. 본인 그림에만 적용되고, 존재하는 `song_pool` id(또는 null)만 받음 | — |
| `pick_song(...)` RPC | 없음 | execute. security definer(다른 사람의 피드백도 집계해야 하므로). id 하나만 반환 | — |

풀에 쓰는 건 서버의 secret key 클라이언트(`src/server/supabase.ts`의 admin)만 한다. 그래서 사용자가 직접 영상을 넣을 방법이 없다. 사용자가 할 수 있는 최대치는 "이미 풀에 있는 곡 중 하나를 내 그림에 고르는 것"이고, 이건 허용한다.

## 6. 곡 고르기

`pick_song(p_mood, p_weather, p_time, p_exclude bigint[])` → `song_pool.id` 또는 null

1. 후보: 같은 키이고 `fetched_at > now() - 30 days`인 곡 중 `p_exclude`(본인이 최근 7일에 받은 곡, 지금 곡)를 뺀 것.
2. 가중치: `w = greatest(0.2, 1 + likes - 0.5 * skips)`. likes와 skips는 `song_feedback`을 집계한 값.
3. 가중 랜덤으로 1곡을 고른다.

서버 라우트 `POST /api/me/artworks/[date]/song` (body `{ reroll?: boolean }`):

1. 로그인 확인 → `consume_ai_quota('song')`.
2. 본인 그림과 그날 조각글을 조회한다. 그림이 없으면 404. mood가 없으면 `calm`으로 본다. weather는 없으면 `unknown`, time_of_day는 조각글에서 계산한다(6번에서 함께 저장).
2-1. 30일 지난 풀 행을 지운다(8절).
3. reroll이면 지금 곡에 `-1`을 기록한다(`song_feedback` upsert).
4. 같은 키의 신선한 후보가 3곡 미만이면 → YouTube 검색 → 결과를 풀에 upsert(같은 곡은 `fetched_at`만 갱신).
5. `pick_song`. 그래도 없으면 키를 넓혀서 다시 고른다: (mood, weather, *) → (mood, *, *).
6. `set_artwork_song` → `{ song: { videoId, title, channel } | null }`을 응답한다.

👍는 `POST /api/me/songs/[id]/feedback` `{ vote: 1 | -1 }` → `song_feedback` upsert(사용자 권한, RLS).

## 7. YouTube 검색

`src/server/music/` — AI 제공자와 같은 패턴을 따른다.

- `types.ts`: `MusicProvider { search(query: string): Promise<SongHit[]> }`
- `youtube.ts`: 실제 구현. env `YOUTUBE_API_KEY`(서버 전용)
- `mock.ts`: 고정 결과. `videoId`를 `mock` 접두어로 만들어 UI가 임베드 대신 "모의 곡" 표시를 한다.
- `index.ts`: env `MUSIC_PROVIDER=mock|youtube`, 기본 mock
- `key.ts`: 키 → 검색어 변환, 조각글 → time_of_day 계산 (순수 함수, 테스트 대상)

검색 파라미터:

```
GET https://www.googleapis.com/youtube/v3/search
  part=snippet  type=video  maxResults=5
  videoCategoryId=10        # 음악
  videoEmbeddable=true      # 앱 안 재생 가능한 것만
  videoDuration=medium      # 4~20분: 1시간짜리 플레이리스트 제외
  regionCode=KR  relevanceLanguage=ko  safeSearch=strict
  q=<검색어>
```

- 결과 제목에 `playlist|플레이리스트|모음|mix|1시간|hours`가 들어가면 버린다.
- `title`과 `channel`은 HTML 엔티티를 풀어서 길이 제한에 맞게 자른다.
- 할당량: search.list는 Search Queries 버킷에서 하루 약 100회다. 풀이 차면 거의 호출하지 않는다. 할당량 초과(403 `quotaExceeded`)면 검색을 건너뛰고 6절 5번의 넓힌 키로 고른다.

**시드**: `scripts/seed-song-pool.mjs`. mood 10개 × `unknown` × 3시간대 = 30회 검색으로 풀을 미리 채운다. 하루 할당량 안에 끝난다. 실행은 사람이 직접 한다(secret key 필요).

## 8. YouTube 정책 지키기 (Developer Policies III.E.4)

- 공개 데이터(제목, 채널)는 **30일 넘게 저장하지 않는다.** `fetched_at`이 30일 지난 행은 후보에서 빠진다.
- 정리 방법: 6절 4번에서 같은 키를 검색할 때 갱신된다. 남은 오래된 행은 `delete from song_pool where fetched_at < now() - interval '30 days'`로 지운다. 이 정리는 노래 라우트가 호출될 때마다 secret key로 실행한다. 인덱스를 타는 작은 delete라 부담이 없다. *(내 판단: 별도 cron 없이 단순하게.)* 행이 지워지면 `daily_artworks.song_id`는 null이 되고, 화면에 "노래 추천받기"가 다시 나온다.
- 임베드는 `https://www.youtube-nocookie.com/embed/{id}`를 쓰고 자동재생은 끈다. 플레이어를 가리거나 바꾸지 않는다.
- 노래 카드에 "YouTube"가 출처임을 표시한다.

## 9. 개인정보와 보안

- `song_pool`에는 사용자 id, 조각글, 요약, 태그가 **없다.** 키 3개와 YouTube 데이터만 있다.
- 검색어는 고정 단어로만 만든다. 조각글이 YouTube로 나가지 않는다.
- `song_feedback`은 RLS로 본인 행만 읽을 수 있다. 집계는 `pick_song` 안에서만 하고, 누가 눌렀는지는 노출하지 않는다.
- 공개 전시 API는 노래 제목, 채널, videoId만 추가로 내보낸다. mood, weather, time_of_day는 내보내지 않는다. "우울한 날"이 공개되지 않게 하기 위해서다.
- `YOUTUBE_API_KEY`는 `.env.local`과 Vercel 환경변수에만 둔다. `.env.example`에는 이름만 추가한다.
- 새 라우트는 기존 CSRF 미들웨어와 `readJson`(JSON Content-Type 강제)을 그대로 거친다.

## 10. 오류 처리

| 상황 | 동작 |
|---|---|
| 노래 라우트 실패 (네트워크, 500) | 그림은 이미 저장됐으니 영향 없음. 상세에 "노래 추천받기" 버튼 표시 |
| 할당량 초과 (`consume_ai_quota`) | 429 + "오늘 노래 추천은 여기까지예요" |
| YouTube 할당량 초과 / 오류 | 검색 건너뜀 → 넓힌 키로 고름 → 그래도 없으면 `song: null` |
| 영상이 삭제되거나 임베드 불가 | 임베드 iframe 오류는 감지하기 어려움. 30일 갱신 때 걸러짐. 사용자는 "다른 곡"을 누르면 됨 |
| `MUSIC_PROVIDER=mock` | 모의 곡 카드를 보여줌(임베드 없음) |

## 11. 테스트

- **순수 함수** (`key.ts`): 시간대 경계(04:59 → night, 05:00 → morning, 동점이면 늦은 구간), 검색어 조합(`unknown` 생략), 결과 필터(플레이리스트 제목 제외).
- **API e2e** (scratch 스크립트, 기존 `redraw.mjs` 패턴, mock 제공자 사용):
  - 가입 → 글 → 마감 → song 호출 → 노래가 생기고 상세 조회에 포함되는지
  - reroll → 다른 곡이 나오고 `song_feedback`에 -1이 기록되는지
  - 다른 사용자 계정으로 내 그림의 song 라우트 호출 → 404
  - `song_pool`에 사용자 권한으로 직접 insert → 거부
  - `set_artwork_song`에 없는 id → 오류
  - 공개 전시 응답에 노래는 있고 mood/weather는 없는지
  - 한도 11번째 → 429
- **`scripts/security-smoke.sh`에 추가**: anon의 song 라우트 호출 401, 교차 출처 403, anon의 `song_pool` insert 거부.
- **실제 YouTube**: 키를 넣고 시드 스크립트를 실행한 뒤 화면에서 재생되는지 확인한다(사람이 직접).

## 12. 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `supabase/schema.sql` | `song_pool`, `song_feedback`, `daily_artworks` 컬럼 4개, `ai_usage.kind`에 `song`, RPC `pick_song`·`set_artwork_song`, `redraw_artwork` 복사 컬럼 추가, 권한 |
| `src/lib/types.ts` | `Mood`, `WeatherKey`, `TimeOfDay`, `Song`. `DaySummary.mood`, `Artwork.song`, `PublicArtwork.song` |
| `src/server/ai/mock.ts` | mood 규칙 |
| `src/server/music/*` | 새 모듈 (types, youtube, mock, index, key) |
| `src/server/validate.ts` | mood 목록, artwork 입력에 mood |
| `src/server/db/data.ts`, `publicExhibition.ts` | 노래 join |
| `src/app/api/me/artworks/[date]/song/route.ts` | 새 라우트 |
| `src/app/api/me/songs/[id]/feedback/route.ts` | 새 라우트 |
| `src/lib/store.tsx` | `requestSong(date, reroll)`, `voteSong(id, vote)` |
| `src/app/today/page.tsx` | 마감 성공 후 song 호출 |
| `src/components/SongCard.tsx` | 새 컴포넌트 (상세, 공개 전시 공용) |
| `src/app/gallery/[date]/page.tsx`, `src/app/e/[id]/page.tsx` | 노래 카드 |
| `.env.example` | `MUSIC_PROVIDER`, `YOUTUBE_API_KEY` |
| `scripts/seed-song-pool.mjs`, `scripts/security-smoke.sh` | 시드, 스모크 항목 |

## 13. 내가 정한 것 (검토 부탁)

1. mood 10개 단어 목록과 검색어 표현
2. 공개 전시에도 노래를 보여주되, mood는 숨김
3. 노래 추천 한도 하루 10회(`ai_usage`를 같이 씀)
4. 다시 그리기를 해도 노래는 그대로 유지(`redraw_artwork`가 `song_id`를 새 행으로 복사)
5. 30일 정리는 cron 없이 노래 라우트가 호출될 때마다 실행
6. "다른 곡" = -1 피드백. 한 사람이 같은 곡에 남길 수 있는 반응은 하나뿐(마지막 반응으로 덮어씀)
7. 날씨 연동 전에는 `weather = unknown`으로 출시

## 14. 남은 질문

- YouTube Data API 키를 만들 Google Cloud 프로젝트를 누가 관리할지(팀 공용 계정 권장).
