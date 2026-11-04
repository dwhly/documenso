# Sign EE-shim spike — NO-GO

Date: 2026-11-04. Branch: `chief/sign-v1`, based on `chief/layout-proto` (`f840a59`) and upstream `v2.21.1` (`8707e33`). **Do not merge or deploy this incomplete spike.**

## Blocking result

The requested final runtime must be a thin overlay `FROM documenso/documenso:v2.21.1`. EDD-chief-dealroom §Upstream health requires **zero `packages/ee` paths in image layers/files and sourcemaps**. These cannot both hold: the stock arm64 image already contains EE in inherited layers. Deleting/overwriting files in an overlay creates whiteouts or replacement files; it does not remove their bytes from the inherited layers.

Measured stock image ID: `sha256:41a69062febc915d1508b87be8c5bbe72ecd3c49232ddcd983490f5f7832f053`, architecture arm64, reported size 446,417,824 bytes.

The layer check exited **1**: **21 layers checked; 112 EE path/link entries; 49 sourcemaps referencing EE paths**. These are archive entry counts, including directories, not 112 implementation files. The checked-in JSON lists the paths without copying implementation bodies.

Examples:

- Layer `6698b4abb79d5e26107bd45b04a173b16a65316b76ff6ee16c021902e64ea00d`: `app/packages/ee/package.json`.
- Layer `317d7190f1d6c8ac3982d1929645ff8fca67ff2470ec59c4f7e992c5c1685525`: `app/node_modules/@documenso/ee` points to `../../packages/ee`.
- Layer `8b51adec7738a508c46da7ceae6d4ecfb086eed3c6c86a94f7e9b0fa419fd4cf`: compiled EE code and `.map` files under `app/apps/remix/build/server/hono/packages/ee/`.

Reproduce without running a container:

```sh
docker image save documenso/documenso:v2.21.1 -o /tmp/chief-sign-stock-image.tar
python3 chief/spike/check-image-ee.py /tmp/chief-sign-stock-image.tar
```

A clean final runtime built from a non-Documenso base with only verified community build outputs and dependencies would avoid inheriting those layers. That changes the requested packaging recipe. The gate has not been weakened to checking only the merged filesystem. Per worker instructions, work stopped on failure; no feature work or deployment followed.

## Progress preserved for review

- Added initial independent compatibility code in `packages/community-ee`, retaining module paths used by the pinned community callers. Inputs inspected were exported declarations, type/schema contracts and community call sites; no EE implementation bodies were copied.
- Root workspaces enumerate packages excluding original `packages/ee`; Remix dependency, TS alias and lockfile point to the replacement. `.dockerignore` excludes original EE. Original EE remains byte-identical to upstream (`git diff --quiet v2.21.1 -- packages/ee`, exit 0).
- Clean Node 24 `npm ci` passed: 2,051 packages installed, exit 0. `node_modules/@documenso/ee` resolves to `../../packages/community-ee`; original directory still exists. This proves only the workspace collision fix, **not** complete S3 acceptance.
- The shim is **unfinished**: rejecting wrappers with `unknown` inputs still need exact interface types; no interface-drift claim, typecheck, turbo-prune graph check, build, behavioral shim tests, seal or security readiness is claimed.
- First-party exclusions are only `chief/` and `packages/community-ee/`. Raw existing tracked changes versus upstream at stop: **24 files, +951/-90 = 1,041 lines**. Budget is currently over 20/1,000. The inherited theme/shell files have not been consolidated into designated own directories; no arbitrary file exclusions are used to claim a pass.

## Gates and missing work

| Check | Result |
|---|---|
| Clean npm ci / workspace collision | PASS, 2,051 packages |
| Original EE unchanged | PASS |
| Stock runtime image layers and sourcemaps EE-free | FAIL, counts above |
| Current patch budget | FAIL, 24 files / 1,041 lines |
| Typecheck / arm64 build / amd64 build | NOT RUN |
| Two-signer completion / sealed signature / certificate | NOT RUN |
| Thin layer, deny list, full Hono + tRPC inventory, second OpenAPI | NOT STARTED |
| Fresh deployment, staff provisioning, API token instructions, screenshots | NOT STARTED |

No v1 service, database, certificate, edge hostname block or container was created. Existing containers were not modified. Nothing is faked; there is no running integration target.
