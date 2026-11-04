import assert from 'node:assert/strict';
import test from 'node:test';
import {
  routeDecision,
  containsExcludedFeature,
  isRecipientRequest,
  widensAccess,
  procedureInventory,
} from '../../apps/remix/server/chief/policy';
for (const path of [
  '/admin',
  '/admin.data',
  '/o/example/settings',
  '/signup',
  '/api/v1/me',
  '/api/csc/start',
  '/api/ai/detect-fields',
  '/api/jobs/run',
  '/api/auth/embed/start',
  '/api/auth/passkey/authorize',
  '/api/trpc/admin.user.create',
  '/api/trpc/envelope.find,admin.user.create',
  '/api/trpc/envelope.find,unknown.procedure',
  '/api/v2/embedding/create-presign-token',
  '/api/files/unknown',
  '/unknown-page',
]) {
  test(`deny bypass ${path}`, () => assert.equal(routeDecision('POST', path), 'denied'));
}
test('native API token minting is human-only', () => {
  assert.equal(routeDecision('POST', '/api/trpc/apiToken.create', true), 'denied');
  assert.equal(routeDecision('POST', '/api/trpc/apiToken.create', false), 'allowed');
});
for (const name of [
  'envelope.recipient.updateMany',
  'envelope.recipient.set',
  'recipient.updateDocumentRecipient',
  'recipient.updateDocumentRecipients',
  'recipient.updateTemplateRecipient',
  'recipient.setDocumentRecipients',
  'webhook.editWebhook',
  'team.settings.update',
  'envelope.update',
  'document.update',
]) {
  test(`edit-to-widen cannot evade classification: ${name}`, () => assert.equal(widensAccess(name), true));
}
test('unknown mutation fails closed for approvals', () => assert.equal(widensAccess('future.accessEdit'), true));
test('every mutation has a widening classification', () => {
  for (const p of procedureInventory.filter((p) => p.type === 'mutation')) {
    assert.equal(typeof p.widensAccess, 'boolean', p.name);
  }
});
test('actual recipient canvas signing procedure remains reachable', () =>
  assert.equal(routeDecision('POST', '/api/trpc/envelope.field.sign'), 'allowed'));
test('normal document download remains reachable', () =>
  assert.equal(routeDecision('GET', '/api/v2/envelope/item/item123/download'), 'allowed'));

for (const payload of [
  { globalActionAuth: ['PASSKEY'] },
  { '0': { json: { recipients: [{ actionAuth: ['TWO_FACTOR_AUTH'] }] } } },
  { authOptions: { type: 'PASSKEY' } },
  { signatureLevel: 'QES' },
]) {
  test(`commercial-auth bypass denied ${JSON.stringify(payload)}`, () =>
    assert.equal(containsExcludedFeature(payload), true));
}
test('ordinary signature is supported', () =>
  assert.equal(
    containsExcludedFeature({
      fieldValue: { type: 'SIGNATURE', value: 'Fixture signer' },
      authOptions: { type: 'EXPLICIT_NONE' },
    }),
    false,
  ));

test('recipient listener rejects mixed batches and staff paths', () => {
  for (const path of [
    '/signin',
    '/api/v2/openapi.json',
    '/api/trpc/envelope.field.sign,envelope.create',
    '/api/trpc/future.sign',
    '/api/jobs/run',
    '/d/token',
    '/report/token',
  ]) {
    assert.equal(isRecipientRequest('POST', path), false, path);
  }
  assert.equal(isRecipientRequest('POST', '/api/trpc/envelope.field.sign'), true);
  assert.equal(isRecipientRequest('GET', '/api/trpc/envelope.field.sign'), false);
  assert.equal(isRecipientRequest('GET', '/sign/token.data'), true);
  assert.equal(isRecipientRequest('GET', '/api/files/token/token/envelopeItem/item'), true);
});

test('jobs only accept actual loopback connections and POST', () => {
  assert.equal(routeDecision('POST', '/api/jobs/internal.seal-document/id', false, '127.0.0.1'), 'internal');
  for (const address of ['192.168.65.1', '100.110.241.2', undefined]) {
    assert.equal(routeDecision('POST', '/api/jobs/internal.seal-document/id', false, address), 'denied');
  }
  assert.equal(routeDecision('GET', '/api/jobs/internal.seal-document/id', false, '127.0.0.1'), 'denied');
});

test('actual optional-version recipient download route works with and without version', () => {
  for (const suffix of ['', '/signed', '/original']) {
    const path = `/api/files/token/token/envelopeItem/item/download${suffix}`;
    assert.equal(routeDecision('GET', path), 'allowed');
    assert.equal(isRecipientRequest('GET', path), true);
  }
});
