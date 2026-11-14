// Review r1 (cross-family, fds v0.9 adoption) regressions. Each test failed on the reviewed commit 3ba2d900c.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const read = (p: string) => fs.readFileSync(p, 'utf8');
const STATUSES = ['DRAFT', 'PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED'];

// [1] A cancelled/rejected document must never be offered or served as a signed PDF.
test('review r1 [1]: token download refuses the signed PDF unless the envelope is COMPLETED', async () => {
  const { tokenDownloadRefusal } = await import('../../apps/remix/server/chief/token-download');
  for (const status of STATUSES.filter((s) => s !== 'COMPLETED')) {
    assert.equal(tokenDownloadRefusal(status, 'signed')?.code, 'DOCUMENT_NOT_COMPLETE', status);
  }
  assert.equal(tokenDownloadRefusal('COMPLETED', 'signed'), null);
  for (const status of STATUSES) {
    assert.equal(tokenDownloadRefusal(status, 'original'), null, `original stays available (${status})`);
  }
});
test('review r1 [1]: the recipient-token download route checks status before serving bytes, for this envelope only', () => {
  const source = read('apps/remix/server/api/files/files.ts');
  const route = source.slice(source.indexOf("'/token/:token/envelopeItem/:envelopeItemId/download/:version?'"));
  const serve = route.indexOf('handleEnvelopeItemFileRequest(');
  const guard = route.indexOf('tokenDownloadRefusal(envelopeItem.envelope.status, version)');
  assert.ok(serve > 0, 'route found');
  assert.ok(guard > 0 && guard < serve, 'refusal runs before the file is served');
  // The lookup is scoped to a recipient token (or the QR token) of the envelope that owns the item.
  assert.match(route.slice(0, serve), /envelope: \{\s*recipients: \{\s*some: \{\s*token,/);
  assert.match(route.slice(0, serve), /envelope: \{\s*qrToken: token,/);
});
test('review r1 [1]: the completion page offers Download only for a real COMPLETED', async () => {
  const { isSignedDownloadReady } = await import('../../apps/remix/app/chief/completion-download');
  for (const status of ['REJECTED', 'CANCELLED', 'PENDING', 'DRAFT']) {
    assert.equal(isSignedDownloadReady('PENDING', status), false, status);
    assert.equal(isSignedDownloadReady(status, status), false, status);
  }
  assert.equal(isSignedDownloadReady('PROCESSING', 'PENDING'), false);
  assert.equal(isSignedDownloadReady('COMPLETED', 'PENDING'), true, 'live poll promotes the last signer');
  assert.equal(isSignedDownloadReady(undefined, 'COMPLETED'), true);
  const page = read('apps/remix/app/routes/_recipient+/sign.$token+/complete.tsx');
  assert.doesNotMatch(page, /isDocumentCompleted/);
  assert.match(page, /isSignedDownloadReady\(signingStatus, document\.status\)/);
});

// [2] The Theme choice persists: JSON to POST /api/theme on both listeners, middleware still strict.
const callMiddleware = async (rawPath: string, init: { method?: string; type?: string; body?: string; recipient?: boolean }) => {
  const { Hono } = await import('hono');
  const { appMiddleware } = await import('../../apps/remix/server/middleware');
  let reached = false;
  const app = new Hono();
  app.use('*', appMiddleware);
  app.all('*', (c) => {
    reached = true;
    return c.json({ ok: true });
  });
  const headers: Record<string, string> = {};
  if (init.type) headers['content-type'] = init.type;
  if (init.recipient) headers['x-chief-recipient-listener'] = '1';
  const res = await app.request(
    rawPath,
    { method: init.method ?? 'POST', headers, body: init.body },
    { incoming: { socket: { remoteAddress: '100.64.0.7', remotePort: 40000, remoteFamily: 'IPv4' } } },
  );
  return { status: res.status, reached };
};
const dark = JSON.stringify({ theme: 'dark' });
test('review r1 [2]: middleware stays strict: a non-JSON POST /api/theme is still 415', async () => {
  for (const recipient of [false, true]) {
    const r = await callMiddleware('/api/theme', { type: 'text/plain;charset=UTF-8', body: dark, recipient });
    assert.deepEqual(r, { status: 415, reached: false }, `recipient=${recipient}`);
    const malformed = await callMiddleware('/api/theme', { type: 'application/json', body: '{theme:', recipient });
    assert.deepEqual(malformed, { status: 400, reached: false }, `malformed recipient=${recipient}`);
  }
});
test('review r1 [2]: a JSON POST /api/theme reaches the theme action on the staff and recipient listeners', async () => {
  assert.deepEqual(await callMiddleware('/api/theme', { type: 'application/json', body: dark }), { status: 200, reached: true });
  assert.deepEqual(await callMiddleware('/api/theme', { type: 'application/json', body: dark, recipient: true }), {
    status: 200,
    reached: true,
  });
});
test('review r1 [2]: the recipient allowance is exactly POST /api/theme', async () => {
  for (const [method, rawPath] of [
    ['POST', '/api/theme.data'],
    ['POST', '/api/theme/'],
    ['POST', '/api/locale'],
    ['POST', '/api/preferred-team'],
    ['PUT', '/api/theme'],
  ]) {
    const r = await callMiddleware(rawPath, { method, type: 'application/json', body: dark, recipient: true });
    assert.deepEqual(r, { status: 404, reached: false }, `${method} ${rawPath}`);
  }
  const { recipientFetch } = await import('../../apps/remix/server/chief/recipient-listener');
  const app = recipientFetch(() => new Response('app'));
  const post = (p: string) =>
    app(new Request(`https://sign.example:9445${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: dark }));
  assert.equal(await (await post('/api/theme')).text(), 'app');
  assert.equal((await post('/api/theme.data')).status, 404);
  assert.equal((await post('/api/locale')).status, 404);
});
test('review r1 [2]: the recipient-origin CSRF allowance covers /api/theme only from the recipient origin', async () => {
  const { isRecipientOrigin } = await import('../../apps/remix/server/chief/recipient-origin');
  const saved = process.env.CHIEF_RECIPIENT_URL;
  process.env.CHIEF_RECIPIENT_URL = 'http://127.0.0.1:8798';
  try {
    const req = (origin: string) =>
      new Request('http://127.0.0.1:8798/api/theme', { method: 'POST', headers: { Origin: origin } });
    assert.equal(isRecipientOrigin(req('http://127.0.0.1:8798')), true);
    assert.equal(isRecipientOrigin(req('https://attacker.example')), false);
  } finally {
    if (saved === undefined) delete process.env.CHIEF_RECIPIENT_URL;
    else process.env.CHIEF_RECIPIENT_URL = saved;
  }
});
test('review r1 [2]: remix-themes posts the theme as application/json (tracked patch, applied to the installed copy)', () => {
  const patch = read('patches/remix-themes+2.0.4.patch');
  assert.equal(patch.match(/^\+ {10}headers: \{ "Content-Type": "application\/json" \},$/gm)?.length, 4);
  const pkg = 'node_modules/remix-themes'; // the copy the app build bundles (package.json is not exported)
  assert.equal(JSON.parse(read(`${pkg}/package.json`)).version, '2.0.4', 'patch matches the locked version');
  for (const file of ['index.js', 'index.cjs']) {
    const dist = read(`${pkg}/dist/${file}`);
    const posts = dist.split('fetch(`${themeAction}`').slice(1).map((rest) => rest.slice(0, rest.indexOf('});')));
    assert.equal(posts.length, 2, file);
    for (const post of posts) assert.match(post, /headers: \{ "Content-Type": "application\/json" \}/, file);
  }
});

