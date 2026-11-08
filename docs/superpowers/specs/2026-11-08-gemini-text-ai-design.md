# 텍스트 AI: Gemini 무료 등급 + 기능별 모델 분산 — 설계

- 작성: 2026-11-08
- 상태: 기획 확정 (구현 전)
- 범위: 하루조각의 텍스트 AI(장면 정리, 큐레이터 해설)를 Google Gemini API 무료 등급으로 구현
- 관련: 원본 기획서 7·8쪽 "텍스트 AI"(업체 미정) → Gemini로 확정. 이미지 AI는 별도로 정한다.

---

## 1. 왜

- 기획서에는 텍스트 AI 업체가 정해져 있지 않았다. 비용 없이 시연하고 테스트하기 위해 Gemini 무료 등급을 쓴다.
- 무료 등급은 **한도가 프로젝트 단위**라서 사용자 전원이 키 하나의 한도를 나눠 쓴다. 한도는 **모델마다 따로** 계산되므로, 기능별로 다른 모델을 쓰고, 막히면 다음 모델로 넘어가는 방식으로 쓸 수 있는 총량을 늘린다.
- 외부 API로 한 개(Gemini API)로 센다.

## 2. 기능별 모델 배정

| 기능 | 라우트 | 1순위 | 2순위 (1순위가 429/오류/시간 초과일 때) | 마지막 |
|---|---|---|---|---|
| 장면 정리 + mood (마감, 다시 그리기) | `POST /api/summarize` | `gemini-3.8-flash` | `gemini-3.5-flash-lite` | mock |
| 큐레이터 해설 | `POST /api/curate` | `gemini-3.6-flash` | `gemini-3.1-flash-lite` | mock |

- 두 기능은 서로 다른 모델을 쓰므로, 한쪽이 한도를 다 써도 다른 쪽은 영향을 받지 않는다.
- 장면 정리는 품질이 중요하고 가장 자주 쓰이므로 가장 좋은 Flash를 1순위로 둔다. 큐레이터는 가끔 쓰이므로 그다음 Flash를 1순위로 둔다.
- Pro 계열(`gemini-3.1-pro-preview`, `gemini-4-argon`)은 무료 등급이 없으므로 쓰지 않는다.
- preview 모델(`gemini-3-flash-preview`)은 예고 없이 사라질 수 있어서 기본 배정에서 뺀다.
- **모델 이름은 코드에 박지 않고 환경변수로 둔다.** Google이 모델을 바꾸거나 없애도 Vercel 환경변수만 고치면 된다.

```
AI_TEXT_PROVIDER=gemini
GEMINI_API_KEY=                                   # 서버 전용
GEMINI_MODELS_SUMMARIZE=gemini-3.8-flash,gemini-3.5-flash-lite
GEMINI_MODELS_CURATE=gemini-3.6-flash,gemini-3.1-flash-lite
```

## 3. 얼마나 쓸 수 있나 (AI Studio 한도 페이지, 2026-11-08 재현님 확인)

| 모델 | RPM | TPM | RPD |
|---|---|---|---|
| `gemini-3.8-flash` | 5 | 250K | 20 |
| `gemini-3.6-flash` | 5 | 250K | 20 |
| `gemini-3.5-flash-lite` | 15 | 250K | 500 |
| `gemini-3.1-flash-lite` | 15 | 250K | 500 |

| 기능 | 하루 가능 횟수 | 의미 |
|---|---|---|
| 장면 정리 | 약 520회 (20 + 500) | 앞의 20회는 Flash 품질, 그다음은 Flash-Lite |
| 큐레이터 | 약 520회 (20 + 500) | 같은 구조 |
| 둘 다 바닥남 | mock으로 대체 | 마감은 실패하지 않음 |

- Flash는 분당 5회라서, 시연 중 여러 명이 동시에 마감하면 6번째부터 Flash-Lite가 답한다(설계된 대체 동작).
- 하루 한도는 태평양 시간 자정에 초기화된다. 한국 시간으로는 오후 4시이고, 서머타임이 끝나는 겨울에는 오후 5시다.

## 4. 동작

1. 라우트는 지금처럼 로그인 확인 → 사용자별 하루 한도(`consume_ai_quota`, summarize 20 / curate 20) → 텍스트 AI를 호출한다.
2. `gemini.ts`는 그 기능의 모델 목록을 앞에서부터 시도한다.
   - 성공하면 결과를 반환한다.
   - 429(한도), 5xx, 네트워크 오류, **60초 초과**, 응답 형식 오류 → 다음 모델로 넘어간다. (8초 → 45초(실측 최대 40초) → 60초(2026-11-08 실측에서 45초도 넘김). 라우트 `maxDuration = 90`, Vercel Hobby 최대 300초 안.)
   - 400(요청 오류)이나 키 오류는 다음 모델에서도 똑같이 실패하므로 바로 mock으로 간다. 로그에 원인을 남긴다.
3. 목록을 다 실패하면 mock 결과를 반환한다. 사용자는 실패 화면 대신 "임시 요약"을 받는다.
4. 응답은 **JSON 스키마로 고정**한다(Gemini structured output: `responseMimeType: application/json` + `responseSchema`).
   - 장면 정리: `{ summary: string(1~500자), tags: string[](≤10, 각 1~20자), scene: Scene enum, mood: Mood enum }`
   - 큐레이터: `{ headline: string, body: string }`
   - 받은 뒤 `src/server/validate.ts`의 같은 규칙으로 다시 검사하고, 어긋나면 "응답 형식 오류"로 보고 다음 모델로 넘어간다.
5. 어떤 모델이 답했는지는 서버 로그(`debugLog("ai", ...)`)에만 남긴다. 화면에는 mock으로 대체된 경우만 표시한다(다음 절).

## 5. 화면 변경

- mock으로 대체된 요약에는 그림 상세의 장면 요약 옆에 작은 표시 "임시 요약 · 다시 그리기로 바꿀 수 있어요"를 단다.
  - 구현: `DaySummary`에 `source?: "ai" | "fallback"`을 추가한다. 저장할 필요는 없고, 그때 화면에만 쓴다.
- **개인정보 안내**: 가입 화면과 사용 가이드(`/guide`)에 한 줄을 넣는다.
  > 조각글은 장면 정리를 위해 Google Gemini로 전송돼요. 무료 등급에서는 Google 서비스 개선에 쓰일 수 있어요.

## 6. 무료 등급 조건 (Gemini API 추가 약관)

- 무료 등급에서 보낸 입력과 출력은 Google 제품 개선과 학습에 쓰이고, 사람 검토자가 볼 수 있다(계정과 분리된 상태로).
- 약관 원문: "Do not submit sensitive, confidential, or personal information to the Unpaid Services."
- 하루조각은 일기를 보내므로 이 조건과 부딪힌다. 수업 과제 범위에서는 이렇게 대응한다:
  - 5절의 안내 문구를 넣는다.
  - 시연에는 실제 개인 일기 대신 예시 문장을 쓴다.
  - 이름, 연락처 같은 정보는 조각글에 쓰지 말라고 가이드에 적는다.
- 정식 공개로 바꿀 때는 유료 등급(결제 등록)으로 전환해서 학습 사용을 끈다. 코드는 바꿀 필요가 없다.
- API 키를 만드는 사람은 만 18세 이상이어야 한다.

## 7. 개발과 운영 원칙

- 로컬 개발과 e2e는 `AI_TEXT_PROVIDER=mock`을 기본으로 둔다. 무료 한도를 테스트에 쓰지 않기 위해서다.
- Vercel 배포에만 `AI_TEXT_PROVIDER=gemini`와 키를 넣는다.
- 시연 당일에는 오전 테스트를 최소로 한다. 한도 초기화가 오후 4~5시이기 때문이다.
- 나중에 자정 자동 마감(cron)을 붙이면 사용자마다 1~2초 간격을 둔다(분당 한도).

## 8. 파일 변경 예정

| 파일 | 변경 |
|---|---|
| `src/server/ai/gemini.ts` | 새 파일. `TextProvider` 구현, 모델 목록 순회, JSON 스키마, 8초 제한 |
| `src/server/ai/fallback.ts` | 새 파일. 모델 목록을 순서대로 시도하고 실패하면 mock으로 가는 순수 함수(테스트 대상) |
| `src/server/ai/index.ts` | `AI_TEXT_PROVIDER=gemini` 선택지 |
| `src/lib/types.ts` | `DaySummary.source?` |
| `src/app/gallery/[date]/page.tsx` | "임시 요약" 표시 |
| `src/app/page.tsx`, `src/app/guide/page.tsx` | 개인정보 안내 문구 |
| `.env.example`, README | 환경변수 4개 |

- SDK는 `@google/genai`를 쓰거나 REST(`generativelanguage.googleapis.com`)를 `fetch`로 직접 호출한다. 구현할 때 공식 문서로 확인하고, 의존성을 하나 늘리는 것과 비교해서 정한다.

## 9. 테스트

- **단위 (`node --test`)**: `fallback.ts`
  - 1순위 성공 → 1순위 결과
  - 1순위 429 → 2순위 결과
  - 둘 다 실패 → mock + `source: "fallback"`
  - 400 → 2순위를 건너뛰고 바로 mock
  - 응답 형식 오류(mood가 목록 밖, summary 501자) → 다음 모델
  - 시간 초과 → 다음 모델
- **실제 1회 확인 (사람)**: 키를 넣고 마감 1번, 큐레이터 1번을 해서 로그에 어떤 모델이 답했는지 본다.
- 기존 smoke와 e2e는 mock으로 그대로 통과해야 한다.

## 10. 미정

- 실제 무료 한도 숫자(3절 표 갱신)
- 큐레이터 결과 캐시(같은 기간 다시 보기)는 한도가 실제로 부족해지면 추가한다.
