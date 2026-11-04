import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { routeDecision } from '../../apps/remix/server/chief/policy';
import { finalizeTspEnvelopeCompletion } from '../../packages/community-ee/server-only/signing/csc/finalize-tsp-completion';

test('r1 finding 7: qualified completion fails loudly', async () => {
  await assert.rejects(finalizeTspEnvelopeCompletion({}), { code: 'NOT_SUPPORTED' });
});
test('r1 finding 8: unsupported organisation invite is denied', () => {
  assert.equal(routeDecision('GET', '/organisation/invite/example-token'), 'denied');
});
test('r1 finding 12: root data navigation stays available to staff', () => {
  assert.equal(routeDecision('GET', '/_root.data'), 'allowed');
});
test('r1 finding 12: operator comparison uses the constant-time primitive', () => {
  const source=fs.readFileSync('apps/remix/server/middleware.ts','utf8');
  assert.match(source,/timingSafeEqual\(actual, secret\)/);
  assert.match(source,/actual\.length === secret\.length/);
});
test('r1 finding 12: recipient brand links target a recipient-allowed page', () => {
  const source=fs.readFileSync('apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx','utf8');
  assert.doesNotMatch(source,/<Link to="\/"/);
  assert.match(source,/<Link to="\/articles\/signature-disclosure"/);
});
