# 작업 보고: 공개 전시 보기 (`/e/[id]`)

## 변경 사항
| 파일 | 내용 |
| --- | --- |
| `src/app/api/exhibitions/[id]/route.ts` (신규) | `GET` 공개 전시 API. 로그인 불필요. uuid 형식 아님 / 비공개 / 없음 → 모두 `404 "비공개이거나 없는 전시예요"`. `Cache-Control: no-store`. 개발 모드에서 `[GET /api/exhibitions/<id>] found, N items` 또는 `404` 로그 출력 |
| `src/server/db/publicExhibition.ts` (신규) | 쿼리 모듈. `supabaseStateless()`(publishable key, 쿠키 없음 = anon)로 조회 → RLS 공개 정책이 걸러냄. `entries`·이메일·`user_id`는 응답에 없음 |
| `src/lib/exhibitions.ts` (신규) | 브라우저용 `fetchPublicExhibition(id)` (404 → `null`) |
| `src/lib/types.ts` | `PublicExhibition`, `PublicArtwork` 타입 |
| `src/app/e/[id]/page.tsx` | store/mock 대신 API 사용. 상태: 불러오는 중 / 비공개이거나 없는 전시예요 / 갤러리 / 오류. 캡션 = `note ?? summary` (예전엔 비공개 조각 본문을 보여줬음). `image_url`이 있으면 `<img>`, 없으면 `Art`. "내 전시로" 버튼은 로그인한 본인 전시일 때만 |
| `src/app/e/[id]/public.module.css` | `.img` 한 줄 |
| `src/app/exhibition/page.tsx` | "공개 링크 복사"는 이미 `/e/<exhibitions.id>` → 확인 후 id가 비어 있으면 복사 안 하도록만 보강 |
| `README.md` | 화면 표·구조·다음 단계 갱신 |

## 응답 예시
```json
{ "id": "…uuid…", "title": "나의 전시", "desc": "", "ownerNick": "재현",
  "items": [{ "date": "2026-11-01", "scene": "cat", "imageUrl": null, "summary": "…", "note": null }] }
```

## SQL
`supabase/schema.sql`에 이미 필요한 공개 정책이 모두 있어 **수정·재실행 필요 없음**
(`exhibitions: read own or public`, `items: read own or public`, `artworks: hung in a public exhibition`, `profiles: owner of a public exhibition`, anon `select` grant).

## 클라우드에서 확인한 것
- `npm run lint` 통과 (기존 `layout.tsx` 폰트 경고 1개만), `npx next build` 통과
- `/api/exhibitions/not-a-uuid` → 404 + `cache-control: no-store`
- `.env` 없이 정상 uuid → 500 "저장소에 연결하지 못했어요" (DB 미연결이라 정상)

## 재현님이 실제 Supabase로 확인할 것
1. `git pull` 후 `npm run dev` (`.env.local` 필요)
2. 로그인 → `/exhibition`에서 그림 2개 이상 걸기 → 공개 켜기 → "공개 링크 복사"
3. **시크릿 창**(로그아웃 상태)에서 복사한 주소 열기 → 닉네임·제목·그림·날짜·요약 캡션, 이전/다음 버튼 확인. 터미널에 `found, N items` 로그
4. 원래 창에서 공개 끄기 → 시크릿 창 새로고침 → "비공개이거나 없는 전시예요", 터미널에 `404`
5. `/e/abc`, `/e/00000000-0000-0000-0000-000000000000` → 같은 문구
6. 개발자도구 Network에서 `/api/exhibitions/...` 응답에 `entries`·`email`·`user_id`가 없는지 확인
7. 본인 로그인 상태에서 공개 전시 열면 "내 전시로" 버튼이 보이는지, 다른 사람 전시에서는 안 보이는지
