#!/usr/bin/env bash
# Real-database, real-server e2e for the fork's recipient-artifact, completion-email and terminal-status rules
# (review r3 [10][11], r4 [12][13][14]).
#
# Starts a throwaway Postgres (tmpfs) and a Mailpit SMTP sink on 127.0.0.1, migrates, runs the BUILT server
# (apps/remix/build, or $CHIEF_E2E_BUILD) with its staff and recipient listeners, and runs the Playwright API specs in
# packages/app-tests/e2e/api/chief against it. Nothing is stubbed: the specs seed through @documenso/prisma, call the
# server over HTTP, dispatch real jobs to its /api/jobs endpoint and read the mail the server actually sent.
#
# Phases: `main` runs every spec against the plain server. `replica` then gives the throwaway Postgres a real logical
# replica (a second database in the same container, subscribed to the first), restarts the server with
# NEXT_PRIVATE_DATABASE_REPLICA_URLS pointing at it, and runs the replication-lag spec, which pauses the subscription.
# Default: both.
#
# Isolation (review r4 [14]): the script re-executes itself under `env -i` with a short allowlist (PATH, HOME, docker
# and locale settings, CHIEF_E2E_BUILD), so no database, replica, SMTP or provider setting leaks in from the calling
# shell; test.env is then the only configuration, Playwright skips the repo .env files, and preflight.cjs refuses to
# start containers, migrate, start a server or run a test unless every database URL is the throwaway Postgres and mail
# can only reach the loopback Mailpit.
#
# Usage: chief/inventory/e2e/run.sh [--phase all|main|replica] [playwright args...]
#        (needs docker, node_modules, a built apps/remix)
set -euo pipefail

if [ "${CHIEF_E2E_ISOLATED:-}" != "$$" ]; then
  keep=("CHIEF_E2E_ISOLATED=$$")
  for v in PATH HOME USER LANG LC_ALL TERM TMPDIR CI DOCKER_HOST DOCKER_CONFIG DOCKER_CONTEXT CHIEF_E2E_BUILD \
    PLAYWRIGHT_BROWSERS_PATH; do
    if [ -n "${!v+x}" ]; then keep+=("$v=${!v}"); fi
  done
  # `exec` keeps the PID, so the re-executed script recognises CHIEF_E2E_ISOLATED=$$ as its own scrub.
  exec env -i "${keep[@]}" bash "$0" "$@"
fi

PHASE=all
if [ "${1:-}" = --phase ]; then
  PHASE=${2:?--phase needs all, main or replica}
  shift 2
fi

cd "$(dirname "$0")/../../.."
ROOT=$PWD
BUILD=$(realpath "${CHIEF_E2E_BUILD:-apps/remix/build}")
[ -f "$BUILD/server/main.js" ] || { echo "no built server at $BUILD (run the remix build first)" >&2; exit 2; }

set -a
. chief/inventory/e2e/test.env
set +a
export NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=$ROOT/apps/remix/example/cert.p12
preflight() { node chief/inventory/e2e/preflight.cjs "$1"; }
preflight "before containers and migrations"

pg_port=$(sed -E 's#.*:([0-9]+)/.*#\1#' <<<"$NEXT_PRIVATE_DATABASE_URL")
pg_pass=$(sed -E 's#^[a-z]+://[^:]+:([^@]+)@.*#\1#' <<<"$NEXT_PRIVATE_DATABASE_URL")
REPLICA_URL=${NEXT_PRIVATE_DATABASE_URL%/*}/documenso_replica

PG=chief-e2e-pg-$$
MAIL=chief-e2e-mail-$$
LOG=${TMPDIR:-/tmp}/chief-e2e-server-$$.log
SERVER=

stop_server() {
  if [ -n "$SERVER" ]; then
    kill "$SERVER" 2>/dev/null || true
    wait "$SERVER" 2>/dev/null || true
    SERVER=
  fi
}
cleanup() {
  stop_server
  docker rm -f "$PG" "$MAIL" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_() { docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -qAt -U postgres "$@"; }

# wal_level=logical: the replica phase subscribes a second database to this one.
docker run -d --rm --name "$PG" --tmpfs /var/lib/postgresql/data --memory 512m \
  -e POSTGRES_PASSWORD="$pg_pass" -e POSTGRES_DB=documenso_test -p "127.0.0.1:$pg_port:5432" postgres:16-alpine \
  -c wal_level=logical >/dev/null
docker run -d --rm --name "$MAIL" --memory 256m \
  -p "127.0.0.1:$NEXT_PRIVATE_SMTP_PORT:1025" -p "127.0.0.1:${CHIEF_E2E_MAILPIT_URL##*:}:8025" axllent/mailpit:latest >/dev/null

for _ in $(seq 60); do docker exec "$PG" pg_isready -U postgres -d documenso_test -q && break; sleep 1; done
(cd packages/prisma && npx prisma migrate deploy >/dev/null)

start_server() {
  preflight "server start ($1)"
  (cd apps/remix && NODE_ENV=production exec node "$BUILD/server/main.js") >"$LOG.$1" 2>&1 &
  SERVER=$!
  for _ in $(seq 90); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$NEXT_PUBLIC_WEBAPP_URL/signin")" = 200 ] && break
    kill -0 "$SERVER" 2>/dev/null || { cat "$LOG.$1" >&2; exit 1; }
    sleep 1
  done
  echo "server ($1): $BUILD ($NEXT_PUBLIC_WEBAPP_URL, recipient listener $CHIEF_E2E_RECIPIENT_URL), log $LOG.$1"
}

playwright() {
  (cd packages/app-tests && NODE_OPTIONS='--import tsx' npx playwright test --project api --retries 0 --reporter list "$@")
}

status=0

if [ "$PHASE" = all ] || [ "$PHASE" = main ]; then
  start_server main
  playwright e2e/api/chief "$@" || status=$?
  stop_server
fi

if [ "$PHASE" = all ] || [ "$PHASE" = replica ]; then
  # A real logical replica of the throwaway database: schema copy, publication, subscription.
  psql_ -d documenso_test -c "CREATE DATABASE documenso_replica"
  docker exec "$PG" pg_dump -U postgres --schema-only --no-publications --no-subscriptions documenso_test |
    psql_ -d documenso_replica >/dev/null
  # Published UPDATE/DELETE need a replica identity; give one to any table without a primary key.
  for t in $(psql_ -d documenso_test -c "SELECT quote_ident(c.relname) FROM pg_class c JOIN pg_namespace n
      ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary)"); do
    psql_ -d documenso_test -c "ALTER TABLE public.$t REPLICA IDENTITY FULL"
  done
  psql_ -d documenso_test -c "CREATE PUBLICATION chief_e2e FOR ALL TABLES" \
    -c "SELECT pg_create_logical_replication_slot('chief_e2e', 'pgoutput')" >/dev/null
  psql_ -d documenso_replica -c "CREATE SUBSCRIPTION chief_e2e CONNECTION 'host=127.0.0.1 port=5432
    dbname=documenso_test user=postgres password=$pg_pass' PUBLICATION chief_e2e
    WITH (create_slot = false, slot_name = 'chief_e2e')"
  for _ in $(seq 60); do
    [ "$(psql_ -d documenso_replica -c "SELECT count(*) FROM pg_subscription_rel WHERE srsubstate <> 'r'")" = 0 ] &&
      break
    sleep 1
  done

  # The server reads through the replica. The test process seeds and checks the primary and reaches the replica only
  # through CHIEF_E2E_REPLICA_URL.
  export NEXT_PRIVATE_DATABASE_REPLICA_URLS=$REPLICA_URL
  start_server replica
  CHIEF_E2E_REPLICA_URL=$REPLICA_URL NEXT_PRIVATE_DATABASE_REPLICA_URLS='' \
    playwright e2e/api/chief/replica-lag-completion-email.spec.ts || status=$?
  stop_server
fi

exit "$status"
