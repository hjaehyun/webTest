# 하루조각

무심코 남긴 조각글이 모여, 자정에 그날의 그림 한 장이 됩니다.

현재 단계: **Supabase 연동 완료** (로그인 · DB · RLS). AI는 아직 모의 함수(`mock`)가 대신하고, 그림은 예시 SVG입니다.

## 실행

1. Supabase 프로젝트 준비
   - [supabase.com](https://supabase.com)에서 프로젝트 생성 (지역: Northeast Asia (Seoul))
   - SQL Editor에 `supabase/schema.sql` 전체를 붙여넣고 Run (다시 실행해도 안전)
   - 개발 중에는 Authentication → Sign In / Providers → Email → "Confirm email" 끄기
2. 환경변수
   ```bash
   cp .env.example .env.local
   ```
   Project Settings → API Keys 값을 `.env.local`에 입력. `SUPABASE_SECRET_KEY`는 RLS를 무시하는 키이므로 절대 커밋/공유하지 않기.
3. 실행
   ```bash
   npm install
   npm run dev
   ```

http://localhost:3000 (모바일 폭 기준 디자인, 데스크톱에서는 가운데 430px 컬럼)

## 화면

| 경로 | 화면 |
|---|---|
| `/` | 로그인 / 회원가입 (이메일 + 비밀번호) |
| `/profile` | 프로필: 이름 → 그림체 선택 |
| `/today` | 오늘의 조각 (채팅형 입력, 마감하면 그림 생성) |
| `/gallery` | 달력 갤러리 |
| `/gallery/[date]` | 그림 상세 |
| `/me` | 마이페이지 (기록 요약, 그림체, 비밀번호 변경, 탈퇴) |
| `/curator` | AI 큐레이터 (이번 주 / 이번 달 / 계절) |
| `/exhibition` | 나의 전시회 |
| `/exhibition/pick` | 전시할 그림 고르기 |
| `/e/[id]` | 공개 전시 관람 (로그인 없이, `GET /api/exhibitions/[id]`) |

## 구조

```
supabase/schema.sql   테이블 5개 + RLS + 트리거 + RPC + Storage 버킷
supabase/migrations/  이미 만든 DB에 덧붙일 변경분 (SQL Editor에서 실행, 다시 실행해도 안전)
supabase/tests/       로컬 Postgres로 RLS 확인: bash supabase/tests/run-local.sh
src/
  app/                화면 (App Router, 화면별 CSS Module)
  app/api/            서버 API: auth/*, me/*, exhibitions/[id](공개), summarize, draw, curate
  components/         Art(임시 그림), ui(TopBar, BottomNav, Screen, ProfileButton)
  lib/
    types.ts          DB 테이블과 같은 모양의 타입
    store.tsx         화면용 데이터 저장소 (/api/me/* 호출)
    ai.ts             AI 클라이언트 (/api/summarize, /api/draw, /api/curate)
  server/
    supabase.ts       Supabase 클라이언트 (요청 사용자 권한 / 관리자)
    auth.ts           로그인 사용자 확인
    db/data.ts        쿼리
    db/publicExhibition.ts  공개 전시 조회 (anon, 로그인 없음)
    ai/               AI 제공자 (mock 동작, claude/openai는 스텁)
```

브라우저는 Supabase를 직접 호출하지 않고 전부 `/api/*`를 거칩니다. 권한은 RLS가 지킵니다.

## 다음 단계

1. AI 업체 결정 후 `src/server/ai/claude.ts` 또는 `openai.ts` 구현
2. 그림을 Storage에 올리고 `Art` 컴포넌트 → `<img>`
3. 자정 자동 마감: Vercel Cron
