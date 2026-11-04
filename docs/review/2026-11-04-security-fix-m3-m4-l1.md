# 보안 수정 보고서: M3 · M4 · L1 + "다시 그리기" (2026-11-04)

`docs/review/2026-11-04-security-review.md`의 **M3, M4, L1**을 고치고, 재현님 요청에 따라 **그림 "다시 그리기" 기능**(DB 함수 + API + 화면 버튼)을 함께 만든 작업 기록입니다.

## 1. 결정 사항 (재현님 선택)

| 질문 | 선택 |
|---|---|
| M3: 그림 직접 수정·삭제 | 사용자가 직접 수정·삭제하는 것은 **금지**. "다시 그리기(삭제 후 새로 만들기)"는 **전용 DB 함수로만** 허용 |
| 다시 그리기 범위 | DB 함수 + API + **화면 버튼까지 전부** |

## 2. 무엇이 바뀌었나

### M3. `daily_artworks` 직접 수정·삭제 차단 (`supabase/schema.sql`)

| 전 | 후 |
|---|---|
| RLS `for all`: 내 그림이면 모든 컬럼 UPDATE·DELETE 가능 | 정책을 **읽기(`read own`) + 만들기(`add own`)** 두 개로 분리. UPDATE/DELETE 정책이 없어 직접 변경 불가 |
| INSERT 때 `image_url`, `status`도 사용자가 지정 가능 | **컬럼 단위 권한**: 사용자는 `user_id, day, style, scene, summary, tags`만 넣을 수 있음. `image_url`/`status`/`created_at`은 서버 쪽 값 |

막힌 시나리오(리뷰 M3):
1. 그림 날짜 변경·삭제로 "마감한 날"을 다시 열기 → `permission denied`
2. `image_url`에 외부 추적 URL 넣기 → INSERT·UPDATE 모두 `permission denied`
3. `status`를 임의로 바꾸기 → `permission denied`

계정 삭제는 관리자 키(RLS·권한 무시)로 처리하므로 영향이 없습니다.

### "다시 그리기" (새 기능)

**흐름**: 그림 상세 화면 → **다시 그리기** 버튼 → 확인창 → 그날 조각으로 `/api/summarize` → `/api/draw` → `POST /api/me/artworks/:date/redraw` → DB 함수 `redraw_artwork()`

| 항목 | 동작 |
|---|---|
| 그림체 | **지금 프로필의 그림체**로 다시 그립니다(프로필에서 그림체를 바꿨다면 새 그림체로). 확인창에 "크레파스로 다시 그릴까요?"처럼 표시 |
| AI 사용 횟수 | summarize 1회 + draw 1회가 하루 한도에서 차감됩니다(확인창에 안내) |
| DB 처리 | 기존 행 삭제 + 새 행 생성을 **한 트랜잭션**에서 처리 |
| 마감 상태 | 처리 도중에도 다른 요청에서는 그날이 계속 "마감됨"으로 보여서 조각 추가·삭제 불가 (동시 실행 테스트로 확인) |
| 전시회 | 전시회에 걸려 있던 그림은 **같은 자리(position)·메모 그대로** 새 그림으로 교체 |
| 조각 | 그날 조각은 그대로 유지·연결 |
| 실패 시 | 트랜잭션 전체가 취소되어 **기존 그림이 그대로 남음**. 화면은 오류 문구를 `alert`로 표시 |
| 조각 0개인 날 | 버튼 비활성화(요약할 조각이 없음) |
| 화면 | 진행 중에는 "다시 그리는 중…" 표시, 버튼 잠금. 서버가 저장한 뒤에만 새 그림으로 바뀜 |

**보안 포인트**: `redraw_artwork()`은 `SECURITY DEFINER`지만 항상 `auth.uid()` 본인 행만 다루고, `anon`은 실행할 수 없습니다. 스타일·장면·길이는 테이블 제약이 그대로 검사합니다. 다른 사용자의 날짜를 넣으면 "그림이 없는 날이에요"(404)가 납니다.

### M4. 그림 `summary`/`tags` 크기 제한

| 위치 | 제한 |
|---|---|
| API (`artworkInputError` in `src/server/validate.ts`) | `summary` 1~500자, `tags` 최대 10개 × 각 1~20자. 위반 시 **400** |
| DB 제약 (`daily_artworks_summary_len`, `daily_artworks_tags_ok`) | 같은 값. `public.valid_tags()` 함수로 태그 검사 |

- 그림 만들기(`POST /api/me/artworks`)와 다시 그리기 API가 **같은 검사 함수**를 씁니다.
- AI 입력 상한(`AI_LIMITS`, 지난 PR)과 같은 숫자라 AI 결과가 그대로 저장됩니다.
- DB 제약은 `NOT VALID`로 추가했습니다. **이미 저장된 옛 행 때문에 SQL 실행이 실패하지 않고**, 새로 저장되는 행부터 검사합니다. 옛 행 확인 쿼리는 §5에 있습니다.
- DB 제약에 걸리면(직접 호출 등) 500이 아니라 **400** "그림 정보가 너무 길거나 올바르지 않아요"로 답합니다.
- 태그 검사가 "빈 문자열 불가"로 조금 엄격해졌습니다(`/api/draw`도 동일). mock은 빈 태그를 만들지 않습니다.

리뷰 M4의 장기 제안(마감을 서버 한 곳에서 처리해 클라이언트가 보낸 AI 결과를 믿지 않기)은 이번 범위에 넣지 않았습니다.

### L1. `day_is_closed()` 정보 노출 차단

| 전 | 후 |
|---|---|
| 아무 `user_id`나 넣으면 그 사람이 그날 일기를 썼는지 답함 | **본인 것만** 답하고, 남의 것은 항상 `false` |
| anon도 RPC로 호출 가능 | anon은 `permission denied`, 로그인 사용자만 실행 가능 |

조각 RLS 정책은 항상 본인 `user_id`로 이 함수를 부르므로 동작이 같습니다. 마감된 날 조각 추가·삭제 금지와 열린 날 정상 동작을 모두 확인했습니다.

### 디버그 로그

| 위치 | 로그 | 켜지는 조건 |
|---|---|---|
| 서버 | `[artwork] redrawn { userId, date, style, scene }` | `npm run dev`, 또는 배포에서 `DEBUG_SECURITY=1` |
| 서버 | `[artwork] redraw_artwork missing: run supabase/schema.sql ...` | **항상** (SQL을 다시 실행하지 않아 함수가 없을 때) |
| 브라우저 콘솔 | `[redraw] start / summarized / drawn / saved` | `npm run dev`에서만 |

`src/server/debug.ts`에 범용 `debugLog(scope, ...)`를 추가했고, 기존 `secLog`는 이를 사용합니다.

## 3. 변경 파일

| 파일 | 내용 |
|---|---|
| `supabase/schema.sql` | M3 정책 분리·컬럼 권한, M4 제약 + `valid_tags()`, L1 `day_is_closed()` 수정·권한, `redraw_artwork()` |
| `src/server/validate.ts` | `isTagList` 빈 태그 금지, `ArtworkInput`, `artworkInputError()` |
| `src/server/db/data.ts` | `redrawArtwork()`, 제약 위반(23514) → 400 매핑 |
| `src/server/debug.ts` | `debugLog()` 추가 |
| `src/app/api/me/artworks/route.ts` | M4 검사 함수 사용 |
| `src/app/api/me/artworks/[date]/redraw/route.ts` (새 파일) | 다시 그리기 API |
| `src/lib/store.tsx` | `redrawArtwork()` 액션 |
| `src/app/gallery/[date]/page.tsx` | "다시 그리기" 버튼, 진행 표시, 브라우저 디버그 로그 |
| `scripts/security-smoke.sh` | M4·다시 그리기 검사 6개 추가 (총 19개) |

## 4. 검증 결과 (이 세션에서 실행)

| 검사 | 결과 |
|---|---|
| `tsc --noEmit` / `eslint` / `next build` | 통과 / 에러 0 (기존 폰트 경고 1) / 성공 |
| **이전 과정 재현** | 로컬 PostgreSQL 16에 기존 `main` 스키마 적용 → 500자 넘는 요약·태그 12개짜리 **옛 행 저장** → 새 `schema.sql` 실행: **오류 없이 성공**, 재실행도 성공. §5의 옛 행 찾기 쿼리가 그 행을 정확히 찾음 |
| M3 | 앱이 쓰는 컬럼으로 그림 만들기 성공 / `image_url`·`status` 넣어 만들기, 날짜·URL 수정, 삭제 → 모두 `permission denied` |
| M4 | 요약 501자·빈 요약·태그 11개·21자 태그·빈 태그 → 제약 위반 / 경계값(요약 500자, 태그 10개×20자) → 저장됨 |
| L1 | 본인 마감일 → `true` / 다른 사용자가 물으면 → `false` / anon → `permission denied` / 마감된 날 조각 추가·삭제 여전히 거부 / 열린 날 조각 추가·삭제 정상 |
| redraw 함수 | 내용 교체, 전시 위치 유지(`@1` → 새 id `@1`), 조각 유지·잠김 / 그림 없는 날 → 404 / 잘못된 장면·긴 요약·태그 11개 → 오류 + **기존 그림 유지** / 다른 사용자 → A의 그림 못 바꿈 / anon → 거부 |
| redraw 동시성 | 세션 1이 redraw 트랜잭션 진행 중(3초 대기)일 때 세션 2에서 `day_is_closed` = `true`, 조각 추가 → RLS 거부 |
| 화면 (Chromium, 390px 폭) | 로그인 → 상세 화면 → 다시 그리기 → 확인창 "크레파스로 다시 그릴까요?…" → "다시 그리는 중…" → AI 할당량 2회 차감 → `redraw_artwork` 호출 인자 정상 → 새 요약·그림체 배지 반영. 버튼 3개가 한 줄에 맞게 배치됨 |
| `scripts/security-smoke.sh` | **19개 모두 통과** |

**한계**: 실제 Supabase에는 연결하지 않았습니다. 화면 테스트는 Supabase 응답을 흉내 낸 가짜 서버로 했고, DB 동작은 로컬 PostgreSQL에서 따로 검증했습니다.

## 5. 재현님이 하실 일 (순서대로)

> ⚠️ **1번을 먼저 하지 않으면 머지 후 "다시 그리기"가 실패합니다**(함수 없음). 기존 기능(마감, 전시)은 영향이 없습니다.

1. **Supabase에 스키마 다시 적용**
   1. Supabase 대시보드 → **SQL Editor** → **New query**를 엽니다.
   2. 이 브랜치의 `supabase/schema.sql` 전체를 붙여 넣고 **Run**을 누릅니다. 다시 실행해도 안전하며 기존 데이터는 그대로입니다.
   3. 적용 확인: 아래 결과가 `t | t | f`면 성공입니다.
      ```sql
      select
        exists (select 1 from pg_proc where proname = 'redraw_artwork')  as redraw_ok,
        exists (select 1 from pg_constraint where conname = 'daily_artworks_summary_len') as m4_ok,
        has_function_privilege('anon', 'public.day_is_closed(uuid, date)', 'execute') as anon_can_probe;
      ```
   4. 옛 데이터 확인(선택): 아래가 0행이면 모든 그림이 새 제한 안에 있습니다. 행이 나오면 알려주세요. 정리 방법을 같이 정하겠습니다.
      ```sql
      select user_id, day from public.daily_artworks
       where char_length(summary) not between 1 and 500 or not public.valid_tags(tags);
      ```
2. **미리보기에서 점검 스크립트** (재현님 컴퓨터, 레포 루트): 마지막 줄이 `== 19 passed, 0 failed`면 성공입니다.
   ```bash
   bash scripts/security-smoke.sh https://<PR의-dayily-diary-미리보기-주소>
   ```
3. **화면 확인** (미리보기 주소)
   1. 로그인 → **갤러리**에서 그림이 있는 날을 엽니다.
   2. 아래쪽 **다시 그리기**를 누르고 확인창에서 **확인**을 누릅니다.
   3. "다시 그리는 중…"이 잠깐 보인 뒤 요약 문구(또는 그림체 배지)가 바뀌면 성공입니다.
   4. 그 그림이 전시회에 걸려 있었다면 **전시회** 화면에서 같은 자리에 그대로 있는지 확인합니다.
   5. (선택) 마이페이지에서 그림체를 바꾼 뒤 다시 그리면 새 그림체로 그려지는지 봅니다.
   6. (선택) 하루 한도(draw 10회)를 넘기면 "오늘 AI 사용 횟수를 다 썼어요…" 알림이 뜨고 기존 그림이 그대로 남는지 봅니다.

## 6. 남은 일

- 리뷰 M5(로그인 rate limit), M6(공개 전시 캡션), L2~L10, I1~I3
- M4 장기 과제: 마감·다시 그리기를 서버 한 곳에서 처리해서, 클라이언트가 보낸 AI 결과를 그대로 믿지 않도록 하기
- 이미지 AI를 붙일 때 `image_url`/`status`를 서버에서 쓰는 경로 만들기 (지금은 사용자가 쓸 수 없게 막아 둠)
