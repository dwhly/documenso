#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
container="sign-styles-test-$$"
docker --host unix:///var/run/docker.sock run -d --rm --name "$container" \
  --label purpose=sign-styles-local-test --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=sign_styles_test -e POSTGRES_DB=sign_styles_test \
  -p 127.0.0.1:55497:5432 postgres:16-alpine >/dev/null
trap 'docker --host unix:///var/run/docker.sock rm -f "$container" >/dev/null' EXIT
for attempt in {1..30}; do
  if docker --host unix:///var/run/docker.sock exec "$container" pg_isready -U postgres >/dev/null; then
    break
  fi
  sleep 1
done
test_env=(env -i "PATH=$PATH" "HOME=$HOME" CI=true NEXTAUTH_SECRET=signature-test
  NEXT_PRIVATE_ENCRYPTION_KEY=CAFEBABE NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=DEADBEEF
  NEXT_PUBLIC_WEBAPP_URL=http://127.0.0.1:3399 NEXT_PRIVATE_DATABASE_REPLICA_URLS=
  NEXT_PRIVATE_DATABASE_URL=postgresql://postgres:sign_styles_test@127.0.0.1:55497/sign_styles_test
  NEXT_PRIVATE_DIRECT_DATABASE_URL=postgresql://postgres:sign_styles_test@127.0.0.1:55497/sign_styles_test
  NEXT_PRIVATE_JOBS_PROVIDER=local NEXT_PUBLIC_UPLOAD_TRANSPORT=database)
"${test_env[@]}" node_modules/.bin/prisma migrate deploy --schema packages/prisma/schema.prisma
"${test_env[@]}" node --import tsx --test chief/inventory/e2e/sign-styles.test.ts
