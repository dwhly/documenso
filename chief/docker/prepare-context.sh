#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
context="${1:?Pass a build context directory outside the repository}"
npx turbo prune @documenso/remix --docker
mkdir -p "$context"
mkdir -p "$context/json"
rsync -a --delete out/json/ "$context/json/"
mkdir -p "$context/patches"
rsync -a --delete patches/ "$context/patches/"
mkdir -p "$context/prisma"
cp packages/prisma/schema.prisma "$context/prisma/"
cp -R packages/prisma/migrations "$context/prisma/"
mkdir -p "$context/build"
rsync -a --delete apps/remix/build/ "$context/build/"
mkdir -p "$context/public"
rsync -a --delete apps/remix/public/ "$context/public/"
cp apps/remix/package.json "$context/remix-package.json"
cp docker/start.sh "$context/start.sh"
cp chief/docker/Dockerfile "$context/Dockerfile"
python3 - "$context" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
assert not (root / 'json/packages/ee').exists()
for path in root.rglob('*.map'):
    assert b'packages/ee/' not in path.read_bytes(), path
print('Build context: zero original EE packages or sourcemap references')
PY
