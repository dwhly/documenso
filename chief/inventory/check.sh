#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
CI=true npx tsx --test chief/inventory/policy.test.ts chief/inventory/fixes.test.ts chief/inventory/review-r1.test.ts chief/inventory/review-r2.test.ts chief/inventory/review-r4.test.ts chief/inventory/review-r5.test.ts chief/inventory/no-share.test.ts chief/inventory/c1a-brand.test.ts
bash chief/inventory/check-fds-vendored.sh
# Real-DB/real-server e2e against the built apps/remix (throwaway Postgres + its logical replica + Mailpit; scrubbed
# environment and an isolation preflight, never a stack DB or real mail).
bash chief/inventory/e2e/run.sh
python3 chief/inventory/fixes.test.py
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
