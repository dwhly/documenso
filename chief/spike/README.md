# Sign community-shim spike — arm64 PASS

Manager r2 replaced the original impossible stock-overlay packaging instruction with a clean neutral image. The original failure is preserved in `stock-arm64-ee-report.json`: 21 stock layers, 112 EE path/link entries and 49 EE sourcemaps. That report remains a negative control; the checker was not weakened.

Current proof:

- Explicit workspaces select the interface-only `packages/community-ee` replacement; original `packages/ee` remains byte-identical. Limits are unlimited JSON-safe equivalents; CSC finalization rejects with NOT_SUPPORTED; unsupported commercial calls reject with NOT_SUPPORTED.
- Native Node 24 arm64 build/typecheck pass. Neutral Node 24 Debian final stage includes Linux production dependencies and verified community output only. No runtime `@documenso/ee` symlink.
- `clean-arm64-ee-report.json`: 14 final image layers, zero original EE entries or EE sourcemaps, exit 0.
- `two-signer.mjs`: creates through v2, places fields through v2, then performs both accountless browser signatures against real canvas fields. No signature or status row is pre-inserted. Downloads canonical PDF, certificate and audit through authenticated native APIs.
- `seal-validation.txt`: valid SHA-256 signature over the whole canonical PDF; the self-signed issuer is untrusted as expected. The certificate names both signers and includes their signature IDs/timestamps. `artifact-sha256.txt` records immutable downloaded bytes.
- The final thin layer has its own policy and live HTTP tests plus complete Hono/tRPC/Remix inventory. Run `chief/inventory/check.sh` against the isolated acceptance deployment.
- `patch-budget.py` measures against `v2.21.1...HEAD` and returns a failing exit status if above 20 upstream files / 1,000 lines. The manager explicitly authorized continuing with an honestly reported file-budget overage after consolidation; see the status report for the final count.
- The dual-architecture CI workflow runs on this branch; exact run results are in the status report.

Runtime setup, APIs and reproduction commands: [deployment README](../deploy/README.md). Product handoff and screenshots: `dwhly/chief-dealroom`, `docs/status/A-sign.md`, branch `chief/sign-status`.
