# C1a — certificate and seal branding

Base: `6c4757feb` on `agent/c1a-brand`. Changes are uncommitted. Scope follows
EDD C1a/A8 as narrowed by Gate-2 r2 finding 6: no mail, distribution, recipient
page or Share changes.

Both certificate implementations say **Signing record by Fleet | Dealroom**.
The certificate keeps Fleet attribution even when the legacy vendor
`hidePoweredBy` flag is true. Certificate and audit raster renderers read the
client's mounted PNG. The HTML certificate uses `/static/logo.png`; the HTML
audit appendix already uses the Fleet `BrandingLogo` SVG. Seal reason is
**Signed by Fleet | Dealroom**; contact and location are **Fleet | Dealroom**.
These seal properties come from `chief/branding.ts`, independently of old
reason/contact/web-origin environment values. Existing cryptographic signing,
timestamping and C0's QR suppression remain intact.

## Manager's Compose change

In `/root/code/fleet-dealroom/deploy/do1/compose.proto.yml`, replace the existing
`services.sign.volumes` entry for `./proto/fleet-logo.png` with this single mount:

```yaml
services:
  sign:
    volumes:
      - ./branding/logo.png:/app/apps/remix/build/client/static/logo.png:ro
```

The source resolves to `/root/code/fleet-dealroom/deploy/do1/branding/logo.png`.
Retain the existing signing-P12 mount. No `public/static/logo.png` mount is needed:
both server renderers now read `build/client/static/logo.png` relative to the
container's `/app/apps/remix` working directory. No binary was added to this
repository. Local rendering also needs the Fleet PNG at that build/client path.

## Verification

`chief/inventory/c1a-brand.test.ts` is registered in `chief/inventory/check.sh`.
It has five hermetic tests: four execute production modules with drawing,
file/image and signer/PDF I/O stubs; the HTML certificate check is static.
Certificate visibility assertions are also static. Seal assertions inspect the
actual options passed by `signPdf` to its PDF boundary, with deliberately stale
Documenso/AmForge/sslip settings supplied as adversarial fixtures.

| Execution | Passed | Failed |
| --- | ---: | ---: |
| C1a tests against `6c4757feb` before implementation | 0 | 5 |
| Final C1a tests against a temporary copy of those same baseline source files | 0 | 5 |
| C1a tests after implementation | 5 | 0 |
| Existing C0 `no-share.test.ts` after implementation | 11 | 0 |

These counts use `CI=true node --import tsx chief/inventory/c1a-brand.test.ts`
and the analogous C0 command. The requested
`CI=true npx tsx --test chief/inventory/*.test.ts` was attempted and blocked before
test execution: the sandbox rejects the tsx IPC socket with `listen EPERM` at
`/tmp/tsx-0/16.pipe`. The manager must rerun that exact command outside this sandbox.
No full-inventory pass is claimed. Scoped Biome checks and `git diff --check` pass;
Biome reports five existing warnings and one existing informational diagnostic.
`npm run typecheck -w @documenso/remix` also passes (route type generation and tsc).

These are source/module checks, not a deployed PDF/OCR or P12 validation. After
mounting the logo, inspect a newly issued certificate, audit PDF and seal
properties. Historical `chief/spike/seal-validation.txt:5` and `:6` name
`AmForge Sign` / `O=AmForge LLC`; the current deployed P12 was not inspected.
The manager must check its public subject/issuer and replace legacy preview
identity before issuing new fixtures. Do not rewrite old sealed evidence.

## Footprint against 6c4757feb

Counts are added plus deleted lines, with the existing first-party exclusions
unchanged. C1a uses **4 upstream files / 45 lines**, leaving **256 of the 301
remaining upstream lines** for the other slices (before their own changes).

| Upstream file | Changed locations in working tree | Added | Deleted | Total |
| --- | --- | ---: | ---: | ---: |
| `packages/lib/server-only/pdf/render-certificate.ts` | 17, 577, 584, 590, 603, 719, 792, 826 | 7 | 7 | 14 |
| `packages/lib/server-only/pdf/render-audit-logs.ts` | 17, 446 | 2 | 1 | 3 |
| `apps/remix/app/routes/_internal+/[__htmltopdf]+/certificate.tsx` | 23, 100, 361 | 8 | 12 | 20 |
| `packages/signing/index.ts` | 1, 8, 44 | 2 | 6 | 8 |

First-party files: `chief/branding.ts`, `chief/inventory/c1a-brand.test.ts`,
`chief/inventory/check.sh`, and this report. No dependency or binary changes.

## A8 leftovers and ownership

The sweep used case-insensitive `rg` for `Documenso`, `documenso.com`, `AmForge`,
`sslip.io` and `documen.so` across recipient/signing components, internal HTML
certificates, PDF renderers, audit formatting, seal jobs/transports and native
email templates. Package imports, CSS classes, internal identifiers and comments
are not visible branding. There are no remaining hardcoded forbidden display
strings in C1a's PDF renderers, HTML certificate/audit content or seal options.
The following are source findings, not assertions about unseen runtime data.

| Owner | File:line | Remaining visible string / data path |
| --- | --- | --- |
| C4 — pages | `apps/remix/app/routes/_unauthenticated+/articles.signature-disclosure.tsx:19`, `:130` | Disclosure names Documenso. |
| C4 — pages | `apps/remix/app/components/general/document-signing/document-signing-page-view-v2.tsx:287` | Conditional powered-by link to `https://documenso.com`. |
| C4 — pages | `apps/remix/app/root.tsx:178` | Expired-license banner names Documenso. |
| C4 — pages | `apps/remix/app/routes/_recipient+/report.$token.tsx:65`; `packages/lib/constants/app.ts:75` | Report-sender mailto uses the `support@documenso.com` fallback. |
| C4 — embed/terminal inventory | `apps/remix/app/components/embed/embed-document-completed.tsx:18` | Embedded completion name defaults to Documenso; outside the managed top-level recipient flow. |
| C1b — emails | `packages/email/template-components/template-footer.tsx:36`, `:37` | Documenso attribution and `https://documen.so/mail-footer`. Shared by lifecycle mail. |
| C1b — emails | `packages/email/template-components/template-branding-logo.tsx:26` | `Documenso Logo` alt text. |
| C1b — emails | `packages/email/template-components/template-document-image.tsx:16` | `Documenso` alt text and native document artwork. |
| C1b — emails | `packages/email/template-components/template-document-self-signed.tsx:65` | `https://documenso.com/pricing` upsell. |
| C1b — emails | `packages/email/templates/document-invite.tsx:37`, `document-completed.tsx:16`, `document-reminder.tsx:27`, `recipient-expired.tsx:16` | `https://documenso.com` template preview/default URLs; not proof those values were sent. Paths after the first are in the same directory. |
| C1b — email configuration | `chief/deploy/brand.mjs:4`, `:9`; `packages/email/template-components/template-footer.tsx:16`, `:46`, `:58`; `template-branding-logo.tsx:29`, `:31` | Old provisioning script supplies AmForge company details and sslip URL. Renderers consume stored company/logo/URL values; effective database values were not read. |
| C1b — sender/fixture configuration | `chief/deploy/provision.mjs:5`, `:8`; `chief/deploy/compose.yml:24`, `:36`, `:37`; external `/root/code/fleet-dealroom/deploy/do1/compose.proto.yml:94` | AmForge sender name/address and historical sslip web URL. Current proto Compose still sets `deals@amforge.test`. |
| C1b — legacy environment example | external `/root/code/fleet-dealroom/deploy/sign/env.example:10`, `:25`, `:26` | sslip web URL and AmForge mail identity. Do not use this example for the C1b cutover. |
| C1b — OTP suppression inventory | `packages/lib/server-only/2fa/email/generate-2fa-credentials-from-email.ts:7` | `Documenso Email 2FA` issuer (internal token metadata, not visible email copy); native OTP belongs in C1b's suppression gate. |
| C1a — manager's seal rollout | `chief/spike/seal-validation.txt:5`, `:6`; external `/root/code/fleet-dealroom/deploy/sign/env.example:12` | Historical P12 identity names AmForge. Current P12 subject/issuer requires runtime inspection. Example reason/contact at `:14`, `:15` no longer controls `signPdf`. |
| C1b — fixture identity / stored evidence | `packages/lib/server-only/pdf/render-audit-logs.ts:207`; `chief/deploy/provision.mjs:5`, `:8`; `chief/deploy/screenshots.mjs:25`, `:27` | Audit owner, document titles/content and participant identity come from stored input; legacy fixtures name AmForge. Correct new fixture identity at provisioning, without replacing names in historical evidence. |

C0 already makes Share/QR consumers unreachable. Dormant strings remain in
`apps/remix/app/components/general/document/document-certificate-qr-view.tsx:79`
and `packages/ui/components/document/document-share-button.tsx:108`, `:153`.
They are C0's retained implementation, not newly exposed pages; the 11 C0 tests
remain green. The unused legacy `NEXT_PRIVATE_SIGNING_REASON` default in
`packages/lib/constants/app.ts:103` still names Documenso, but has no production
consumer after this change (`rg` finds only its own existing unit tests).

Staff-only account/admin/settings copy and translation catalogs are outside A8's
counterparty signing flow. Send's configured brand/watermark and live database
branding remain manager/C1b/C4 rollout checks in their respective repositories.
