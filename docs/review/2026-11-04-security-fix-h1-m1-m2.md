# 보안 수정 보고서: H1 · M1 · M2 (2026-11-04)

`docs/review/2026-11-04-security-review.md`(PR #2)의 발견 사항 중 **H1, M1, M2**를 고친 작업 기록입니다.

## 1. 결정 사항 (재현님 선택)

| 질문 | 선택 |
|---|---|
| PR 위치 | 문서 PR(#2)과 분리해 새 PR로 |
| H1 호출 횟수 제한 | **Supabase 테이블**로 구현 (`ai_usage` + `consume_ai_quota()`) |
| M1 범위 | **Content-Type 검사 + Origin 검사** 둘 다 |

## 2. 무엇이 바뀌었나

### H1. AI 라우트 보호 (`/api/summarize`, `/api/draw`, `/api/curate`)

| 전 | 후 |
|---|---|
| 로그인 없이 누구나 호출 | 로그인 필수 (없으면 **401**) |
| 입력 크기 제한 없음 | 상한 초과 시 **400** (아래 표) |
| 호출 횟수 제한 없음 | 사용자별 하루 한도, 초과 시 **429** |

**입력 상한** (`src/server/validate.ts`의 `AI_LIMITS`)

| 항목 | 상한 | 근거 |
|---|---|---|
| summarize `entries` | 1~50개, 각 `text` 1~140자 | 조각 본문 DB 제약과 동일 |
| draw `summary.summary` | 1~500자 | mock 요약 최대 약 445자 |
| draw `summary.tags` | 최대 10개 × 20자 | mock 태그 최대 7개 |
| curate `periodLabel` | 1~30자 | "이번 주", "11월", "가을" |
| curate `summaries` | 최대 100개 × 500자 | 가장 긴 기간(계절)이 92일 |
| curate `top` | 최대 10개 | 화면은 3개 사용 |

**하루 호출 한도** (한국 시간 기준 날짜, `supabase/schema.sql`의 `consume_ai_quota`)

| 종류 | 한도 | 이유 |
|---|---|---|
| summarize | 20회 | 하루 마감 1번 + 재시도 여유 |
| draw | 10회 | 이미지가 가장 비쌈 |
| curate | 20회 | 기간 탭 전환마다 1회 호출 |

한도를 바꾸려면 `schema.sql`의 `case p_kind when 'summarize' then 20 ...` 숫자만 고치고 SQL Editor에서 다시 실행하면 됩니다.

**설계 포인트**
- 카운트는 `public.ai_usage` 테이블에 저장. 사용자는 **읽기만** 가능하고(RLS), 쓰기는 `SECURITY DEFINER` 함수 `consume_ai_quota()`만 할 수 있어서 **자기 카운터를 0으로 되돌릴 수 없습니다.**
- 한도 숫자는 함수 안에 있고 인자로 받지 않습니다. 사용자가 RPC를 직접 호출해도 자기 할당량만 줄어듭니다.
- `insert ... on conflict do update ... where count < 한도` 한 문장으로 처리해서, 동시에 여러 번 호출해도 한도를 넘지 못합니다.
- `anon`은 이 함수를 실행할 수 없습니다(`revoke execute`).
- 카운터 확인이 실패하면(예: 아직 SQL을 다시 실행하지 않아 함수가 없을 때) **안전하게 차단(503)**하고 서버 로그에 원인을 남깁니다.
- AI 호출이 실패해도 한 번은 사용한 것으로 셉니다(재시도 남용 방지).

### M1. CSRF 방어

1. **Content-Type 검사** (`src/server/http.ts`의 `readJson`): `Content-Type: application/json`이 아니면 본문을 읽지 않아 각 라우트가 **400**을 돌려줍니다. HTML 폼은 이 타입을 보낼 수 없어서, 리뷰에서 설명한 `text/plain` 폼 로그인 CSRF가 막힙니다.
2. **Origin 검사** (`src/middleware.ts` + `src/server/csrf.ts`): `/api/*`로 오는 POST/PUT/PATCH/DELETE의 `Origin`이 자기 호스트와 다르면 **403**입니다.
   - `Origin`이 없는 요청(curl, 서버 간 호출)은 통과합니다. 브라우저는 교차 사이트 쓰기 요청에 항상 `Origin`을 붙이므로 CSRF에는 쓸 수 없습니다.
   - GET은 막지 않습니다(조회는 상태를 바꾸지 않음).
   - 로그아웃처럼 본문이 없는 요청도 이 검사로 보호됩니다.

### M2. 인증 쿠키 플래그 (`src/server/supabase.ts`)

| 플래그 | 전 | 후 |
|---|---|---|
| `HttpOnly` | 없음 (JS로 토큰 읽기 가능) | **있음** |
| `Secure` | 없음 | **배포(production)에서 있음**, `npm run dev`에서는 없음(로컬 http 때문) |
| `SameSite` | Lax | Lax (그대로) |
| 유지 기간 | 400일 | 400일 (그대로, 아래 "남은 일" 참고) |

브라우저 코드는 원래 `sb-*` 쿠키를 읽지 않으므로 화면 동작은 바뀌지 않습니다(`document.cookie` 사용처 없음 확인).

### 디버그 로그 (`src/server/debug.ts`)

거부된 요청마다 서버 로그에 `[security] ...`가 찍힙니다.
- `npm run dev`에서는 항상 켜집니다.
- 배포 환경에서는 Vercel 환경변수 `DEBUG_SECURITY=1`일 때만 켜집니다.
- 단, **할당량 확인 실패**(`AI quota check failed`)는 모든 AI 기능이 멈추는 문제라 항상 기록합니다.
- 비밀번호, 쿠키, 요청 본문은 기록하지 않습니다.

| 로그 | 뜻 |
|---|---|
| `[security] non-JSON body rejected` | Content-Type이 JSON이 아닌 요청을 거부함 (M1) |
| `[security] cross-origin request blocked` | 다른 사이트에서 온 쓰기 요청을 거부함 (M1) |
| `[security] AI quota ok` / `AI quota exceeded` | 할당량 통과 / 초과 (H1) |
| `[security] AI quota check failed` + `hint: run supabase/schema.sql ...` | 할당량 함수가 없음 → SQL 재실행 필요 |

## 3. 변경 파일

| 파일 | 내용 |
|---|---|
| `src/app/api/summarize/route.ts` | 로그인 필수 + 입력 상한 + 할당량 |
| `src/app/api/draw/route.ts` | 〃 |
| `src/app/api/curate/route.ts` | 〃 |
| `src/server/db/quota.ts` (새 파일) | `consumeAiQuota()`: RPC 호출 → 429/503 변환 |
| `src/server/validate.ts` | `AI_LIMITS`, `isInt`, `isTagList` 추가 |
| `src/server/http.ts` | `readJson`에 Content-Type 검사 |
| `src/server/csrf.ts` (새 파일) | `isSameOrigin()` |
| `src/middleware.ts` (새 파일) | `/api/*` 쓰기 요청 Origin 검사 |
| `src/server/supabase.ts` | 쿠키 `httpOnly`/`secure` |
| `src/server/debug.ts` (새 파일) | `secLog()` 디버그 로그 |
| `supabase/schema.sql` | `ai_usage` 테이블, RLS, `consume_ai_quota()` |
| `scripts/security-smoke.sh` (새 파일) | 로그인 없이 돌리는 점검 스크립트 |

## 4. 검증 결과 (이 세션에서 실행)

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 |
| `npx eslint` | 에러 0 (기존 폰트 경고 1개) |
| `npx next build` | 성공 (Middleware 포함) |
| `schema.sql` 실행 / 재실행 | 로컬 PostgreSQL 16 + Supabase 흉내 스키마(`auth.users`, `auth.uid()`, `storage`, anon/authenticated 역할, Supabase식 기본 권한)에서 **두 번 연속 오류 없이 실행** |
| 할당량 함수 | draw 12회 호출 → 10회 `true` 후 `false` / 사용자 B는 별도 카운트 / 사용자가 `ai_usage` 직접 UPDATE·DELETE·INSERT → `permission denied` / 다른 사용자 행 안 보임 / anon 호출 → `permission denied` / 잘못된 kind → 오류 |
| `scripts/security-smoke.sh` | **13개 모두 통과** (로그인 없는 AI 호출 401, 상한 초과 400, text/plain 로그인 400, 다른 Origin 403, `Origin: null` 403, GET은 통과, 같은 Origin 통과) |
| 쿠키 플래그 | 가짜 Supabase Auth 서버로 로그인 → `Set-Cookie: ...; Secure; HttpOnly; SameSite=lax` 확인, 브라우저(Chromium)에서 `document.cookie`가 빈 값 |
| 실제 브라우저 같은 출처 요청 | Chromium에서 페이지 → `/api/auth/login` fetch가 200 (미들웨어에 안 막힘) |
| 로그인 상태 AI 호출 | 할당량 남음 → 200, 초과 → 429, 함수 없음 → 503 + 서버 로그에 힌트 |

**한계**: 실제 Supabase 프로젝트에는 연결하지 않았습니다(`.env*` 없음). 아래 §5 순서대로 재현님이 실제 환경에서 확인해 주셔야 합니다.

## 5. 재현님이 하실 일 (순서대로)

> ⚠️ **1번을 먼저 하지 않으면 머지 직후부터 오늘 화면의 "마감"과 큐레이터가 503으로 실패합니다.** 할당량 함수가 DB에 없기 때문입니다.

1. **Supabase에 스키마 다시 적용**
   1. https://supabase.com/dashboard → 하루조각 프로젝트 → 왼쪽 **SQL Editor**로 갑니다.
   2. **New query**를 열고, 이 브랜치의 `supabase/schema.sql` 전체를 복사해 붙여 넣은 뒤 **Run**을 누릅니다. 다시 실행해도 안전한 스크립트라 기존 데이터는 그대로입니다.
   3. 확인: 같은 SQL Editor에서 아래를 실행해 `ai_usage | t`가 나오면 성공입니다.
      ```sql
      select 'ai_usage', exists (select 1 from pg_proc where proname = 'consume_ai_quota');
      ```
2. **Vercel 미리보기에서 점검 스크립트 실행**
   1. 이 PR의 Vercel 봇 댓글에서 `dayily-diary` 프로젝트의 **Preview** 주소를 복사합니다.
   2. 레포 루트에서 실행합니다.
      ```bash
      bash scripts/security-smoke.sh https://<복사한-미리보기-주소>
      ```
   3. 마지막 줄이 `== 13 passed, 0 failed`면 성공입니다.
   4. 모든 항목이 `401`로 실패한다면 Vercel의 미리보기 보호(Deployment Protection)가 켜져 있는 것입니다. 이때는 브라우저 확인(3번)만 하시거나, 머지 후 운영 주소로 실행해 주세요.
3. **브라우저에서 직접 확인** (미리보기 주소)
   1. 로그인 → 오늘 화면에서 조각 1개 쓰고 **마감** → 그림이 생기면 H1의 정상 경로가 통과한 것입니다.
   2. 큐레이터 화면에서 해설이 나오는지 확인합니다.
   3. F12 개발자도구 → **Application** → **Cookies**에서 `sb-...-auth-token` 행의 **HttpOnly**, **Secure** 칸에 체크 표시가 있으면 M2 확인 완료입니다.
   4. 같은 개발자도구 **Console**에서 `document.cookie`를 입력했을 때 `sb-` 쿠키가 보이지 않아야 합니다.
4. **(선택) 디버그 로그 보기**: Vercel → `dayily-diary` 프로젝트 → **Settings → Environment Variables**에 `DEBUG_SECURITY` = `1`(Preview 환경)을 추가하고 재배포하면, **Logs** 탭에서 `[security]` 로그를 볼 수 있습니다. 확인이 끝나면 지워도 됩니다.

### 참고: 머지 후 영향

- 기존 로그인 사용자는 다음 토큰 갱신 때 쿠키가 새 플래그로 다시 쓰입니다. **다시 로그인할 필요는 없습니다.**
- 이전 데이터 중 `summary`가 500자를 넘는 그림이 있다면 큐레이터가 400을 낼 수 있습니다. mock으로 만든 요약은 최대 약 445자라 해당 없을 것으로 봅니다(리뷰 M4에서 DB 상한과 함께 정리 예정).

- 하루에 조각을 **50개 넘게** 쓰면 마감 시 `/api/summarize`가 400을 돌려줍니다(입력 상한). 지금은 조각 입력 개수 제한이 없어서 생기는 차이입니다. 필요하면 상한을 올리거나 조각 입력 쪽에도 같은 제한을 두겠습니다.
- 오류가 나면 오늘 화면은 서버 문구를 그대로 `alert`로 보여주고 조각은 그대로 남습니다. 한도 초과 시에는 "오늘 AI 사용 횟수를 다 썼어요. 내일 다시 해주세요"가 보입니다.

## 6. 이번에 하지 않은 것 (남은 일)

- 쿠키 유지 기간 400일 단축: 서비스 정책을 정한 뒤 결정
- 리뷰의 M3~M6, L1~L10, I1~I3
- 로그인/회원가입 rate limit(M5): 이번 `ai_usage` 방식은 로그인한 사용자 기준이라 로그인 전 요청에는 쓸 수 없어 별도 설계가 필요
