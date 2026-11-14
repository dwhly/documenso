// Review r2 (cross-family, fds v0.9 adoption) regressions. Each test failed on the reviewed commit 92f51a7f6.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const read = (p: string) => fs.readFileSync(p, 'utf8');
// The real Hono routes are loaded through CJS (default-import interop of the generated zod schemas). Lingui's
// compile-time macros have no runtime; the routes only use them for translated constants, so give them a literal one.
const require = createRequire(import.meta.url);
const literal = (s: unknown, ...v: unknown[]) =>
  Array.isArray(s) ? { id: String.raw({ raw: s as string[] }, ...v), message: String.raw({ raw: s as string[] }, ...v) } : s;
const macro = require.resolve('@lingui/core/macro');
require.cache[macro] = { id: macro, filename: macro, loaded: true, exports: { msg: literal, t: literal, defineMessage: literal } } as never;
process.env.DANGEROUS_BYPASS_RATE_LIMITS = 'true';

// ---- [1] / [9] fixtures: database storage (BYTES_64), the seal job's before/after -----------------------------
const ORIGINAL = '%PDF-1.4 fleet-r2 ORIGINAL upload';
const SEALED = '%PDF-1.4 fleet-r2 SEALED artifact';
const b64 = (s: string) => Buffer.from(s).toString('base64');
type State = 'PENDING' | 'CANCELLED' | 'REJECTED-SEALED' | 'COMPLETED';
const STATES: State[] = ['PENDING', 'CANCELLED', 'REJECTED-SEALED', 'COMPLETED'];
const statusOf = (s: State) => (s === 'REJECTED-SEALED' ? 'REJECTED' : s);
// Before sealing data === initialData; the seal job (COMPLETED, and REJECTED) replaces data with the sealed artifact.
const documentDataFor = (s: State) => ({
  id: `dd_${s}`,
  type: 'BYTES_64' as const,
  initialData: b64(ORIGINAL),
  data: s === 'REJECTED-SEALED' || s === 'COMPLETED' ? b64(SEALED) : b64(ORIGINAL),
});
const itemFor = (s: State) => ({
  id: 'envelope_item_r2',
  envelopeId: 'envelope_r2',
  title: 'contract.pdf',
  order: 1,
  documentDataId: `dd_${s}`,
  documentData: documentDataFor(s),
  envelope: { id: 'envelope_r2', status: statusOf(s), internalVersion: 2, recipients: [], teamId: 1 },
});

const stubPrisma = async (state: State) => {
  const { prisma } = await import('@documenso/prisma');
  const item = itemFor(state);
  const set = (model: string, impl: Record<string, unknown>) =>
    Object.defineProperty(prisma, model, { configurable: true, writable: true, value: impl });
  set('envelopeItem', { findUnique: async () => item, findFirst: async () => item });
  set('apiToken', {
    findFirst: async () => ({
      id: 1,
      teamId: 1,
      expires: null,
      lastUsedAt: new Date(),
      user: { id: 1, name: 'Owner', email: 'owner@example.test', disabled: false },
      team: { organisationId: 'org_1', organisation: { organisationClaim: {}, owner: { disabled: false } } },
    }),
    updateMany: async () => ({ count: 0 }),
  });
};

const appWith = async (mount: (app: import('hono').Hono<any>) => Promise<void>) => {
  const { Hono } = await import('hono');
  const app = new Hono<any>();
  const quiet = { info() {}, warn() {}, error() {}, child: () => quiet };
  app.use(async (c, next) => {
    c.set('logger', quiet);
    await next();
  });
  await mount(app);
  return app;
};

const body = async (res: Response) => {
  const text = Buffer.from(await res.arrayBuffer()).toString();
  if (res.status !== 200) return `${res.status} ${JSON.parse(text).code ?? ''}`.trim();
  return text === ORIGINAL ? 'ORIGINAL' : text === SEALED ? 'SEALED' : `?${text.slice(0, 20)}`;
};
const filename = (res: Response) => /filename="?([^";]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? null;

test('review r2 [1]: recipient/QR token paths never serve the sealed artifact before COMPLETED (BYTES_64)', async () => {
  const { filesRoute } = require('../../apps/remix/server/api/files/files');
  const app = await appWith(async (a) => void a.route('/api/files', filesRoute));
  const expected: Record<State, Record<string, string>> = {
    PENDING: { preview: 'ORIGINAL', current: 'ORIGINAL', initial: 'ORIGINAL', dl: '400 DOCUMENT_NOT_COMPLETE', signed: '400 DOCUMENT_NOT_COMPLETE', original: 'ORIGINAL' },
    CANCELLED: { preview: 'ORIGINAL', current: 'ORIGINAL', initial: 'ORIGINAL', dl: '400 DOCUMENT_NOT_COMPLETE', signed: '400 DOCUMENT_NOT_COMPLETE', original: 'ORIGINAL' },
    'REJECTED-SEALED': { preview: 'ORIGINAL', current: 'ORIGINAL', initial: 'ORIGINAL', dl: '400 DOCUMENT_NOT_COMPLETE', signed: '400 DOCUMENT_NOT_COMPLETE', original: 'ORIGINAL' },
    COMPLETED: { preview: 'SEALED', current: 'SEALED', initial: 'ORIGINAL', dl: 'SEALED', signed: 'SEALED', original: 'ORIGINAL' },
  };
  for (const state of STATES) {
    await stubPrisma(state);
    for (const token of ['recipient_token_r2', 'qr_token_r2']) {
      const base = `/api/files/token/${token}`;
      const dataId = `${base}/envelope/envelope_r2/envelopeItem/envelope_item_r2/dataId/dd_${state}`;
      const got = {
        preview: await body(await app.request(`${base}/envelopeItem/envelope_item_r2`)),
        current: await body(await app.request(`${dataId}/current/item.pdf`)),
        initial: await body(await app.request(`${dataId}/initial/item.pdf`)),
        dl: await body(await app.request(`${base}/envelopeItem/envelope_item_r2/download`)),
        signed: await body(await app.request(`${base}/envelopeItem/envelope_item_r2/download/signed`)),
        original: await body(await app.request(`${base}/envelopeItem/envelope_item_r2/download/original`)),
      };
      assert.deepEqual(got, expected[state], `${state} via ${token.split('_')[0]}`);
    }
  }
});

test('review r2 [1]: staff/API downloads keep their bytes but are named signed only for COMPLETED', async () => {
  const { downloadRoute } = require('../../apps/remix/server/api/download/download');
  const app = await appWith(async (a) => void a.route('/api/v2', downloadRoute));
  const auth = { headers: { authorization: 'Bearer api_r2_test' } };
  const expected: Record<State, { signed: [string, string]; original: [string, string] }> = {
    PENDING: { signed: ['ORIGINAL', 'contract.pdf'], original: ['ORIGINAL', 'contract.pdf'] },
    CANCELLED: { signed: ['ORIGINAL', 'contract.pdf'], original: ['ORIGINAL', 'contract.pdf'] },
    // Upstream deliberately keeps the sealed rejection record available to the owner; it is not "signed".
    'REJECTED-SEALED': { signed: ['SEALED', 'contract_rejected.pdf'], original: ['ORIGINAL', 'contract.pdf'] },
    COMPLETED: { signed: ['SEALED', 'contract_signed.pdf'], original: ['ORIGINAL', 'contract.pdf'] },
  };
  for (const state of STATES) {
    await stubPrisma(state);
    const got: Record<string, [string, string | null]> = {};
    for (const version of ['signed', 'original'] as const) {
      const res = await app.request(`/api/v2/envelope/item/envelope_item_r2/download?version=${version}`, auth);
      got[version] = [await body(res), filename(res)];
    }
    assert.deepEqual(got, expected[state], state);
  }
});

test('review r2 [1]: one rule (envelope-artifact) for every path, S3 presign included', async () => {
  const a = await import('../../packages/lib/utils/envelope-artifact');
  const dd = { data: 'SEALED', initialData: 'ORIGINAL' };
  for (const status of ['DRAFT', 'PENDING', 'CANCELLED', 'REJECTED']) {
    assert.equal(a.recipientViewableData(status, dd), 'ORIGINAL', status);
    assert.equal(a.recipientDocumentDataVersion(status, 'current'), 'initial', status);
    assert.equal(a.recipientPreviewVersion(status), 'original', status);
    assert.equal(a.recipientDownloadRefusal(status, 'signed')?.code, 'DOCUMENT_NOT_COMPLETE', status);
    assert.doesNotMatch(a.envelopeDownloadFilename('Deal.pdf', 'signed', status), /_signed/, status);
  }
  assert.equal(a.recipientViewableData('COMPLETED', dd), 'SEALED');
  assert.equal(a.envelopeDownloadFilename('Deal.pdf', 'signed', 'COMPLETED'), 'Deal_signed.pdf');
  assert.equal(a.envelopeDownloadFilename('Deal.pdf', 'signed', 'REJECTED'), 'Deal_rejected.pdf');
  assert.equal(a.envelopeDownloadFilename('Deal.PDF', 'pending', 'PENDING'), 'Deal_pending.pdf');
  // S3 presign (v2-beta document download): signed URL only for sealed statuses (upstream), named by the same rule.
  assert.deepEqual(['DRAFT', 'PENDING', 'CANCELLED', 'REJECTED', 'COMPLETED'].filter(a.isSealedStatus), ['REJECTED', 'COMPLETED']);
  const s3 = read('packages/trpc/server/document-router/download-document-beta.ts');
  assert.match(s3, /const hasSignedArtifact = isSealedStatus\(envelope\.status\);/);
  assert.match(s3, /const filename = envelopeDownloadFilename\(envelope\.title, version, envelope\.status\);/);
  assert.doesNotMatch(s3, /_signed\.pdf/);
  // Every server path that names a file asks the helper; no hand-rolled `_signed.pdf` left on the server.
  for (const file of ['apps/remix/server/api/files/files.helpers.ts', 'apps/remix/server/api/download/download.ts']) {
    assert.doesNotMatch(read(file), /'_signed\.pdf'/, file);
  }
  assert.match(read('apps/remix/server/api/files/files.helpers.ts'), /envelopeDownloadFilename\(title, version, status\)/);
  // The recipient tRPC document endpoint follows it too.
  assert.match(read('packages/trpc/server/document-router/get-document-by-token.ts'), /data: recipientViewableData\(envelope\.status, firstDocumentData\)/);
});

test('review r2 [9]: recipient loader data carries item metadata, never documentData bytes or keys', async () => {
  const { toCompletionDocument, toCompletionRecipient } = await import('../../apps/remix/app/chief/completion-download');
  const { withoutDocumentBytes } = await import('../../packages/lib/utils/envelope-artifact');
  for (const state of STATES) {
    const dd = documentDataFor(state);
    const s3 = { ...dd, type: 'S3_PATH', data: 'org/1/sealed-key.pdf', initialData: 'org/1/original-key.pdf' };
    for (const documentData of [dd, s3]) {
      const document = {
        id: 7,
        envelopeId: 'envelope_r2',
        title: 'contract.pdf',
        status: statusOf(state),
        deletedAt: null,
        authOptions: { globalAccessAuth: [] },
        documentData,
        envelopeItems: [{ id: 'envelope_item_r2', envelopeId: 'envelope_r2', title: 'contract.pdf', order: 1, documentDataId: dd.id, documentData }],
      };
      const loaderJson = [
        JSON.stringify(toCompletionDocument(document)),
        JSON.stringify(withoutDocumentBytes(document)),
        JSON.stringify(toCompletionRecipient({ token: 't', role: 'SIGNER', email: 'r@example.test', name: 'R', authOptions: {} })),
      ].join('\n');
      for (const leak of [dd.data, dd.initialData, b64('%PDF'), 'sealed-key', 'original-key', '"initialData"', '"data"']) {
        assert.ok(!loaderJson.includes(leak), `${state}/${documentData.type}: loader data contains ${leak.slice(0, 16)}`);
      }
    }
  }
  assert.deepEqual(
    toCompletionDocument({ id: 7, envelopeId: 'e', title: 't', status: 'REJECTED', deletedAt: null, envelopeItems: [{ id: 'i', envelopeId: 'e', title: 't', order: 1, documentData: documentDataFor('REJECTED-SEALED') } as never] }),
    { id: 7, envelopeId: 'e', title: 't', status: 'REJECTED', deletedAt: null, envelopeItems: [{ id: 'i', envelopeId: 'e', title: 't', order: 1 }] },
  );
  const complete = read('apps/remix/app/routes/_recipient+/sign.$token+/complete.tsx');
  assert.match(complete, /document: toCompletionDocument\(document\),\s*recipient: toCompletionRecipient\(recipient\),/);
  const loaderSrc = complete.slice(complete.indexOf('isDocumentAccessValid: true'), complete.indexOf('export default function'));
  assert.doesNotMatch(loaderSrc, /^\s*(document|recipient),$/m, 'no raw document/recipient in the loader result');
  const sign = read('apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx');
  assert.match(sign, /document: withoutDocumentBytes\(document\),/);
});

// ---- [2] the Theme action refuses a foreign Origin (no cookie), through middleware + listener + action ----------
const STAFF = 'https://sign.example.test:9444';
const RECIPIENT = 'https://sign.example.test:9445';
test('review r2 [2]: /api/theme: a foreign Origin gets no cookie, the staff/recipient origin works', async () => {
  process.env.NEXT_PUBLIC_WEBAPP_URL = STAFF;
  process.env.CHIEF_RECIPIENT_URL = RECIPIENT;
  const { createThemeAction } = await import('remix-themes');
  const { themeSessionResolver } = await import('../../apps/remix/app/storage/theme-session.server');
  // Compose exactly what the route module composes (on the reviewed commit: the bare remix-themes action).
  const route = read('apps/remix/app/routes/api+/theme.tsx');
  const withThemeOriginCheck: <F>(f: F) => F = route.includes('withThemeOriginCheck(createThemeAction(')
    ? (await import('../../apps/remix/server/chief/theme-origin')).withThemeOriginCheck
    : (f) => f;
  const { appMiddleware } = await import('../../apps/remix/server/middleware');
  const { recipientFetch } = await import('../../apps/remix/server/chief/recipient-listener');
  // Run behind the real middleware and recipient listener, as React Router runs a resource-route action.
  const action = withThemeOriginCheck(createThemeAction(themeSessionResolver));
  const app = await appWith(async (a) => {
    a.use('*', appMiddleware);
    a.all('*', (c) => action({ request: c.req.raw, params: {}, context: {} } as never) as Promise<Response>);
  });
  const conn = { incoming: { socket: { remoteAddress: '100.64.0.7', remotePort: 40000, remoteFamily: 'IPv4' } } };
  const staffFetch = (r: Request) => app.fetch(r, conn);
  const recipientListener = recipientFetch((r: Request) => {
    const h = new Headers(r.headers);
    h.set('x-chief-recipient-listener', '1');
    return app.fetch(new Request(r, { headers: h }), conn);
  });
  const post = async (listener: 'staff' | 'recipient', origin: string | null, p = '/api/theme', type = 'application/json') => {
    const publicHost = new URL(listener === 'staff' ? STAFF : RECIPIENT).host;
    const headers: Record<string, string> = { 'content-type': type, 'x-forwarded-proto': 'https', 'x-forwarded-host': publicHost };
    if (origin) headers.origin = origin;
    const req = new Request(`http://127.0.0.1:3000${p}`, { method: 'POST', headers, body: JSON.stringify({ theme: 'dark' }) });
    const res = await (listener === 'staff' ? staffFetch(req) : recipientListener(req));
    return `${res.status} cookie=${/^theme=/.test(res.headers.get('set-cookie') ?? '') ? 'set' : 'none'}`;
  };
  assert.equal(await post('staff', STAFF), '200 cookie=set', 'staff same origin');
  assert.equal(await post('recipient', RECIPIENT), '200 cookie=set', 'recipient same origin');
  for (const [listener, origin, p] of [
    ['staff', 'https://attacker.example', '/api/theme'],
    ['staff', 'https://attacker.example', '/api/theme/'],
    ['staff', 'https://attacker.example', '/api/%74heme'],
    ['staff', 'null', '/api/theme'],
    ['staff', null, '/api/theme'],
    ['staff', RECIPIENT, '/api/theme'], // the recipient origin only counts on the recipient listener's public origin
    ['recipient', 'https://attacker.example', '/api/theme'],
    ['recipient', null, '/api/theme'],
  ] as const) {
    assert.equal(await post(listener, origin, p), '403 cookie=none', `${listener} Origin=${origin} ${p}`);
  }
  // Content-type checks stay strict.
  assert.equal(await post('staff', STAFF, '/api/theme', 'text/plain'), '415 cookie=none');
  assert.equal(await post('recipient', RECIPIENT, '/api/theme', 'text/plain'), '415 cookie=none');
  assert.match(read('apps/remix/app/routes/api+/theme.tsx'), /export const action = withThemeOriginCheck\(createThemeAction\(themeSessionResolver\)\);/);
});

// ---- [8] the CI integrity step is unconditional and fails closed without fds.lock --------------------------------
test('review r2 [8]: vendored-fds integrity runs unconditionally in CI and FAILS when fds.lock is missing', () => {
  const wf = read('.github/workflows/chief-images.yml');
  const step = wf.slice(wf.indexOf('- name: Vendored design system integrity'), wf.indexOf('- uses: docker/login-action@v3'));
  assert.ok(step.length > 0, 'integrity step present');
  assert.doesNotMatch(step, /^\s*if:/m, 'no condition on the integrity step');
  assert.match(step, /run: bash chief\/inventory\/check-fds-vendored\.sh --ci/);
  assert.ok(wf.indexOf('Vendored design system integrity') < wf.indexOf('npm ci'), 'before install/build');
  assert.ok(fs.existsSync('packages/fleet-ui/fds/fds.lock'), 'the lock is committed');
  // Run the real script against a copy of the vendored dir without its lock: explicit FAIL (exit 1), in both modes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fds-nolock-'));
  try {
    fs.cpSync('packages/fleet-ui/fds', dir, { recursive: true });
    fs.rmSync(path.join(dir, 'fds.lock'));
    for (const args of [[], ['--ci']]) {
      const r = spawnSync('bash', ['chief/inventory/check-fds-vendored.sh', ...args], {
        env: { ...process.env, FDS_VENDORED_DIR: dir, FDS_READ_TOKEN: '' },
        encoding: 'utf8',
      });
      assert.equal(r.status, 1, `exit status ${args.join(' ') || '(local)'}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /FAIL: .*fds\.lock missing/, args.join(' '));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
