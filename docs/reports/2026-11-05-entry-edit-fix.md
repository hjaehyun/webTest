# 조각 수정 버그 수정 (2026-11-05)

## 문제

오늘 화면에서 조각을 누르고 **"수정"을 누르는 순간 원본이 서버에서 삭제**됐습니다
(`DELETE /api/me/entries/:id`). 그 뒤 글만 입력창에 옮겨 두고, 다시 올리면 새 조각으로 `POST` 했습니다.

- 수정하다가 새로고침하거나 다른 탭으로 가면 **조각이 영구히 사라짐** (배포 사이트에서 재현 확인)
- 끝까지 수정해도 **작성 시각이 수정 시각으로 바뀌고 순서가 맨 아래로 이동**

원인: 서버에 조각을 "고치는" API가 없고(추가/삭제만), DB 정책(RLS)도 update를 허용하지 않았음.

## 고친 내용

| 파일 | 변경 |
|---|---|
| `supabase/schema.sql` | `entries`는 **본문(body) 컬럼만** update 가능하게 권한 부여, RLS `entries: edit on open day` 추가 (내 조각 + 마감 안 한 날만) |
| `supabase/migrations/2026-11-05-entry-edit.sql` | 위 변경분만 담은 SQL. 운영 DB에 이것만 실행하면 됨 |
| `src/server/db/data.ts` | `updateEntry()` 추가. 0건이면 404 "고칠 수 있는 조각이 없어요" (마감한 날 / 남의 조각 / 없는 조각) |
| `src/app/api/me/entries/[id]/route.ts` | `PATCH { text }` 추가. 입력 검증(uuid, 1~140자, JSON만)은 로그인 확인 전에 함. 디버그 로그 `[entries] edited` / `[entries] edit failed` (본문은 기록 안 함) |
| `src/lib/store.tsx` | `editEntry()` 추가: 화면에서 글만 바꾸고 PATCH 저장. 개발 모드에서 브라우저 콘솔에 `[entries] edit` 디버그 출력 |
| `src/app/today/page.tsx`, `today.module.css` | "수정"은 이제 **수정 모드만 켬** (원본 유지). 입력창 위 "조각을 고치는 중이에요 · 취소" 바, Esc로 취소, 내용이 같으면 요청 안 보냄, 수정 중엔 마감 바/질문 칩 숨김, 수정 중인 조각을 지우면 수정 모드 해제 |
| `scripts/security-smoke.sh` | PATCH 검증 6개 추가 |
| `supabase/tests/*` | 로컬 Postgres로 RLS를 확인하는 테스트 (Supabase 흉내 stub + 테스트 SQL + 실행 스크립트) |
| `scripts/ui-entry-edit.cjs` | `/api`를 흉내 내서 화면 동작을 확인하는 Playwright 테스트 |

## 테스트 결과

| 테스트 | 결과 |
|---|---|
| `tsc --noEmit`, `npm run build` | ✅ 통과 (lint 경고 1건은 기존 폰트 경고) |
| `scripts/security-smoke.sh` (로컬 빌드) | ✅ 25/25 (새 PATCH 항목 6개 포함) |
| `supabase/tests/run-local.sh` (Postgres 16) | ✅ 10/10 — 기존 schema에서는 첫 항목에서 **실패**하는 것도 확인 |
| `scripts/ui-entry-edit.cjs` | ✅ 16/16 — 취소/Esc/새로고침 시 요청 없음, 저장 시 PATCH 1번만, 순서·시각 유지 |

RLS 테스트 항목: 내 조각 수정 가능 · 시각/날짜 그대로 · 마감한 날 0건 · day/written_at/user_id 변경 거부 ·
141자 거부 · 다른 사용자 0건 · 로그아웃(anon) 거부.

## 테스트 못 한 것

이 작업 환경에서는 Supabase 접속이 막혀 있어서, **실제 Supabase DB + 배포 사이트에서의 끝까지 흐름**은
확인하지 못했습니다. 아래 "배포 순서" 4번으로 확인해 주세요.

## 배포 순서 (중요: 순서대로)

1. **SQL 먼저 실행**: Supabase 대시보드 → SQL Editor → `supabase/migrations/2026-11-05-entry-edit.sql` 내용 붙여넣기 → Run.
   마지막 결과 표에 `entries: edit on open day | UPDATE` 줄이 보이면 적용된 것입니다.
   - SQL보다 코드를 먼저 배포하면 수정 저장 시 "고칠 수 있는 조각이 없어요"가 뜹니다 (원본은 지워지지 않으니 데이터 손실은 없음).
2. PR 머지 → Vercel 자동 배포
3. (선택) 디버그 로그를 보려면 Vercel → Settings → Environment Variables에 `DEBUG_SECURITY=1` 추가 후 Redeploy →
   Vercel → Logs에서 `[entries] edited` 확인
4. 배포 사이트에서 확인: 조각 3개 쓰기 → 가운데 조각 "수정" → 새로고침(조각이 그대로 있어야 함) →
   다시 "수정" → 글 고치고 Enter → 같은 자리·같은 시각에 고친 글이 보이고, 새로고침해도 유지
