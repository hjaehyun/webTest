# 노래 추천 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마감한 그림마다 그날 분위기·날씨·시간대에 맞는 YouTube 노래 1곡을 붙이고, 사용자끼리 노래 풀을 공유해서 YouTube 호출을 줄인다.

**Architecture:** 매칭 키 `mood|weather|time_of_day`는 고정된 목록에서만 고른다. 서버가 공유 테이블 `song_pool`(secret key로만 씀)에서 가중 랜덤으로 곡을 고르고, 후보가 3곡 미만일 때만 `MusicProvider`(mock | youtube)로 검색해 풀을 채운다. 그림 ↔ 곡 연결은 security definer RPC로만 바꾼다.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript, Supabase (Postgres + RLS + RPC), YouTube Data API v3 `search.list`, Node 24 `node --test`(타입 제거 내장).

**Spec:** `docs/superpowers/specs/2026-11-05-song-recommendation-design.md` — 실행자는 spec과 이 계획을 함께 읽는다.

## Global Constraints

- 앱 경로는 `haru-jogak/`. 아래 경로와 명령은 모두 그 기준이다(명령은 `haru-jogak/`에서 실행, 문서만 루트 `docs/`).
- 로컬 `하루조각/`은 git 저장소가 아니다. 태스크별 커밋 대신 **체크포인트**(`npx tsc --noEmit` + `npm run lint` 통과)를 한다. 커밋과 push는 Task 8에서 클론에 복사한 뒤, 재현님이 승인하면 한다.
- mood 10개: `calm, upbeat, flutter, proud, lazy, tired, blue, nostalgic, busy, cozy`
- weather 6개: `clear, cloudy, rain, snow, hot, unknown` (날씨 연동 전에는 항상 `unknown`)
- time_of_day 3개: `morning`(05–11시), `day`(11–18시), `night`(18–05시). Asia/Seoul 기준이고, 동점이면 늦은 구간을 고른다.
- 검색어 단어:
  - mood: 잔잔한 / 신나는 / 설레는 / 뿌듯한 / 나른한 / 지친 날 위로가 되는 / 우울할 때 듣는 / 그리운 / 바쁜 날 힘나는 / 포근한
  - weather: 맑은 날 / 흐린 날 / 비 오는 날 / 눈 오는 날 / 더운 날 / (unknown은 생략)
  - time: 아침에 / 오후에 / 밤에
  - 형식: `"{weather} {time} {mood} 노래"`. 단어 사이 공백은 하나로 합친다.
- `song_pool`에는 user_id와 일기 텍스트를 넣지 않는다. 쓰기는 `supabaseAdmin()`만 한다.
- 30일 지난 `song_pool` 행은 후보에서 빼고, 노래 라우트가 호출될 때마다 삭제한다.
- 노래 추천 한도는 `ai_usage` kind `song`으로 하루 10회.
- 같은 키의 신선한 후보가 3곡 미만일 때만 YouTube를 검색한다.
- 임베드는 `https://www.youtube-nocookie.com/embed/{videoId}`를 쓰고 자동재생은 끈다. "YouTube" 출처를 표시한다.
- 공개 전시 응답에는 `song`(videoId, title, channel)만 추가한다. mood, weather, time_of_day는 내보내지 않는다.
- 노래 실패가 그림 저장을 실패로 만들면 안 된다.
- 비밀값(`YOUTUBE_API_KEY`, `SUPABASE_SECRET_KEY`)은 출력하거나 커밋하지 않는다.

## Review Focus

1. **"다른 곡"을 눌렀는데 키를 넓혀도 새 후보가 없는 경우** → 지금 곡을 유지하고 `unchanged: true`로 응답한다. 화면에는 "다른 곡이 아직 없어요"를 띄운다. (Task 5 e2e)
2. **새벽 4:59 / 5:00 같은 경계 시각과 UTC → KST 변환** → 각각 night / morning. 날짜가 바뀌는 UTC 시각도 KST로 올바르게 분류한다. (Task 1 테스트)
3. **YouTube 제목의 HTML 엔티티(`&#39;`, `&amp;`)와 200자 넘는 제목** → 풀어서 자르고, DB check에 걸려 500이 나면 안 된다. (Task 2 테스트)
4. **다시 그리기를 한 그림** → 노래, mood, weather, time_of_day가 그대로 남는다. (Task 3 SQL, Task 5 e2e)
5. **videoId 형식이 이상하거나 snippet이 없는 검색 결과** → 그 항목만 버리고 나머지는 쓴다. (Task 2 테스트)

---

### Task 1: 매칭 키 순수 함수 + 테스트 환경

**Files:**
- Create: `src/server/music/key.ts`
- Create: `src/server/music/key.test.ts`
- Modify: `src/lib/types.ts` (타입 추가)
- Modify: `package.json` (`"test": "node --test \"src/**/*.test.ts\""`)
- Modify: `tsconfig.json` (`exclude`에 `"**/*.test.ts"` 추가. 테스트가 `./key.ts`처럼 확장자를 붙여 import하기 때문)

**Interfaces:**
- Produces (`src/lib/types.ts`):
  - `type Mood = "calm" | "upbeat" | "flutter" | "proud" | "lazy" | "tired" | "blue" | "nostalgic" | "busy" | "cozy"`
  - `type WeatherKey = "clear" | "cloudy" | "rain" | "snow" | "hot" | "unknown"`
  - `type TimeOfDay = "morning" | "day" | "night"`
  - `type Song = { id: number; videoId: string; title: string; channel: string }`
- Produces (`src/server/music/key.ts`). 타입은 `import type`만 쓴다. enum, 파라미터 프로퍼티처럼 타입 제거로 처리할 수 없는 문법은 금지한다.
  - `MOODS: Mood[]`, `WEATHERS: WeatherKey[]`, `TIMES: TimeOfDay[]` (위 순서 그대로)
  - `isMood(v: unknown): v is Mood`, `isWeather(v: unknown): v is WeatherKey`, `isTimeOfDay(v: unknown): v is TimeOfDay`
  - `type SongKey = { mood: Mood; weather: WeatherKey; time: TimeOfDay }`
  - `timeOfDay(isoTimes: string[]): TimeOfDay` — 빈 배열이면 `"day"`
  - `songQuery(k: SongKey): string`

- [ ] **Step 1: 실패하는 테스트 작성** (`key.test.ts`, `node:test` + `node:assert/strict`, `import { ... } from "./key.ts"`)

```ts
test("timeOfDay: KST boundaries", () => {
  assert.equal(timeOfDay(["2026-11-06T19:59:00.000Z"]), "night");   // 04:59 KST
  assert.equal(timeOfDay(["2026-11-06T20:00:00.000Z"]), "morning"); // 05:00 KST
  assert.equal(timeOfDay(["2026-11-07T02:00:00.000Z"]), "day");     // 11:00 KST
  assert.equal(timeOfDay(["2026-11-07T09:00:00.000Z"]), "night");   // 18:00 KST
});
test("timeOfDay: majority, tie goes later, empty is day", () => {
  assert.equal(timeOfDay(["2026-11-06T23:00:00.000Z", "2026-11-06T23:30:00.000Z", "2026-11-07T05:00:00.000Z"]), "morning");
  assert.equal(timeOfDay(["2026-11-06T23:00:00.000Z", "2026-11-07T05:00:00.000Z"]), "day");
  assert.equal(timeOfDay([]), "day");
});
test("songQuery", () => {
  assert.equal(songQuery({ mood: "calm", weather: "rain", time: "night" }), "비 오는 날 밤에 잔잔한 노래");
  assert.equal(songQuery({ mood: "tired", weather: "unknown", time: "morning" }), "아침에 지친 날 위로가 되는 노래");
});
test("guards", () => {
  assert.equal(MOODS.length, 10);
  assert.ok(isMood("cozy") && !isMood("happy"));
  assert.ok(isWeather("unknown") && !isWeather("sunny"));
  assert.ok(isTimeOfDay("night") && !isTimeOfDay("evening"));
});
```

- [ ] **Step 2: 실패 확인** — `npm test`. 기대: `key.ts` 모듈을 찾을 수 없어 FAIL.
- [ ] **Step 3: `key.ts` 구현.** KST 시각은 `(UTC 시 + 9) % 24`로 구한다. 구간 집계 후 최댓값을 고르고, 동점이면 `morning < day < night` 순서상 뒤쪽을 고른다.
- [ ] **Step 4: 통과 확인** — `npm test` → 4 pass.
- [ ] **Step 5: 체크포인트** — `npx tsc --noEmit` 출력 없음, `npm run lint` 오류 0.

---

### Task 2: MusicProvider (mock + YouTube)

**Files:**
- Create: `src/server/music/types.ts`, `src/server/music/mock.ts`, `src/server/music/youtube.ts`, `src/server/music/index.ts`
- Create: `src/server/music/youtube.test.ts`
- Modify: `.env.example` (`MUSIC_PROVIDER=mock`, `YOUTUBE_API_KEY=` 추가, 주석: "서버 전용, Google Cloud Console > YouTube Data API v3")

**Interfaces:**
- Consumes: 없음
- Produces:
  - `types.ts`: `type SongHit = { videoId: string; title: string; channel: string }`, `interface MusicProvider { readonly name: string; search(query: string): Promise<SongHit[]> }`, `class MusicQuotaError extends Error`
  - `youtube.ts`: `parseSearchResponse(json: unknown): SongHit[]` (export, 테스트 대상), `youtubeMusic: MusicProvider`
  - `mock.ts`: `mockMusic: MusicProvider` — 검색어마다 고정된 5곡. videoId는 `"MOCK_"` + 검색어 해시 4자 + 순번 2자리로 정확히 11자다(예: `MOCK_a1b201`). 제목은 `[모의 곡] {query} {n}`, 채널은 `하루조각 모의 채널`.
  - `index.ts`: `music(): MusicProvider` — env `MUSIC_PROVIDER`(`mock` 기본, `youtube`)
  - `isMockVideo(videoId: string): boolean` (`mock.ts`에서 export, UI도 사용) → `videoId.startsWith("MOCK_")`

- [ ] **Step 1: 실패하는 테스트 작성** (`youtube.test.ts`, `parseSearchResponse`만 import)

```ts
const item = (id: unknown, title: string, channel = "헤이즈 - Topic") =>
  ({ id: { kind: "youtube#video", videoId: id }, snippet: { title, channelTitle: channel } });
test("keeps good items, decodes entities", () => {
  const hits = parseSearchResponse({ items: [item("abcdefghijk", "비도 오고 그래서 &#39;Rain&#39; &amp; more")] });
  assert.deepEqual(hits, [{ videoId: "abcdefghijk", title: "비도 오고 그래서 'Rain' & more", channel: "헤이즈 - Topic" }]);
});
test("drops playlists/compilations by title", () => {
  for (const t of ["잔잔한 플레이리스트", "1시간 모음", "rainy day mix", "Lofi 3 hours", "비 노래 playlist"])
    assert.equal(parseSearchResponse({ items: [item("abcdefghijk", t)] }).length, 0, t);
});
test("drops bad ids and missing snippets, keeps the rest", () => {
  const hits = parseSearchResponse({ items: [item("short", "a"), { id: { videoId: "abcdefghijk" } }, item("ZYXWVUTSRQ_", "ok")] });
  assert.deepEqual(hits.map((h) => h.videoId), ["ZYXWVUTSRQ_"]);
});
test("truncates title 200 / channel 100", () => {
  const [h] = parseSearchResponse({ items: [item("abcdefghijk", "가".repeat(250), "나".repeat(150))] });
  assert.equal(h.title.length, 200);
  assert.equal(h.channel.length, 100);
});
test("garbage input -> []", () => {
  assert.deepEqual(parseSearchResponse(null), []);
  assert.deepEqual(parseSearchResponse({ items: "x" }), []);
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → youtube.test FAIL.
- [ ] **Step 3: 구현.**
  - 제외 정규식: `/playlist|플레이리스트|모음|\bmix\b|1시간|hours/i` (Remix는 남김)
  - id 정규식: `/^[A-Za-z0-9_-]{11}$/`
  - 엔티티: `&amp; &lt; &gt; &quot; &#39;`와 숫자 엔티티 `&#\d+;`를 디코딩한다.
  - `youtubeMusic.search` 요청 파라미터:
    - `part=snippet`, `type=video`, `maxResults=5`
    - `videoCategoryId=10`, `videoEmbeddable=true`, `videoDuration=medium`
    - `regionCode=KR`, `relevanceLanguage=ko`, `safeSearch=strict`
    - `q`, `key=YOUTUBE_API_KEY`
  - 응답 처리:
    - 403이고 `error.errors[0].reason`이 `quotaExceeded` 또는 `dailyLimitExceeded` → `MusicQuotaError`
    - 그 밖의 실패 → `Error`
  - 키가 없으면 `NotConfiguredError`(`src/server/ai/types.ts`에서 재사용)를 던진다.
- [ ] **Step 4: 통과 확인** — `npm test` → 전부 pass.
- [ ] **Step 5: 체크포인트** — tsc + lint.

---

### Task 3: DB 스키마 (`supabase/schema.sql`)

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces (Postgres):
  - 테이블 `public.song_pool`, `public.song_feedback`: spec 5절의 DDL 그대로. 인덱스 `song_pool_key (mood, weather, time_of_day, fetched_at)`.
  - `daily_artworks` 컬럼: `mood`, `weather`, `time_of_day`, `song_id bigint references song_pool(id) on delete set null`. spec 5절의 check 값을 그대로 쓰고 `add column if not exists`로 추가한다.
  - `grant insert (user_id, day, style, scene, summary, tags, mood) on daily_artworks to authenticated` (기존 grant 줄을 수정)
  - `ai_usage.kind` check: `drop constraint if exists ai_usage_kind_check` 후 `('summarize','draw','curate','song')`로 다시 추가. `consume_ai_quota`의 case에 `when 'song' then 10` 추가.
  - `pick_song(p_mood text, p_weather text, p_time text, p_exclude bigint[]) returns bigint` — security definer, stable. `p_weather`/`p_time`이 null이면 그 축은 아무 값이나 받는다.
  - `set_artwork_song(p_day date, p_song_id bigint, p_weather text, p_time text) returns void` — security definer. `auth.uid()` 본인의 그날 그림만 대상으로 하고, 없으면 `P0002`. 잘못된 song id는 FK 위반(`23503`).
  - `redraw_artwork`: 지우기 전에 `mood, weather, time_of_day, song_id`를 읽어두고, 새 행에 그대로 넣는다(시그니처 변경 없음).
  - 권한:
    - `song_pool`: anon/authenticated는 select만 (`revoke insert, update, delete`)
    - `song_feedback`: RLS `for all to authenticated using/with check (user_id = auth.uid())`. anon은 revoke.
    - 두 RPC: `revoke from public, anon`, `grant execute to authenticated`
    - `song_pool`에 RLS를 켜고 `for select to anon, authenticated using (true)`

`pick_song` 가중 랜덤 (Efraimidis–Spirakis):

```sql
select p.id from public.song_pool p
  left join (select song_id, count(*) filter (where vote = 1) l, count(*) filter (where vote = -1) s
               from public.song_feedback group by song_id) f on f.song_id = p.id
 where p.mood = p_mood
   and (p_weather is null or p.weather = p_weather)
   and (p_time is null or p.time_of_day = p_time)
   and p.fetched_at > now() - interval '30 days'
   and not (p.id = any(coalesce(p_exclude, '{}')))
 order by -ln(random()) / greatest(0.2, 1 + coalesce(f.l, 0) - 0.5 * coalesce(f.s, 0))
 limit 1;
```

- [ ] **Step 1: SQL 작성** — 재실행해도 안전해야 한다(`if not exists`, `create or replace`, `drop ... if exists`).
- [ ] **Step 2: 사람 실행** — 재현님이 Supabase SQL Editor에서 전체 `schema.sql`을 실행한다. 기대: "Success. No rows returned".
- [ ] **Step 3: 존재 확인 스크립트** (scratchpad `songs-probe.mjs`, `.env.local`의 값을 읽되 출력하지 않음). anon으로 `rpc/pick_song`, `rpc/set_artwork_song` 호출 → 둘 다 401 / `42501`(PGRST202면 실패). anon으로 `song_pool`에 insert → 401 또는 403.
- [ ] **Step 4: 체크포인트** — 기존 `bash scripts/security-smoke.sh http://localhost:3000` 19/19 유지.

---

### Task 4: summarize에 mood 추가 → 그림 저장에 mood

**Files:**
- Modify: `src/lib/types.ts` — `DaySummary`에 `mood: Mood`
- Modify: `src/server/ai/mock.ts` — RULES 항목에 `mood` 추가. 첫 매칭의 mood를 쓰고, 없으면 `calm`.
  - 고양이 → `cozy`, 비 → `calm`, 커피 → `cozy`, 밤 → `calm`, 공원 → `upbeat`, 과제 → `busy`, 먹을 것 → `lazy`
- Modify: `src/server/ai/claude.ts`, `src/server/ai/openai.ts` — 상단 구현 주석에 "mood는 MOODS 중 하나" 한 줄 추가(스텁 유지).
- Modify: `src/server/validate.ts` — `ArtworkInput`에 `mood?: Mood`. `artworkInputError`에서 mood가 있으면 `isMood`로 검사(`key.ts`에서 import). 메시지: `"mood가 올바르지 않아요"`.
- Modify: `src/server/db/data.ts` `saveArtwork` — 입력에 `mood?: Mood`, insert에 `mood: a.mood ?? null`.
- Modify: `src/app/api/me/artworks/route.ts` — `a.mood` 전달.
- Modify: `src/lib/store.tsx` `saveArtwork` — 보내는 body에 `mood`. `Artwork` 타입에 `mood?: Mood | null` 추가.
- Modify: `src/app/today/page.tsx` `close()` — `saveArtwork({... , mood: summary.mood })`

**Interfaces:**
- Consumes: Task 1 `Mood`, `isMood`
- Produces: `DaySummary.mood`, `Artwork.mood`

- [ ] **Step 1: e2e 테스트 작성** (scratchpad `songs.mjs` 1부. 기존 `redraw.mjs`의 쿠키 jar 헬퍼를 복사, 대상 `http://localhost:3000`)
  - 가입 → 프로필 → 조각 "비가 와서 창가에 앉아 있었다" → `POST /api/summarize` 응답 `mood === "calm"`
  - `POST /api/me/artworks`에 `mood: "happy"` → 400 `"mood가 올바르지 않아요"`
  - `mood: "calm"` → 201
- [ ] **Step 2: 실패 확인** — `node songs.mjs part1` → summarize에 mood가 없어서 FAIL.
- [ ] **Step 3: 구현** (위 파일 목록)
- [ ] **Step 4: 통과 확인** — `node songs.mjs part1` → 전부 PASS.
- [ ] **Step 5: 체크포인트** — tsc + lint + `npm test`.

---

### Task 5: 노래 고르기 서비스 + 라우트 2개

**Files:**
- Create: `src/server/db/songs.ts`
- Create: `src/app/api/me/artworks/[date]/song/route.ts`
- Create: `src/app/api/me/songs/[id]/feedback/route.ts`
- Modify: `src/server/db/quota.ts` — `AiKind`에 `"song"`

**Interfaces:**
- Consumes: Task 1 `SongKey`, `timeOfDay`, `songQuery`, `isMood`. Task 2 `music()`, `MusicQuotaError`. Task 3 RPC들. `supabaseAdmin()`, `consumeAiQuota`, `HttpError`.
- Produces:
  - `assignSong(sb: SupabaseClient, userId: string, date: string, reroll: boolean): Promise<{ song: Song | null; unchanged: boolean }>`
  - `voteSong(sb: SupabaseClient, userId: string, songId: number, vote: 1 | -1): Promise<void>`
  - `POST /api/me/artworks/:date/song`, body `{ reroll?: boolean }` → 200 `{ song, unchanged }`. 401 / 404 `"이날은 그림이 없어요"` / 429
  - `POST /api/me/songs/:id/feedback`, body `{ vote: 1 | -1 }` → 200 `{ ok: true }`. id는 양의 정수이고 vote는 1 또는 -1, 아니면 400.

`assignSong` 순서 (spec 6절):
1. 사용자 클라이언트로 그날 그림(`id, mood, song_id`)과 조각글 `written_at` 조회. 그림이 없으면 404.
2. `supabaseAdmin()`으로 `song_pool`에서 `fetched_at < now() - 30일` 삭제.
3. 키 = `{ mood: isMood(row.mood) ? row.mood : "calm", weather: "unknown", time: timeOfDay(...) }`
4. 제외 목록 = 본인 그림 중 최근 7일(`day >= date - 7`)의 `song_id` + 현재 `song_id` + 본인이 -1을 준 곡(`song_feedback`, 사용자 권한으로 조회). 그래서 "다른 곡"으로 넘긴 곡은 그 사용자에게 다시 나오지 않는다.
5. reroll이고 현재 곡이 있으면 → `voteSong(-1)`.
6. 같은 키의 신선한 후보 수(제외 목록 미적용)가 3 미만이면 → `music().search(songQuery(key))` → admin으로 `song_pool`에 upsert(`onConflict: "mood,weather,time_of_day,video_id"`, `fetched_at = now()`). `MusicQuotaError`와 `NotConfiguredError`는 로그만 남기고 계속 진행.
7. `pick_song(key)` → null이면 `(mood, weather, null)` → `(mood, null, null)` 순으로 다시 시도.
8. 고른 곡이 없으면: reroll이고 현재 곡이 있으면 `{ song: 현재 곡, unchanged: true }`, 아니면 `{ song: null, unchanged: false }`. 고른 곡이 있으면 `set_artwork_song` 후 그 곡을 반환.

라우트는 `requireUser` → `consumeAiQuota(..., "song")` → `assignSong` 순서로 처리하고, 오류는 `fail(err, DB_FAILED)`로 넘긴다.

- [ ] **Step 1: e2e 테스트 작성** (`songs.mjs` 2부, `MUSIC_PROVIDER=mock`으로 dev 서버 실행)
  - 마감한 날 song 호출 → `song.videoId`가 `MOCK_`로 시작하고 `unchanged === false`
  - 다시 호출(reroll) → 다른 videoId
  - reroll 4번 더(총 5곡을 다 봄) → 다음 reroll은 `unchanged === true`이고 곡이 그대로 (넘긴 곡은 -1로 제외되고, 넓힌 키에도 다른 곡이 없음)
  - feedback `{ vote: 1 }` → 200. `{ vote: 2 }` → 400. id `abc` → 400.
  - 다른 계정이 내 날짜로 song 호출 → 404(그 계정에는 그림이 없음)
  - 그림 없는 날 → 404
  - redraw 후 `GET /api/me`에서 그날 song이 같은지 (Task 6 이후 검증, Task 6 Step 4에서 실행)
  - song 11번째 호출 → 429
  - 사용자 access token으로 PostgREST `song_pool`에 직접 insert → 401 또는 403 (`redraw.mjs`의 토큰 추출 방식 사용)
  - `set_artwork_song`에 없는 id 999999999 → 오류(23503)
  - 정리: 계정 삭제 200
- [ ] **Step 2: 실패 확인** — `node songs.mjs part2` → 404(라우트 없음) FAIL.
- [ ] **Step 3: 구현** (위 파일 목록)
- [ ] **Step 4: 통과 확인** — `node songs.mjs part2` 전부 PASS. redraw 항목은 Task 6 이후에 확인.
- [ ] **Step 5: 체크포인트** — tsc + lint + `npm test`.

---

### Task 6: 읽기 경로에 노래 포함

**Files:**
- Modify: `src/lib/types.ts` — `Artwork.song: Song | null`, `PublicArtwork.song: Song | null`
- Modify: `src/server/db/data.ts` `loadDb` — select에 `mood, song_pool(id, video_id, title, channel)` 추가 → `song`과 `mood` 매핑.
- Modify: `src/server/db/publicExhibition.ts` — 그림 select에 `song_pool(id, video_id, title, channel)` 추가(mood, weather, time_of_day는 select하지 않음) → `song`.
- Modify: `src/lib/store.tsx` — `saveArtwork`로 새로 만드는 Artwork는 `song: null`. 다른 곳에서 Artwork를 만드는 부분도 `song: null`로 맞춘다.

**Interfaces:**
- Consumes: Task 1 `Song`, Task 3 `song_id` FK
- Produces: `Artwork.song`, `PublicArtwork.song`

- [ ] **Step 1: e2e 테스트 추가** (`songs.mjs` 3부)
  - song 배정 후 `GET /api/me` → `artworks[date].song.videoId`가 배정한 값과 같음
  - redraw 후 같은 videoId, `mood` 유지
  - 전시에 걸고 공개 → anon `GET /api/exhibitions/:id` → `items[0].song.videoId` 있음. 응답 JSON 문자열에 `"mood"`, `"weather"`, `"time_of_day"`가 없음
- [ ] **Step 2: 실패 확인** — `node songs.mjs part3` → song undefined FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — `node songs.mjs part3`, Task 5의 redraw 항목 포함 PASS.
- [ ] **Step 5: 체크포인트** — tsc + lint.

---

### Task 7: 화면 — SongCard, 상세, 공개 전시, 마감 흐름

**Files:**
- Create: `src/components/SongCard.tsx`, `src/components/SongCard.module.css`
- Modify: `src/lib/store.tsx` — `requestSong(date: string, reroll: boolean): Promise<{ unchanged: boolean }>`, `voteSong(songId: number, vote: 1 | -1): Promise<void>`. `saveArtwork`는 artworks POST가 성공한 뒤 `requestSong(date, false)`를 부른다. 이 호출의 실패는 `console.warn`만 하고 알림이나 다시 불러오기는 하지 않는다.
- Modify: `src/app/gallery/[date]/page.tsx` — 그림 아래에 `<SongCard song={art.song} onReroll onLike onRequest busy />`
- Modify: `src/app/e/[id]/page.tsx` — figcaption 아래에 `<SongCard song={cur.song} readOnly />`

**Interfaces:**
- Consumes: Task 2 `isMockVideo`, Task 5 라우트, Task 6 `Artwork.song`
- Produces: `SongCard` props `{ song: Song | null; readOnly?: boolean; busy?: boolean; onReroll?(): void; onLike?(): void; onRequest?(): void }`

SongCard 동작:
- song이 있고 mock이 아님 → `iframe`(`youtube-nocookie.com/embed/{id}`, `title={song.title}`, `loading="lazy"`, `allow="encrypted-media; picture-in-picture"`, 자동재생 파라미터 없음), 제목, 채널, 작은 글씨 "YouTube"
- song이 mock → iframe 대신 "🎵 {title} (모의 곡)"
- readOnly가 아니면 버튼 `👍`(aria-label "이 노래 좋아요"), `다른 곡`
- song이 null이고 readOnly가 아니면 → `노래 추천받기` 버튼. readOnly면 카드를 렌더링하지 않음
- 문구: reroll 결과 `unchanged`면 "다른 곡이 아직 없어요", 429면 서버 메시지를 그대로 `alert`

- [ ] **Step 1: 화면 확인 시나리오 작성** (브라우저, `preview_start haru-dev`, 테스트 계정은 생성 후 삭제)
  - 마감 → 상세로 이동 → 노래 카드(모의 곡) 표시
  - 다른 곡 → 제목이 바뀜
  - 👍 → 오류 없음
  - 공개 전시 시크릿 상태(로그아웃) → 노래 카드가 있고 버튼은 없음
  - 375px 폭에서 카드가 넘치지 않음
- [ ] **Step 2: 구현.**
- [ ] **Step 3: 시나리오 실행** — 각 항목을 `read_page`/스크린샷으로 확인하고, 콘솔 오류 0.
- [ ] **Step 4: 실제 YouTube 1회 확인 (사람)** — 재현님이 `.env.local`에 `MUSIC_PROVIDER=youtube`와 키를 넣는다 → 마감 → 상세 iframe이 재생되는지 확인.
- [ ] **Step 5: 체크포인트** — tsc + lint + `npm test` + `npm run build`.

---

### Task 8: 시드, 스모크, 문서, 반영

**Files:**
- Create: `scripts/seed-song-pool.mjs` — `.env.local`의 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `YOUTUBE_API_KEY`를 읽음(출력 금지). MOODS × `unknown` × TIMES = 30개 키마다 검색해서 upsert. 진행은 `키: n곡`만 출력. 할당량 초과면 중단하고 남은 키 개수를 출력.
- Modify: `scripts/security-smoke.sh` — 추가 3항목:
  - anon `POST /api/me/artworks/2026-01-01/song` → 401
  - 교차 출처 Origin → 403
  - anon PostgREST `song_pool` insert → 401 또는 403
- Modify: `README`(앱) 환경변수 절, 루트 `CLAUDE.md`(진행 상태 줄 + API 목록 + 남은 일), `report/2026-11-07_작업보고서.md`

- [ ] **Step 1: 스모크 실행** — `bash scripts/security-smoke.sh http://localhost:3000` → 22/22.
- [ ] **Step 2: 시드 실행 (사람, 키 필요)** — `node scripts/seed-song-pool.mjs` → 30개 키 각각 1곡 이상.
- [ ] **Step 3: 문서 갱신.**
- [ ] **Step 4: 반영 (재현님 승인 후)** — 클론 `git pull` → 변경 파일 복사(`.env.local` 제외 확인) → 커밋 `feat: song recommendation per picture (YouTube + shared pool)`, 마지막 줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` → push → Vercel에 `MUSIC_PROVIDER`, `YOUTUBE_API_KEY` 환경변수 설정(사람) → 배포 스모크 22/22.
