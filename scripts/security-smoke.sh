#!/usr/bin/env bash
# Security smoke test for H1 / M1 / M4 + song recommendation (docs/review/2026-11-04-security-fix-*.md).
# Checks what can be checked without signing in. Read-only: no account is created.
#
#   bash scripts/security-smoke.sh http://localhost:3000
#   bash scripts/security-smoke.sh https://<preview>.vercel.app
#
# Exit code 0 = all passed.

set -u
BASE="${1:-http://localhost:3000}"
BASE="${BASE%/}"
HOST="$(printf '%s' "$BASE" | sed -E 's#^https?://##; s#/.*$##')"
pass=0
failn=0

# check <name> <expected status> <curl args...>
check() {
  local name="$1" want="$2"
  shift 2
  local got
  got="$(curl -s -o /tmp/smoke_body.$$ -w '%{http_code}' "$@")"
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1))
    printf '[PASS] %-55s %s\n' "$name" "$got"
  else
    failn=$((failn + 1))
    printf '[FAIL] %-55s got %s, want %s  body: %s\n' "$name" "$got" "$want" "$(head -c 200 /tmp/smoke_body.$$)"
  fi
}

J=(-H 'Content-Type: application/json')
ENTRY='{"entries":[{"id":"a","at":"2026-11-04T00:00:00.000Z","text":"고양이"}]}'
SUMMARY='{"summary":{"summary":"고양이","tags":[],"scene":"cat"},"style":"water"}'
CURATE='{"periodLabel":"이번 주","count":1,"top":[],"summaries":[]}'

echo "== target: $BASE"
echo "-- H1: AI routes need sign-in"
check "summarize without sign-in -> 401" 401 -X POST "${J[@]}" -d "$ENTRY" "$BASE/api/summarize"
check "draw without sign-in -> 401" 401 -X POST "${J[@]}" -d "$SUMMARY" "$BASE/api/draw"
check "curate without sign-in -> 401" 401 -X POST "${J[@]}" -d "$CURATE" "$BASE/api/curate"

echo "-- H1: AI input limits (checked before sign-in)"
MANY="$(node -e 'console.log(JSON.stringify({entries:Array.from({length:51},(_,i)=>({id:"e"+i,at:"x",text:"a"}))}))')"
check "summarize with 51 entries -> 400" 400 -X POST "${J[@]}" -d "$MANY" "$BASE/api/summarize"
LONG="$(node -e 'console.log(JSON.stringify({entries:[{id:"a",at:"x",text:"a".repeat(141)}]}))')"
check "summarize with 141-char text -> 400" 400 -X POST "${J[@]}" -d "$LONG" "$BASE/api/summarize"
TAGS="$(node -e 'console.log(JSON.stringify({summary:{summary:"a",tags:Array(11).fill("t"),scene:"day"},style:"water"}))')"
check "draw with 11 tags -> 400" 400 -X POST "${J[@]}" -d "$TAGS" "$BASE/api/draw"

echo "-- M4: picture size limits (checked before sign-in)"
ART_LONG="$(node -e 'console.log(JSON.stringify({date:"2026-11-04",scene:"cat",style:"water",summary:"a".repeat(501),tags:[]}))')"
check "artworks with 501-char summary -> 400" 400 -X POST "${J[@]}" -d "$ART_LONG" "$BASE/api/me/artworks"
ART_TAGS="$(node -e 'console.log(JSON.stringify({date:"2026-11-04",scene:"cat",style:"water",summary:"a",tags:Array(11).fill("t")}))')"
check "artworks with 11 tags -> 400" 400 -X POST "${J[@]}" -d "$ART_TAGS" "$BASE/api/me/artworks"
check "artworks with an empty tag -> 400" 400 -X POST "${J[@]}" \
  -d '{"date":"2026-11-04","scene":"cat","style":"water","summary":"a","tags":[""]}' "$BASE/api/me/artworks"
REDRAW_OK='{"scene":"cat","style":"water","summary":"a","tags":["t"]}'
check "redraw with 501-char summary -> 400" 400 -X POST "${J[@]}" \
  -d "$(node -e 'console.log(JSON.stringify({scene:"cat",style:"water",summary:"a".repeat(501),tags:[]}))')" \
  "$BASE/api/me/artworks/2026-11-04/redraw"
check "redraw with a bad date -> 400" 400 -X POST "${J[@]}" -d "$REDRAW_OK" "$BASE/api/me/artworks/2026-1-4/redraw"
check "redraw without sign-in -> 401" 401 -X POST "${J[@]}" -d "$REDRAW_OK" "$BASE/api/me/artworks/2026-11-04/redraw"

echo "-- entry edit: PATCH /api/me/entries/:id (input checked before sign-in)"
EID="00000000-0000-4000-8000-000000000000"
check "edit with a bad id -> 400" 400 -X PATCH "${J[@]}" -d '{"text":"a"}' "$BASE/api/me/entries/not-a-uuid"
check "edit with empty text -> 400" 400 -X PATCH "${J[@]}" -d '{"text":"  "}' "$BASE/api/me/entries/$EID"
check "edit with 141-char text -> 400" 400 -X PATCH "${J[@]}" \
  -d "$(node -e 'console.log(JSON.stringify({text:"a".repeat(141)}))')" "$BASE/api/me/entries/$EID"
check "edit with text/plain body -> 400" 400 -X PATCH -H 'Content-Type: text/plain' -d '{"text":"a"}' "$BASE/api/me/entries/$EID"
check "edit without sign-in -> 401" 401 -X PATCH "${J[@]}" -d '{"text":"a"}' "$BASE/api/me/entries/$EID"
check "edit from another Origin -> 403" 403 -X PATCH "${J[@]}" -H 'Origin: https://evil.example' \
  -d '{"text":"a"}' "$BASE/api/me/entries/$EID"

echo "-- M1: login CSRF"
# What a cross-site <form enctype="text/plain"> would send.
check "login with text/plain JSON-looking body -> 400" 400 -X POST -H 'Content-Type: text/plain' \
  -d '{"email":"nobody@example.com","password":"x","p":"="}' "$BASE/api/auth/login"
check "login with no Content-Type -> 400" 400 -X POST -H 'Content-Type:' \
  -d '{"email":"nobody@example.com","password":"x"}' "$BASE/api/auth/login"
check "login from another Origin -> 403" 403 -X POST "${J[@]}" -H 'Origin: https://evil.example' \
  -d '{"email":"nobody@example.com","password":"x"}' "$BASE/api/auth/login"
check "logout from another Origin -> 403" 403 -X POST -H 'Origin: https://evil.example' "$BASE/api/auth/logout"
check "Origin: null -> 403" 403 -X POST "${J[@]}" -H 'Origin: null' -d '{}' "$BASE/api/auth/login"
check "GET /api/me from another Origin is not blocked -> 401" 401 -H 'Origin: https://evil.example' "$BASE/api/me"
check "same Origin passes the CSRF check (-> 400, not 403)" 400 -X POST "${J[@]}" -H "Origin: $BASE" \
  -H "Host: $HOST" -d '{}' "$BASE/api/auth/login"

echo "-- Song recommendation (song_pool writes are server-only; checked in songs e2e)"
check "song without sign-in -> 401" 401 -X POST "${J[@]}" -d '{}' "$BASE/api/me/artworks/2026-11-04/song"
check "song from another Origin -> 403" 403 -X POST "${J[@]}" -H 'Origin: https://evil.example' -d '{}' \
  "$BASE/api/me/artworks/2026-11-04/song"
check "song feedback with vote 2 -> 400" 400 -X POST "${J[@]}" -d '{"vote":2}' "$BASE/api/me/songs/1/feedback"

echo "-- Social login (specs/haru-social-login.spl)"
# has <name> <grep -E pattern on the response headers> <curl args...>
has() {
  local name="$1" pat="$2"
  shift 2
  if curl -s -D - -o /dev/null "$@" | tr -d '\r' | grep -qiE "$pat"; then
    pass=$((pass + 1))
    printf '[PASS] %-55s\n' "$name"
  else
    failn=$((failn + 1))
    printf '[FAIL] %-55s no header matching %s\n' "$name" "$pat"
  fi
}
check "oauth start with provider github -> 400" 400 "$BASE/api/auth/oauth/github"
check "oauth start with provider abc -> 400" 400 "$BASE/api/auth/oauth/abc"
has "oauth start kakao -> Supabase authorize" '^location: https://[^/]+\.supabase\.co/auth/v1/authorize\?provider=kakao' \
  "$BASE/api/auth/oauth/kakao"
has "next=https://evil.example is replaced by /today" '^set-cookie: haru_oauth_next=%2Ftoday;' \
  "$BASE/api/auth/oauth/kakao?next=https%3A%2F%2Fevil.example"
has "next=//evil.example is replaced by /today" '^set-cookie: haru_oauth_next=%2Ftoday;' \
  "$BASE/api/auth/oauth/kakao?next=%2F%2Fevil.example"
has "next=/\\evil.example is replaced by /today" '^set-cookie: haru_oauth_next=%2Ftoday;' \
  "$BASE/api/auth/oauth/kakao?next=%2F%5Cevil.example"
has "callback without code -> /?error=oauth" '^location: (https?://[^/]+)?/\?error=oauth$' "$BASE/api/auth/callback"
has "callback with a bad code -> /?error=oauth" '^location: (https?://[^/]+)?/\?error=oauth$' \
  "$BASE/api/auth/callback?code=bogus"
check "delete account without sign-in -> 401" 401 -X DELETE "${J[@]}" -d '{"confirm":"탈퇴"}' "$BASE/api/me"

rm -f /tmp/smoke_body.$$
echo "== $pass passed, $failn failed"
[ "$failn" -eq 0 ]
