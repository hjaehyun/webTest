#!/usr/bin/env bash
# Runs the RLS tests on a throwaway local Postgres (needs PostgreSQL 15+ binaries: initdb, pg_ctl, psql).
#   bash supabase/tests/run-local.sh
# Creates a temp cluster, loads supabase-stub.sql + schema.sql (twice, to check it is re-runnable),
# runs every supabase/tests/*.sql test, then deletes the cluster. Exit code 0 = all passed.

set -euo pipefail
cd "$(dirname "$0")/../.."

BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$BIN:$PATH"
DATA="$(mktemp -d)"
PORT="${PG_PORT:-54329}"
# Postgres refuses to run as root; use the postgres user then.
RUN=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DATA"; RUN=(runuser -u postgres --); fi
cleanup() { "${RUN[@]}" pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$DATA"; }
trap cleanup EXIT

"${RUN[@]}" initdb -D "$DATA" -A trust -U postgres >/dev/null
"${RUN[@]}" pg_ctl -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" -w start >/dev/null
PSQL=(psql -h /tmp -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

echo "[DEBUG] loading Supabase stub + schema.sql (twice)"
export PGOPTIONS="-c client_min_messages=warning"
"${PSQL[@]}" -f supabase/tests/supabase-stub.sql
"${PSQL[@]}" -f supabase/schema.sql
"${PSQL[@]}" -f supabase/schema.sql
echo "[DEBUG] applying migrations (must also be re-runnable)"
for m in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$m" >/dev/null; done

unset PGOPTIONS
for t in supabase/tests/*.sql; do
  [ "$t" = supabase/tests/supabase-stub.sql ] && continue
  echo "== $t"
  "${PSQL[@]}" -f "$t" 2>&1 | sed -n 's/.*NOTICE:  //p; /ERROR/p'
done
echo "== all RLS tests passed"
