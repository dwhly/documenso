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

