#!/usr/bin/env bash
# Security smoke test for H1 / M1 (docs/review/2026-11-04-security-fix-h1-m1-m2.md).
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

rm -f /tmp/smoke_body.$$
echo "== $pass passed, $failn failed"
[ "$failn" -eq 0 ]
