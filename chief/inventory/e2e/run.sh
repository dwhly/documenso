#!/usr/bin/env bash
# Real-database, real-server e2e for the fork's recipient-artifact, completion-email and terminal-status rules
# (review r3 [10][11], r4 [13][14], r5 [14][16][18]).
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
# Local Docker and per-run identity (review r5 [14]): DOCKER_HOST, DOCKER_CONTEXT and DOCKER_CONFIG are never
# inherited. A caller pointing them anywhere but the local socket is refused, and the scrubbed run talks to
# unix:///var/run/docker.sock with an empty DOCKER_CONFIG, so no ~/.docker context can switch the daemon. A remote
# daemon would publish the containers' ports on the remote host while migrations still reach the local 127.0.0.1. Right
# after the containers start, a random per-run marker is written into them over `docker exec`: a database setting in
# Postgres and the Mailpit label. identity.cjs then reads it back through the application's own DATABASE/SMTP/Mailpit
# settings before anything is migrated, seeded or mailed, so an unrelated Postgres or Mailpit already listening on
# those loopback ports is refused.
#
# Usage: chief/inventory/e2e/run.sh [--phase all|main|replica] [playwright args...]
#        (needs docker, node_modules, a built apps/remix)
set -euo pipefail

LOCAL_DOCKER=unix:///var/run/docker.sock

if [ "${CHIEF_E2E_ISOLATED:-}" != "$$" ]; then
  # The containers must run on THIS host's daemon (review r5 [14]); refuse rather than silently ignore a caller's
  # remote daemon or context.
  if [ -n "${DOCKER_HOST:-}" ] && [ "$DOCKER_HOST" != "$LOCAL_DOCKER" ]; then
    echo "chief e2e REFUSED: DOCKER_HOST=$DOCKER_HOST is not the local Docker endpoint $LOCAL_DOCKER" >&2
    exit 2
  fi
  if [ -n "${DOCKER_CONTEXT:-}" ] && [ "$DOCKER_CONTEXT" != default ]; then
    echo "chief e2e REFUSED: DOCKER_CONTEXT=$DOCKER_CONTEXT (only the local daemon at $LOCAL_DOCKER)" >&2
    exit 2
  fi
  keep=("CHIEF_E2E_ISOLATED=$$")
  for v in PATH HOME USER LANG LC_ALL TERM TMPDIR CI CHIEF_E2E_BUILD PLAYWRIGHT_BROWSERS_PATH; do
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

# Local Docker only (review r5 [14]): the endpoint is pinned and no Docker config (contexts, ~/.docker) is read. The
# daemon must also answer on the local socket as this host.
export DOCKER_HOST=$LOCAL_DOCKER
DOCKER_CONFIG=$(mktemp -d "${TMPDIR:-/tmp}/chief-e2e-docker-XXXXXX")
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
unset DOCKER_CONTEXT
[ -S /var/run/docker.sock ] || { echo "chief e2e REFUSED: no local Docker socket at $LOCAL_DOCKER" >&2; exit 2; }
daemon_host=$(docker info --format '{{.Name}}' 2>/dev/null) ||
  { echo "chief e2e REFUSED: the local Docker daemon ($LOCAL_DOCKER) does not answer" >&2; exit 2; }
if [ "$daemon_host" != "$(hostname)" ]; then
  echo "chief e2e REFUSED: the Docker daemon at $LOCAL_DOCKER reports host '$daemon_host', not this host '$(hostname)'" >&2
  exit 2
fi

# The per-run marker written into this run's containers and verified through the application settings (identity.cjs).
CHIEF_E2E_RUN_ID=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
export CHIEF_E2E_RUN_ID
identity() { node chief/inventory/e2e/identity.cjs "$@"; }

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
  rm -rf "$DOCKER_CONFIG"
}
trap cleanup EXIT

psql_() { docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -qAt -U postgres "$@"; }

# wal_level=logical: the replica phase subscribes a second database to this one.
docker run -d --rm --name "$PG" --tmpfs /var/lib/postgresql/data --memory 512m \
  -e POSTGRES_PASSWORD="$pg_pass" -e POSTGRES_DB=documenso_test -p "127.0.0.1:$pg_port:5432" postgres:16-alpine \
  -c wal_level=logical >/dev/null ||
  { echo "chief e2e REFUSED: could not start the throwaway Postgres on 127.0.0.1:$pg_port (port already taken?)" >&2; exit 2; }
docker run -d --rm --name "$MAIL" --memory 256m \
  -p "127.0.0.1:$NEXT_PRIVATE_SMTP_PORT:1025" -p "127.0.0.1:${CHIEF_E2E_MAILPIT_URL##*:}:8025" axllent/mailpit:latest \
  --label "chief-e2e-$CHIEF_E2E_RUN_ID" >/dev/null ||
  { echo "chief e2e REFUSED: could not start the Mailpit sink on 127.0.0.1 (ports already taken?)" >&2; exit 2; }

for _ in $(seq 60); do docker exec "$PG" pg_isready -U postgres -d documenso_test -q && break; sleep 1; done
for _ in $(seq 30); do curl -sf -o /dev/null "$CHIEF_E2E_MAILPIT_URL/api/v1/webui" && break; sleep 1; done
# Mark this run's Postgres from inside its container, then require the application URLs to see that mark.
psql_ -d documenso_test -c "ALTER DATABASE documenso_test SET chief_e2e.run_id = '$CHIEF_E2E_RUN_ID'"
identity "before migrations"
(cd packages/prisma && npx prisma migrate deploy >/dev/null)

start_server() {
  preflight "server start ($1)"
  identity "server start ($1)" "${@:2}"
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
  psql_ -d documenso_test -c "ALTER DATABASE documenso_replica SET chief_e2e.run_id = '$CHIEF_E2E_RUN_ID'"
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
  start_server replica --replica
  CHIEF_E2E_REPLICA_URL=$REPLICA_URL NEXT_PRIVATE_DATABASE_REPLICA_URLS='' \
    playwright e2e/api/chief/replica-lag-completion-email.spec.ts || status=$?
  stop_server
fi

exit "$status"
