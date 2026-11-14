#!/usr/bin/env bash
# Vendored fleet-design-system integrity (fds DESIGN.md §10, v0.9.5): packages/fleet-ui/fds must hold the full shipped
# inventory, no extra files (product-owned ones are listed in fds.product), and every file must match the package AT
# THE LOCKED COMMIT (--against), which also catches an edited file whose fds.lock hash was recomputed.
#   chief/inventory/check-fds-vendored.sh [<fleet-design-system checkout>]   (default: $FDS_PKG, else /root/code/fleet-design-system)
# Exit 1 = edited/missing/extra file; 3 = the checkout is newer than the vendored version (re-vendor).
set -euo pipefail
cd "$(dirname "$0")/../.."
pkg="${1:-${FDS_PKG:-/root/code/fleet-design-system}}"
[ -f "$pkg/scripts/check-vendored.sh" ] || { echo "FAIL: no fleet-design-system checkout at $pkg"; exit 1; }
exec bash "$pkg/scripts/check-vendored.sh" packages/fleet-ui/fds --against "$pkg"
