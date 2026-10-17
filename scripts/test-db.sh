#!/usr/bin/env bash
# Teste les migrations SQL sur une base PostgreSQL temporaire (binaires initdb, pg_ctl, psql).
# Usage : bash scripts/test-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || PGBIN="$(dirname "$(command -v initdb)")"
PORT="${PGPORT_TEST:-54330}"
DIR="$(mktemp -d)"
RUN=()
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN=(runuser -u postgres --); fi
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${RUN[@]}" "$PGBIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
PSQL=("${RUN[@]}" psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -t)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_mock.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "→ migration $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
echo "→ tests"
# Un seul psql : les fonctions d'aide (pg_temp) servent à tous les fichiers de tests.
cat "$ROOT"/supabase/tests/solfege*.test.sql | "${PSQL[@]}" 2>&1 | grep -E "ok :|ÉCHEC|ERROR" | sed 's/^psql:[^ ]* //'
