#!/usr/bin/env bash
# Vendored fleet-design-system integrity (fds DESIGN.md §10, v0.9.5): packages/fleet-ui/fds must hold the full shipped
# inventory, no extra files (product-owned ones are listed in fds.product), and every file must match the package AT
# THE LOCKED COMMIT (--against), which also catches an edited file whose fds.lock hash was recomputed.
#   chief/inventory/check-fds-vendored.sh [<fleet-design-system checkout>]   (default: $FDS_PKG, else /root/code/fleet-design-system)
#   chief/inventory/check-fds-vendored.sh --ci    (CI: clone the private package at the locked commit with $FDS_READ_TOKEN)
# FDS_VENDORED_DIR overrides the vendored directory (tests only; default packages/fleet-ui/fds).
# Fails closed (review r2 [8]): a missing fds.lock or a lock without a commit is an explicit FAIL, never a skip.
# Exit 1 = missing/incomplete lock, edited/missing/extra file; 3 = the checkout is newer than the vendored version.
set -euo pipefail
cd "$(dirname "$0")/../.."
dest="${FDS_VENDORED_DIR:-packages/fleet-ui/fds}"
lock="$dest/fds.lock"
fail() { echo "FAIL: $*"; [ -n "${GITHUB_ACTIONS:-}" ] && echo "::error::$*"; exit 1; }
[ -d "$dest" ] || fail "$dest missing: the vendored fleet-design-system cannot be verified"
[ -f "$lock" ] || fail "$lock missing: the vendored fleet-design-system cannot be verified (re-vendor with scripts/vendor.sh)"
commit="$(sed -n 's/^commit //p' "$lock")"
[ -n "$commit" ] || fail "$lock has no commit line"
if [ "${1:-}" = "--ci" ]; then
  [ -n "${FDS_READ_TOKEN:-}" ] || fail "secret FDS_READ_TOKEN (read access to dwhly/fleet-design-system) is required to verify $dest"
  pkg="${RUNNER_TEMP:-$(mktemp -d)}/fds"
  rm -rf "$pkg"
  git clone --quiet --filter=blob:none "https://x-access-token:${FDS_READ_TOKEN}@github.com/dwhly/fleet-design-system.git" "$pkg"
  git -C "$pkg" checkout --quiet "$commit"
else
  pkg="${1:-${FDS_PKG:-/root/code/fleet-design-system}}"
fi
[ -f "$pkg/scripts/check-vendored.sh" ] || fail "no fleet-design-system checkout at $pkg"
exec bash "$pkg/scripts/check-vendored.sh" "$dest" --against "$pkg"
