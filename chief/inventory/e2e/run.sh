#!/usr/bin/env bash
# Real-database, real-server e2e for the fork's recipient-artifact and completion-email rules (review r3 [10][11]).
#
# Starts a throwaway Postgres (tmpfs) and a Mailpit SMTP sink on 127.0.0.1, migrates, runs the BUILT server
# (apps/remix/build, or $CHIEF_E2E_BUILD) with its staff and recipient listeners, and runs the Playwright API specs in
# packages/app-tests/e2e/api/chief against it. Nothing is stubbed: the specs seed through @documenso/prisma, call the
# server over HTTP, dispatch real jobs to its /api/jobs endpoint and read the mail the server actually sent.
#
# Usage: chief/inventory/e2e/run.sh [playwright args...]      (needs docker, node_modules, a built apps/remix)
set -euo pipefail
cd "$(dirname "$0")/../../.."
ROOT=$PWD
BUILD=$(realpath "${CHIEF_E2E_BUILD:-apps/remix/build}")
[ -f "$BUILD/server/main.js" ] || { echo "no built server at $BUILD (run the remix build first)" >&2; exit 2; }

PG=chief-e2e-pg-$$
MAIL=chief-e2e-mail-$$
LOG=${TMPDIR:-/tmp}/chief-e2e-server-$$.log
SERVER=

cleanup() {
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  docker rm -f "$PG" "$MAIL" >/dev/null 2>&1 || true
}
trap cleanup EXIT

set -a
. chief/inventory/e2e/test.env
set +a
export NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=$ROOT/apps/remix/example/cert.p12
PGPORT=$(sed -E 's#.*:([0-9]+)/.*#\1#' <<<"$NEXT_PRIVATE_DATABASE_URL")
PGPASS=$(sed -E 's#^[a-z]+://[^:]+:([^@]+)@.*#\1#' <<<"$NEXT_PRIVATE_DATABASE_URL")

docker run -d --rm --name "$PG" --tmpfs /var/lib/postgresql/data --memory 512m \
  -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_DB=documenso_test -p "127.0.0.1:$PGPORT:5432" postgres:16-alpine >/dev/null
docker run -d --rm --name "$MAIL" --memory 256m \
  -p "127.0.0.1:$NEXT_PRIVATE_SMTP_PORT:1025" -p "127.0.0.1:${CHIEF_E2E_MAILPIT_URL##*:}:8025" axllent/mailpit:latest >/dev/null

for _ in $(seq 60); do docker exec "$PG" pg_isready -U postgres -d documenso_test -q && break; sleep 1; done
(cd packages/prisma && npx prisma migrate deploy >/dev/null)

(cd apps/remix && NODE_ENV=production exec node "$BUILD/server/main.js") >"$LOG" 2>&1 &
SERVER=$!
for _ in $(seq 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$NEXT_PUBLIC_WEBAPP_URL/signin")" = 200 ] && break
  kill -0 "$SERVER" 2>/dev/null || { cat "$LOG" >&2; exit 1; }
  sleep 1
done
echo "server: $BUILD ($NEXT_PUBLIC_WEBAPP_URL, recipient listener $CHIEF_E2E_RECIPIENT_URL), log $LOG"

cd packages/app-tests
NODE_OPTIONS='--import tsx' npx playwright test --project api --retries 0 --reporter list e2e/api/chief "$@"
