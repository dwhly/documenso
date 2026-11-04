#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
CI=true npx tsx --test chief/inventory/policy.test.ts
# The image must be running against its isolated acceptance DB. Do not point at a production DB.
compose=chief/deploy/compose.yml
stage=$(mktemp -d)
chmod 755 "$stage"
trap 'rm -rf "$stage"' EXIT
cp apps/remix/server/chief/{procedures,hono}.json "$stage/"
cp chief/inventory/{remix.json,check-runtime.mjs} "$stage/"
container=$(docker compose -f "$compose" ps -q sign)
docker compose -f "$compose" exec -T -u root sign mkdir -p /tmp/chief-inventory
docker compose -f "$compose" exec -T -u root sign chmod 755 /tmp/chief-inventory
docker cp "$stage/." "$container:/tmp/chief-inventory"
docker compose -f "$compose" exec -T -e MANIFEST_ROOT=/tmp/chief-inventory sign node /tmp/chief-inventory/check-runtime.mjs
