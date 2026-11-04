# Chief Sign v1

Source: `dwhly/documenso`, `chief/sign-v1`, based on `v2.21.1` and `chief/layout-proto`. No enterprise implementation is used. The independently implemented interface shim is `packages/community-ee`; original `packages/ee` stays byte-identical and outside workspaces/pruning/build/image. The final image starts from neutral Node 24 Debian, never from a Documenso image.

Build on native arm64 Node 24 (an 8 GiB heap is needed):

```sh
HUSKY=0 fnm exec --using=24 npm ci
HUSKY=0 NEXT_PRIVATE_ENCRYPTION_KEY=CAFEBABE NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=DEADBEEF NODE_OPTIONS=--max-old-space-size=8192 fnm exec --using=24 npx turbo run build --filter=@documenso/remix...
HUSKY=0 fnm exec --using=24 bash chief/docker/prepare-context.sh /tmp/chief-sign-clean-context
docker build -t chief/sign-v1:layer /tmp/chief-sign-clean-context
docker image save chief/sign-v1:layer -o /tmp/chief-sign-image.tar
python3 chief/spike/check-image-ee.py /tmp/chief-sign-image.tar
```

Compose owns a fresh PostgreSQL volume. `chief/deploy/.env` and `secrets/` are untracked; back up both with the database. Set POSTGRES_USER/DB/PASSWORD, NEXT_PRIVATE_DATABASE_URL and NEXT_PRIVATE_DIRECT_DATABASE_URL (`postgresql://sign:PASSWORD@database:5432/sign`), NEXTAUTH_SECRET, NEXT_PRIVATE_ENCRYPTION_KEY, NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY, NEXT_PRIVATE_SIGNING_PASSPHRASE. Mount a self-signed or purchased `secrets/signing.p12`. Keep the self-signed trust warning separate from PDF signature validity.

```sh
docker compose -f chief/deploy/compose.yml up -d
```

`provision.mjs` is an operator-only script run inside the image with STAFF_EMAIL/STAFF_PASSWORD. It invokes native user/team creation and token generation, writes the one-time token to `/tmp/chief-staff.json` (0600), and logs only public IDs. Copy that file to `secrets/staff.json` (0600). Never return the token to a scoped agent. Existing UI token creation is under team Settings → API Tokens. Token minting through bearer-authenticated tRPC is denied.

Run `node chief/deploy/brand.mjs` to configure native team branding and upload the mounted PNG through the native typed adapter. The certificate/audit renderer reads `branding/logo.png` via the compose mount. SMTP is Mailpit; signup is disabled. HTTP hostname is tailnet-only, port 8796; no public exposure is enabled.

APIs:

- `/api/v2/openapi.json`: upstream typed v2 schema; filter with the procedure inventory because denied upstream operations can still appear in this original schema.
- `/api/deal/openapi.json`: generated second document with 39 retained procedures lacking native OpenAPI metadata. Every operation is individually schema-bound, carries native permissions and requires a per-staff team credential. Paths are POST `/api/deal/<procedure segments>`.
- `apps/remix/server/chief/procedures.json`: complete procedure inventory and widening classification. Classifications are conservative: identity changes and potentially widening edits require approval for **every** such mutation. Unknown mutations require approval. Send owns scoped-agent authentication, human approvals, exact approved payload and attribution; direct native tokens are trusted server credentials, not scoped agent credentials.
- `chief/inventory/recipient-listener.json`: actual recipient routes, including current canvas signing. A dedicated recipient listener must set `X-Chief-Recipient-Listener: 1`; middleware then denies staff paths and mixed/unknown tRPC batches. Never Funnel the staff listener. Public exposure defaults off.

Validation:

```sh
bash chief/inventory/check.sh
CI=true node --test chief/inventory/http.test.mjs
CI=true node chief/spike/two-signer.mjs
pdfsig chief/deploy/artifacts/sealed.pdf
```

`check.sh` is the CI route gate: full Hono table, tRPC procedures, Remix loaders/actions, and pure policy regressions. It needs the built image and an isolated test DB. D's amd64 workflow is separate and pending upload authorization; no amd64 pass is claimed here. The token fixture and acceptance documents belong to this disposable instance. The browser suite performs actual signing, never seeds signature/completion rows.
