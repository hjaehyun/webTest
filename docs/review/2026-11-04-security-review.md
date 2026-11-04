# 하루조각 보안·정합성 리뷰 (2026-11-04)

> 읽기 전용 리뷰입니다. 이 PR은 **문서만 추가**하며 앱 동작은 바꾸지 않습니다.
> 수정 여부와 순서는 이 보고서를 읽고 결정해 주세요.

## 0. 범위와 방법

| 항목 | 내용 |
|---|---|
| 기준 커밋 | `main` (이 브랜치 분기 시점) |
| 대상 | `src/app/api/**` 전체 13개 라우트, `src/server/{auth,supabase,http,validate}.ts`, `src/server/db/data.ts`, `src/server/ai/*`, `supabase/schema.sql`, 그리고 데이터를 화면에 그리는 `src/app/e/[id]/page.tsx` |
| 방법 | 코드 정독 + `@supabase/ssr@0.12.7` 기본값 확인(`node_modules/@supabase/ssr/dist/main/utils/constants.js`) |
| 실행 확인 | `npx eslint` → 에러 0 / 경고 1(폰트, 무관), `npx next build` → 성공 |
| 하지 않은 것 | 실제 DB 연결 테스트(클라우드에 `.env*` 없음). 아래 "재현 시나리오"는 코드·정책 분석으로 도출한 것이며, Supabase 대시보드에서 직접 확인이 필요한 항목은 §5에 따로 모았습니다. |

### 위협 모델에 대한 전제

"브라우저는 Supabase를 직접 호출하지 않는다"는 것은 **앱의 동작 방식**이지 **보안 경계가 아닙니다**.

- Publishable 키는 이름 그대로 공개되어도 되는 키로 설계되어 있어, 비밀로 가정하면 안 됩니다.
- 로그인한 사용자의 access token(JWT)은 `sb-*` 쿠키에 들어 있고, 아래 M2처럼 JS에서 읽을 수 있습니다. JWT의 `iss` 클레임에는 프로젝트 URL도 들어 있습니다.

따라서 **"악의적인 로그인 사용자가 자기 JWT로 PostgREST/RPC를 직접 호출한다"**를 기본 공격자로 놓고, API 검증이 아니라 **RLS만으로** 무엇이 막히는지를 기준으로 평가했습니다.

---

## 1. 요약

| # | 심각도 | 제목 | 위치 |
|---|---|---|---|
| H1 | **High** | AI 라우트(`summarize`/`draw`/`curate`)가 비로그인·무제한·무크기제한 | `src/app/api/summarize/route.ts:12`, `draw/route.ts:13`, `curate/route.ts:18` |
| M1 | Medium | 로그인/회원가입 CSRF(Content-Type·Origin 미검사) → 피해자를 공격자 계정에 로그인시켜 일기 탈취 | `src/server/http.ts:41`, `src/app/api/auth/login/route.ts:8` |
| M2 | Medium | 인증 쿠키가 `httpOnly:false`, `Secure` 없음, 400일 유지 | `src/server/supabase.ts:21-28` |
| M3 | Medium | `daily_artworks` RLS가 `for all` → 사용자가 직접 UPDATE/DELETE로 "마감한 날" 규칙과 `image_url`을 우회 | `supabase/schema.sql:153-156` |
| M4 | Medium | 그림 `summary`/`tags`가 클라이언트 값 그대로, 길이·개수 제한 없음(API·DB 모두) | `src/app/api/me/artworks/route.ts:14-15`, `supabase/schema.sql:36-37` |
| M5 | Medium | Supabase Auth의 IP 기준 rate limit이 Vercel 서버 IP 하나로 합쳐짐 → 전체 로그인 DoS, 계정별 무차별 대입 방어 없음 | `src/app/api/auth/login/route.ts:15`, `signup/route.ts:23`, `src/server/auth.ts:18` |
| M6 | Medium | 공개 전시 화면이 원본 조각글(`entries[0].text`)을 캡션으로 씀 → "entries는 절대 공개 안 함" 원칙과 충돌(다음 단계 구현 시 유출 위험) | `src/app/e/[id]/page.tsx:54` |
| L1 | Low | `SECURITY DEFINER` 함수 `day_is_closed`를 anon이 RPC로 호출 가능 → 남의 "일기 쓴 날" 조회 | `supabase/schema.sql:77-80` |
| L2 | Low | `isDateKey`가 존재하지 않는 날짜 허용 → 400이 아니라 500 | `src/server/validate.ts:12` |
| L3 | Low | `checkPassword`가 모든 오류를 "비밀번호 틀림"으로 처리 / 비번 변경 후 signOut 실패 시 500 | `src/server/auth.ts:16-22`, `src/app/api/me/password/route.ts:21-27` |
| L4 | Low | 조각 입력과 마감의 경쟁 상태(RLS 체크의 TOCTOU) | `supabase/schema.sql:143-146` |
| L5 | Low | `set_exhibition_items` 동시 호출/중복 날짜 시 23505 → 500 | `supabase/schema.sql:113-117`, `src/server/db/data.ts:146-150` |
| L6 | Low | `status` 처리 불일치(`done`만 로드 vs 아무 status나 마감 처리) | `src/server/db/data.ts:33`, `supabase/schema.sql:79` |
| L7 | Low | 조각의 `day`/`written_at`을 클라이언트가 임의로 지정 가능(미래·과거 날짜) | `src/app/api/me/entries/route.ts:12-21` |
| L8 | Low | 회원가입 응답으로 이메일 가입 여부 확인 가능(계정 열거) | `src/app/api/auth/signup/route.ts:25,34` |
| L9 | Low | Storage 버킷: 크기/MIME 제한 없음, 탈퇴 시 파일 미삭제(공개 버킷) | `supabase/schema.sql:188-202`, `src/app/api/me/route.ts:31` |
| L10 | Low | 길이 검사 단위 차이(JS UTF-16 vs Postgres 문자, 비밀번호 72자 vs bcrypt 72바이트) | `src/server/validate.ts:24`, `signup/route.ts:17` |
| I1 | Info | 501 응답에 소스 경로·제공자명 노출 | `src/server/ai/claude.ts:13`, `src/server/http.ts:32-33` |
| I2 | Info | `grant ... to anon`이 실제로는 권한을 "제한"하지 못할 수 있음 | `supabase/schema.sql:60-62` |
| I3 | Info | 보안 헤더(CSP, frame-ancestors 등) 미설정 | `next.config.ts` |

### 잘 되어 있는 부분 (확인 완료)

- `SUPABASE_SECRET_KEY`(`supabaseAdmin()`)는 **`src/app/api/me/route.ts:31` 계정 삭제 한 곳에서만** 사용됩니다. 그 전에 `requireUser()` + 비밀번호 재확인을 거치고, 삭제 대상은 세션의 `me.user.id`라 요청 본문으로 바꿀 수 없습니다.
- `requireUser()`는 `getSession()`이 아니라 `getUser()`를 써서 위조·폐기된 쿠키를 Auth 서버에서 거릅니다 (`src/server/auth.ts:11`).
- 모든 `/api/me/*` 쓰기가 사용자 세션 클라이언트로 이뤄져 RLS가 실제로 적용됩니다. `data.ts`의 `user_id` 필터는 보조 수단일 뿐이라는 주석과 실제가 일치합니다.
- **사용자 A가 B의 데이터를 읽거나 바꾸는 경로는 찾지 못했습니다.** profiles/entries/daily_artworks/exhibitions/exhibition_items 모두 `user_id = auth.uid()` 조건이 `using`과 `with check` 양쪽에 있고, `exhibition_items`의 `with check`가 "내 전시 + 내 그림"을 둘 다 확인합니다(`schema.sql:176-183`).
- 모든 `SECURITY DEFINER` 함수에 `set search_path = ''`가 있고, `set_exhibition_items`는 `SECURITY INVOKER`라 RLS를 그대로 받습니다(`schema.sql:96-97`).
- 오류 처리: `fail()`이 예상 못한 오류는 로그만 남기고 일반 문구로 숨깁니다. DB 오류 코드/메시지가 응답에 나가지 않습니다(`src/server/http.ts:28-37`).
- 로그인 실패 메시지가 "이메일 없음/비번 틀림"을 구분하지 않습니다(`login/route.ts:23-26`).
- XSS: `dangerouslySetInnerHTML` 사용 없음, 사용자 값은 모두 React 텍스트 노드로 출력, `href`에 사용자 입력 없음.
- 오픈 리다이렉트: `redirect`/`next=` 파라미터 처리 없음, `router.push`는 고정 경로만 사용.

---

## 2. High

### H1. AI 라우트가 비로그인·무제한·무크기제한

**위치**
- `src/app/api/summarize/route.ts:12-20` — `requireUser()` 없음, `entries` 개수·`text` 길이 제한 없음
- `src/app/api/draw/route.ts:13-19` — `requireUser()` 없음, `summary` 길이·`tags` 제한 없음
- `src/app/api/curate/route.ts:18-23` — `requireUser()` 없음, `periodLabel`/`summaries[]`/`top[]` 길이·개수 제한 없음
- 세 라우트 모두 rate limit 없음. 프로젝트에 `middleware.ts`도 없음.

**실패 시나리오**
1. *지금(mock)*: 누구나 로그인 없이 `curl -X POST https://<배포주소>/api/summarize -d '{"entries":[{"id":"a","at":"b","text":"c"}]}'`를 병렬로 수천 번 호출할 수 있습니다. mock은 요청마다 1.6~1.8초 `sleep`(`mock.ts:29,66`)하므로 Vercel 함수 실행 시간/동시성 한도를 소모시킵니다. 또 수 MB짜리 `entries` 배열을 보내면 `join(" ")` 후 정규식 7개를 돌려 CPU도 씁니다.
2. *AI 연결 후(README "다음 단계" 2번)*: 같은 호출이 그대로 **팀의 OpenAI/Anthropic 요금**이 됩니다. 이미지 1장 약 $0.011(`openai.ts:7`) 기준, 스크립트 하나로 하루에 수백~수천 달러가 나갈 수 있습니다. 서비스와 무관한 외부인이 이 엔드포인트를 "무료 LLM 프록시"로 쓸 수도 있습니다(`summaries`에 임의 프롬프트 삽입).

**제안**
- 세 라우트 시작에 `const me = await requireUser(); if (!me) return unauthorized();` 추가.
- 입력 상한: `entries.length ≤ 50`(하루 조각 수 상한을 정해서), 각 `text`는 `isText(…, 140)` 재사용, `summary ≤ 500자`, `tags ≤ 10개 × 20자`, `summaries ≤ 100개 × 500자`, `periodLabel ≤ 30자`.
- 사용자별 rate limit(예: Upstash Redis `@upstash/ratelimit`, 또는 Supabase 테이블에 `ai_usage(user_id, day, count)` 저장 후 하루 N회 제한).
- 더 근본적으로는 `summarize`가 클라이언트가 보낸 `entries` 대신 **서버가 DB에서 그날 조각을 직접 읽어** 요약하게 바꾸면 M4도 함께 해결됩니다(아래 M4 참고).

---

## 3. Medium

### M1. 로그인/회원가입 CSRF → 피해자를 공격자 계정에 로그인시킴

**위치**
- `src/server/http.ts:41-47` — `readJson()`이 `Content-Type`과 무관하게 `req.json()`으로 파싱
- `src/app/api/auth/login/route.ts:8-29`, `src/app/api/auth/signup/route.ts:12-36` — `Origin` 검사 없음

**실패 시나리오**
1. 공격자가 자기 사이트에 아래 폼을 둡니다. `enctype="text/plain"` 폼은 CORS 사전요청(preflight) 없이 다른 사이트로 POST할 수 있습니다.
   ```html
   <form action="https://<배포주소>/api/auth/login" method="POST" enctype="text/plain">
     <input name='{"email":"attacker@x.com","password":"attackerpw","p":"' value='"}'>
   </form>
   <script>document.forms[0].submit()</script>
   ```
   전송 본문은 `{"email":"attacker@x.com","password":"attackerpw","p":"="}` 로 **유효한 JSON**이 됩니다.
2. `readJson()`이 이를 그대로 파싱 → 로그인 성공 → 응답의 `Set-Cookie`가 피해자 브라우저에 저장됩니다(SameSite=Lax는 쿠키를 *보내는 것*을 막을 뿐, 최상위 이동 응답이 쿠키를 *설정하는 것*은 막지 않음).
3. 피해자는 공격자 계정에 로그인된 줄 모르고 오늘의 조각(사적인 일상)을 씁니다 → 공격자가 자기 계정으로 로그인해서 그대로 읽습니다.

참고: `/api/me/*`의 일반 CSRF는 쿠키가 `SameSite=Lax`라 교차 사이트 POST에 쿠키가 실리지 않아 현재는 막혀 있습니다. 하지만 이것도 브라우저 설정 하나에 기대는 것이라 같은 방어를 함께 거는 것이 좋습니다.

**제안**
- `readJson()`에서 `req.headers.get("content-type")`이 `application/json`으로 시작하지 않으면 `null` 반환(→ 400). 폼은 이 Content-Type을 보낼 수 없고, `fetch`로 보내면 preflight가 발생해 CORS에 막힙니다. 클라이언트(`src/lib/ai.ts:11`, `src/lib/store.tsx:45`)는 본문이 있을 때 이미 이 헤더를 보내므로 동작 변화 없음. 본문 없는 요청(로그아웃, 조각 삭제)은 `readJson()`을 부르지 않으므로 영향 없음.
- 추가로 상태를 바꾸는 모든 라우트에서 `Origin` 헤더가 자기 호스트와 다르면 403(미들웨어 한 곳에서 처리 가능).

### M2. 인증 쿠키 플래그가 약함 (`httpOnly:false`, `Secure` 없음, 400일)

**위치** `src/server/supabase.ts:21-28` — `createServerClient(...)`에 `cookieOptions`를 주지 않아 `@supabase/ssr` 기본값이 쓰입니다.
설치된 0.12.7의 기본값(`node_modules/@supabase/ssr/dist/main/utils/constants.js`):
```js
{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 * 24 * 60 * 60 }
```

**실패 시나리오**
- `httpOnly:false`: 이 기본값은 *브라우저용 Supabase 클라이언트가 쿠키를 읽어야 하기 때문*인데, 이 앱은 브라우저가 Supabase를 쓰지 않으므로 이유가 없습니다. 앞으로 XSS가 하나라도 생기면(예: 외부 스크립트, 향후 SVG 그림 렌더링) `document.cookie`로 **access token + refresh token**을 통째로 가져가 400일 동안 세션을 재발급받을 수 있습니다. 또 위 "위협 모델"처럼 사용자가 자기 JWT를 쉽게 꺼내 PostgREST를 직접 호출하는 출발점이 됩니다(M3).
- `Secure` 없음: Vercel 기본 도메인은 HTTPS 강제라 당장 위험은 낮지만, 커스텀 도메인을 HTTP로 열거나 로컬 외 환경에서 평문 전송될 수 있습니다.

**제안**
```ts
createServerClient(url, key, {
  cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
  cookies: { ... },
});
```
`maxAge`는 서비스 정책(예: 30일)에 맞게 줄이는 것을 검토하세요. 쿠키는 refresh token 수명과 별개이므로, Supabase 대시보드의 세션 시간 제한(Auth → Sessions)도 함께 맞추면 좋습니다.

### M3. `daily_artworks` RLS가 `for all` → "마감한 날" 규칙과 `image_url` 우회

**위치** `supabase/schema.sql:153-156`
```sql
create policy "artworks: own" on public.daily_artworks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
```
API에는 그림 UPDATE/DELETE가 없지만, RLS는 본인 행이면 **모든 컬럼 UPDATE와 DELETE**를 허용합니다.

**실패 시나리오** (자기 JWT + publishable 키로 PostgREST 직접 호출)
1. `PATCH /rest/v1/daily_artworks?day=eq.2026-11-01 {"day":"2026-12-31"}` 또는 `DELETE` → 11월 1일이 "열린 날"로 돌아가, `entries: remove from open day` 정책상 그날 조각을 지우거나 추가할 수 있게 됩니다. 앱 설계("마감한 날의 조각은 고정")가 깨지고, 날짜를 바꾼 그림은 엉뚱한 날 조각을 끌어갑니다(`data.ts:59-64`).
2. `PATCH ... {"image_url":"https://evil.example/track.png"}` → README 다음 단계 3번(`Art` → `<img>`)이 구현되면, 공개 전시를 보는 **모든 방문자 브라우저가 공격자 서버로 요청**합니다(IP·방문 시각 추적, 부적절한 이미지 게시). `javascript:` 같은 스킴도 DB에서 막지 않습니다.
3. `PATCH ... {"status":"drawing"}` → L6의 불일치 상태를 일부러 만들 수 있습니다.

**제안**
- `for all` 정책을 `select`/`insert` 두 개로 쪼개고, UPDATE/DELETE는 정책 없이 막기. 그림 생성 결과(`image_url`, `status`) 갱신은 서버의 별도 경로(관리자 키를 쓰는 서버 작업 또는 컬럼을 제한한 `SECURITY DEFINER` RPC)로만.
- 또는 최소한 컬럼 권한으로 제한: `revoke update on public.daily_artworks from authenticated; grant update (…필요한 컬럼만…) on public.daily_artworks to authenticated;`
- `image_url`에 `check (image_url is null or image_url like 'https://<프로젝트>.supabase.co/storage/v1/object/public/artworks/%')` 제약 추가.

### M4. 그림 `summary`/`tags`가 클라이언트 값 그대로, 크기 제한 없음

**위치**
- `src/app/api/me/artworks/route.ts:14-15` — `summary`는 "비어있지 않은 문자열"만, `tags`는 "문자열 배열"만 확인
- `supabase/schema.sql:36-37` — `summary text not null`, `tags text[] not null` 에 길이/개수 `check` 없음
- 흐름: `today/page.tsx:69-71`에서 브라우저가 `/api/summarize` → `/api/draw` 결과를 받아 `/api/me/artworks`로 **다시 보냄**(`store.tsx:147`). 서버는 그것이 실제 AI 결과인지 모릅니다.

**실패 시나리오**
1. 사용자가 `POST /api/me/artworks`에 `summary`로 4MB 문자열, `tags`로 10만 개 원소를 보내도 저장됩니다(Vercel 요청 본문 상한 약 4.5MB까지). 이후 `GET /api/me`가 매번 이 데이터를 전부 내려받아 느려지고, DB 저장 용량(무료 플랜 500MB)을 소모합니다.
2. 이 `summary`/`tags`는 공개 전시에 노출되는 컬럼입니다(`schema.sql:157-159`). AI를 거치지 않은 임의 문구(광고, 욕설)를 "AI가 그린 그림 설명"처럼 공개할 수 있습니다.
3. `/api/curate`가 이 `summary`들을 그대로 프롬프트에 넣게 되므로(`src/lib/ai.ts:56`), 저장된 summary를 통한 프롬프트 주입 경로가 생깁니다.

**제안**
- API와 DB 양쪽에 상한: 예) `check (char_length(summary) <= 500)`, `check (cardinality(tags) <= 10)`, 각 태그 20자(태그 길이는 트리거나 `array_length` + 함수로 확인).
- 장기적으로는 "마감" 하나의 서버 라우트(예: `POST /api/me/days/:date/close`)가 **DB에서 그날 조각을 읽고 → 요약 → 그림 → 저장**까지 서버 안에서 끝내도록 합치는 것을 권합니다. 그러면 H1(비로그인 AI 호출), M4(클라이언트 신뢰), 마감 경쟁 상태(L4)가 한 번에 정리됩니다.

### M5. Auth rate limit이 서버 IP 하나로 합쳐짐

**위치** `src/app/api/auth/login/route.ts:15`, `src/app/api/auth/signup/route.ts:23`, `src/server/auth.ts:18`(비밀번호 재확인)

**실패 시나리오**
- Supabase Auth의 로그인/회원가입 rate limit은 **요청한 IP 기준**인데, 이 앱에서는 모든 요청이 Vercel 함수에서 나가므로 Supabase가 보는 IP는 서버 IP(소수)입니다.
  1. 공격자 한 명이 `/api/auth/login`을 짧게 반복 호출하면 서버 IP의 한도가 차서 **모든 사용자의 로그인/가입이 동시에 429 또는 500**이 됩니다(로그인 라우트는 429를 따로 처리하지 않아 `throw error` → "저장소에 연결하지 못했어요" 500으로 보입니다, `login/route.ts:27`).
  2. 반대로, 한도가 넉넉하게 설정된 경우 특정 이메일에 대한 무차별 대입을 앱 쪽에서 막는 장치가 없습니다.

**제안**
- 앱 레벨에서 `IP(x-forwarded-for) + email` 기준 rate limit(H1과 같은 저장소 재사용).
- 로그인 라우트에도 `error.status === 429` 처리 추가.
- Supabase 대시보드 Auth → Rate Limits 값과 CAPTCHA(hCaptcha/Turnstile) 사용을 검토(§5 참고).

### M6. 공개 전시 화면이 원본 조각글을 캡션으로 사용

**위치** `src/app/e/[id]/page.tsx:54`
```tsx
<span className="hand">{cur.entries[0]?.text ?? ""}</span>
```
또한 `:13`에서 `useStore()`(= `/api/me`)를 쓰고 있어 URL의 `[id]`를 무시하고 **보는 사람 자신의** 전시를 보여줍니다(README에 "아직 본인 데이터만 표시"로 알려진 상태).

**실패 시나리오**
- 스키마 주석(`schema.sql:7`)은 "entries(원본 조각)는 절대 공개하지 않는다"고 하고 RLS도 그렇게 되어 있습니다. 그런데 README 다음 단계 1번(`GET /api/exhibitions/[id]` + `/e/[id]` 연결)을 이 화면 그대로 구현하면,
  - (a) 세션 클라이언트로 읽으면 entries가 RLS에 막혀 캡션이 비고, 그래서 "되게 하려고" 관리자 키로 entries를 읽어오는 순간 **남의 사적인 조각글이 공개 URL에 노출**됩니다.
- 즉 지금 코드 자체가 유출하진 않지만, 다음 작업에서 비밀 키 사용 원칙(계정 삭제에만)을 깨게 만드는 함정입니다.

**제안**
- 공개 화면 캡션은 `summary`(이미 공개 대상)나 `exhibition_items.note`를 쓰도록 미리 바꾸고, 공개 API는 **anon/세션 클라이언트 + RLS**로만 구현. 관리자 키는 쓰지 않기.
- 공개 API 응답 타입을 `Artwork`(entries 포함)와 분리된 `PublicArtwork { date, scene, imageUrl, summary }`로 정의.

---

## 4. Low / Info

### L1. `day_is_closed`를 누구나 RPC로 호출 가능 → 남의 활동 날짜 조회
**위치** `supabase/schema.sql:77-80` (`SECURITY DEFINER`, 인자로 아무 `p_user`나 받음)
**시나리오** Postgres 함수는 기본적으로 `PUBLIC`에 EXECUTE가 있고 PostgREST가 `public` 스키마 함수를 `/rest/v1/rpc/*`로 노출합니다. 공개 전시 행에는 `user_id`가 포함되어 anon도 읽을 수 있으므로(`schema.sql:162-164`), 공격자는 `rpc/day_is_closed {"p_user":"<공개전시 주인>","p_day":"2026-10-01"}`을 날짜별로 돌려 **전시에 걸지 않은 날까지 "이 사람이 일기를 쓴 날"을 전부** 알아낼 수 있습니다.
**제안** 함수 안에 `and p_user = (select auth.uid())` 조건을 추가(정책에서는 항상 본인 `user_id`로만 호출하므로 동작 변화 없음). 또는 두 헬퍼 함수를 PostgREST에 노출되지 않는 `private` 스키마로 옮기고 `authenticated`에만 EXECUTE 부여. 참고로 `EXECUTE`를 `authenticated`에서 그냥 revoke하면 RLS 정책 평가가 실패하므로 그 방법은 쓰면 안 됩니다.

### L2. 존재하지 않는 날짜가 500으로 떨어짐
**위치** `src/server/validate.ts:12` — `/^\d{4}-\d{2}-\d{2}$/`만 확인
**시나리오** `{"date":"2026-02-30"}` 또는 `"2026-13-01"`로 `/api/me/entries`, `/api/me/artworks`, `/api/me/exhibition`을 호출 → Postgres `22008` → `check()`가 일반 Error로 던짐 → 사용자에게 "저장소에 연결하지 못했어요"(500). 장애처럼 보이고 로그가 오염됩니다.
**제안** `isDateKey`에서 `new Date(v + "T00:00:00Z").toISOString().slice(0,10) === v` 같은 왕복 검사 추가.

### L3. 비밀번호 재확인/변경의 오류 처리
**위치** `src/server/auth.ts:16-22`, `src/app/api/me/password/route.ts:21-27`
**시나리오**
- `checkPassword`가 rate limit(429)·네트워크 오류도 `false`로 돌려줘서 사용자에게 "지금 비밀번호가 맞지 않아요"(403)로 보입니다. M5와 겹치면 정상 사용자가 탈퇴/비번 변경을 못 하면서 원인을 모릅니다.
- 비밀번호 변경 성공 후 `signOut({scope:"others"})`(`password/route.ts:27`)가 실패하면 예외 → 500. 실제로는 비번이 이미 바뀌었는데 사용자는 실패로 압니다.
**제안** `checkPassword`가 `invalid_credentials`일 때만 `false`, 그 외는 throw. `signOut(others)` 실패는 로그만 남기고 200 응답(또는 응답에 경고 필드).

### L4. 조각 입력과 마감 사이의 경쟁 상태
**위치** `supabase/schema.sql:143-146` (`not day_is_closed(...)`를 INSERT 시점에 확인)
**시나리오** READ COMMITTED에서 "조각 INSERT"와 "그림 INSERT"가 거의 동시에 실행되면 둘 다 성공할 수 있습니다. 그 조각은 요약에 들어가지 않았는데 `loadDb`에서는 그림의 조각으로 붙고(`data.ts:61-62`), 마감된 날이라 지울 수도 없습니다. 두 탭/두 기기에서 쓰는 경우 실제로 일어날 수 있습니다.
**제안** M4의 "서버 마감 라우트"에서 `select ... for update`로 그날 조각을 잠그고 같은 트랜잭션에서 그림을 넣는 RPC로 처리. 영향이 작으면 알려진 제약으로 남겨도 됩니다.

### L5. `set_exhibition_items` 동시 호출/중복 날짜
**위치** `supabase/schema.sql:113-117`, `src/server/db/data.ts:146-150`
**시나리오** 같은 사용자가 전시 순서를 빠르게 두 번 저장하면 두 트랜잭션이 각각 DELETE 후 INSERT하다 PK 충돌(23505) → 매핑이 없어 500. RPC를 직접 호출하면서 `p_dates`에 같은 날짜를 두 번 넣어도 같은 결과(API는 `exhibition/route.ts:18`에서 막음).
**제안** 함수 시작에 `perform 1 from public.exhibitions where id = ex for update;`로 직렬화, `p_dates`를 `select distinct`로 정리, `data.ts`에서 `23505`도 409로 매핑.

### L6. `status` 처리 불일치
**위치** `src/server/db/data.ts:33`(`status = 'done'`만 로드) vs `supabase/schema.sql:79`(`day_is_closed`는 status 무관)
**시나리오** 지금은 status가 항상 기본값 `done`이라 문제없지만, 이미지 AI를 붙여 `drawing`/`failed` 행을 쓰기 시작하면: 화면은 그 날을 "임시 조각(draft)"으로 보여주는데 RLS는 "마감됨"으로 판단해 조각 추가·삭제가 모두 거부됩니다(삭제 시 404 "지울 수 있는 조각이 없어요", 추가 시 409 "이미 마감한 날이에요").
**제안** `day_is_closed`의 의미(어떤 status부터 마감인지)를 정하고, `loadDb`도 같은 기준으로 맞추기. `failed`면 재시도 경로 필요.

### L7. 조각 날짜/시간을 클라이언트가 임의 지정
**위치** `src/app/api/me/entries/route.ts:12-21`, `src/app/api/me/artworks/route.ts:12`
**시나리오** `date`와 `entry.at`이 서로 독립이고 범위 검사가 없어, 2099년이나 1999년 날짜에 조각을 쓰고 마감할 수 있습니다. 미래 날짜를 미리 마감해 두면 그 날이 왔을 때 조각을 쓸 수 없습니다. 보안 문제라기보다 제품 규칙(“그날의 조각”) 문제입니다.
**제안** `date`는 `오늘 ± 1일`(시간대 차이 고려) 범위만 허용, `at`은 서버 시간으로 덮어쓰거나 `date`와 같은 날인지 확인.

### L8. 회원가입으로 이메일 가입 여부 확인 가능
**위치** `src/app/api/auth/signup/route.ts:25,34`
**시나리오** 가입 시도에 "이미 가입된 이메일이에요"(409)를 돌려주므로, 남의 이메일이 이 서비스(개인 일기)에 가입되어 있는지 확인할 수 있습니다. 로그인 쪽은 메시지를 통일했는데 가입 쪽에서 새고 있습니다. Supabase가 이메일 인증 켜짐 상태에서 일부러 숨기는 정보를 `identities.length === 0` 검사로 다시 드러내고 있습니다.
**제안** UX 상 필요하다면 유지하되 rate limit(M5)을 걸고, 아니면 "인증 메일을 보냈어요" 한 가지 응답으로 통일. 팀 판단 사항입니다.

### L9. Storage 버킷 설정
**위치** `supabase/schema.sql:188-202`, `src/app/api/me/route.ts:31`
**시나리오**
- 버킷에 `file_size_limit`/`allowed_mime_types`가 없어, 로그인 사용자가 자기 폴더에 임의 크기·임의 형식(예: HTML, SVG에 스크립트) 파일을 올릴 수 있습니다. 공개 버킷이라 그 URL을 그대로 퍼뜨릴 수 있습니다.
- 계정 삭제는 `auth.users`만 지우고 Storage 파일은 지우지 않습니다. 이미지 AI 연결 후에는 **탈퇴한 사람의 그림이 공개 URL로 계속 남습니다**.
**제안** `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('artworks','artworks',true, 2097152, '{image/png,image/webp,image/jpeg}')`; SVG는 허용하지 않기. 탈퇴 라우트에서 `deleteUser` 전에 `storage.from('artworks').list(userId)` → `remove()`.

### L10. 길이 검사 단위 차이
**위치** `src/server/validate.ts:24`, `src/app/api/auth/signup/route.ts:17`, `src/app/api/me/password/route.ts:13`
**시나리오**
- JS `string.length`는 UTF-16 단위, Postgres `char_length`는 문자 단위라 이모지 닉네임 7개(JS 14)는 DB는 허용하는데 API가 거부합니다. 반대 방향(API 통과·DB 거부)은 없어서 보안 문제는 아닙니다.
- 비밀번호 상한 72는 "글자"인데 bcrypt 한도는 72 **바이트**입니다. 한글 비밀번호는 한 글자 3바이트라 24자를 넘으면 Supabase가 거부하거나(→ `throw error` → 500) 잘린 값으로 해시될 수 있습니다.
**제안** 비밀번호는 `new TextEncoder().encode(pw).length <= 72`로 검사하고 안내 문구를 맞추기. 닉네임은 `[...v].length`로 세기.

### I1. 501 응답에 내부 정보
**위치** `src/server/ai/claude.ts:13`, `src/server/ai/openai.ts:13`, `src/server/http.ts:32-33`
`"claude: 아직 구현되지 않았습니다 (src/server/ai/claude.ts)"`처럼 소스 경로와 제공자 이름이 그대로 클라이언트에 나갑니다. 위험은 낮지만, 응답은 "AI 기능 준비 중이에요"로 두고 상세는 `console.error`로만.
또한 `AI_*_PROVIDER` 값이 잘못되면 `pick()`이 던진 일반 Error가 500으로 숨겨지는데(`ai/index.ts:17`), 이것은 바람직한 동작입니다.

### I2. `grant` 줄의 실제 효과
**위치** `supabase/schema.sql:60-62`
`grant select ... to anon`은 "anon은 select만"을 의도한 것으로 보이지만, Supabase 프로젝트는 보통 `public` 스키마 새 테이블에 `anon`/`authenticated`로 전체 권한을 주는 기본 권한(default privileges)이 걸려 있어 **이 줄이 권한을 줄이지는 못합니다**. 현재는 anon용 쓰기 정책이 없어 RLS가 막고 있으므로 안전하지만, 실수로 `to public` 정책을 만들면 anon 쓰기가 열립니다. 의도대로 하려면 `revoke insert, update, delete on all tables in schema public from anon;`를 명시하세요(§5에서 확인 방법 안내).

### I3. 보안 헤더 없음
**위치** `next.config.ts` (빈 설정)
CSP, `frame-ancestors`(클릭재킹 — 탈퇴 버튼 등), `Referrer-Policy`가 없습니다. `next.config.ts`의 `headers()`로 최소한 `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` 추가를 권합니다. Google Fonts를 쓰므로 CSP를 넣을 때 `fonts.googleapis.com`/`fonts.gstatic.com` 허용이 필요합니다.

---

## 5. 재현님이 직접 확인해 주셔야 할 항목 (Supabase 대시보드)

코드만으로는 판단할 수 없어 실제 프로젝트 설정 확인이 필요한 것들입니다. 각 항목은 "어디서 → 무엇을 보고 → 어떤 값이면 문제인지" 순서로 적었습니다.

1. **anon 기본 권한 (I2)**
   - 대시보드 → SQL Editor에서 실행:
     ```sql
     select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' order by 1, 2;
     ```
   - 결과에 `INSERT`/`UPDATE`/`DELETE`가 보이면 I2의 `revoke`를 적용할 대상입니다. `SELECT`만 보이면 문제없습니다.
2. **RPC 노출 (L1)**
   - SQL Editor:
     ```sql
     select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can_call
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public';
     ```
   - `day_is_closed`의 `anon_can_call`이 `true`면 L1이 실제로 열려 있습니다.
3. **Auth rate limit (M5)**
   - Authentication → Rate Limits 화면에서 "Sign-ups and sign-ins" 값 확인. 이 값이 **서비스 전체 사용자 합계**처럼 동작한다는 점(모든 요청이 Vercel IP에서 나감)을 감안해 정해야 합니다.
4. **이메일 인증 / 리다이렉트 URL**
   - README에 개발 중 "Confirm email" 끄기로 되어 있습니다. 배포 전에 다시 켤지 결정해 주세요(꺼져 있으면 남의 이메일로 가입 가능).
   - 켠다면 Authentication → URL Configuration의 Site URL이 Vercel 배포 주소인지, Redirect URLs에 와일드카드(`*`)가 과하게 들어가 있지 않은지 확인(오픈 리다이렉트 방지). 현재 코드는 `emailRedirectTo`를 쓰지 않아 Site URL로 이동합니다.
5. **세션 수명 (M2)**
   - Authentication → Sessions에서 Time-box/Inactivity timeout 설정 여부 확인. 쿠키는 400일이므로 이 값이 실제 로그인 유지 기간을 정합니다.

## 6. 권장 수정 순서 (제안)

수정은 재현님 결정 후 별도 PR로 진행하겠습니다. 영향 대비 작업량 기준 제안 순서입니다.

1. **H1 AI 라우트 로그인 필수 + 입력 상한** — 라우트 3개에 몇 줄. AI 연결 전에 반드시.
2. **M1 `readJson` Content-Type 검사** — `http.ts` 한 곳.
3. **M2 쿠키 `httpOnly`/`secure`** — `supabase.ts` 한 곳.
4. **M3·M4·L1 스키마 수정** — `schema.sql` 정책/제약 변경 후 SQL Editor에서 재실행 필요(재현님 작업).
5. **L2·L3·L5 오류 매핑 정리** — 사용자에게 보이는 500을 400/409로.
6. **M5 rate limit, M6 공개 전시 API 설계, L4·L7 서버 마감 라우트** — 설계 논의가 필요한 항목.
