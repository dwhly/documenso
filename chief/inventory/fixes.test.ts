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
test('r1 finding 4: public share remains human-only', () => {
  assert.equal(routeDecision('POST','/api/deal/document/share',true),'denied');
  assert.equal(routeDecision('POST','/api/trpc/document.share',true),'denied');
});
test('r1 finding 11: all-team inbox remains human-only', () => {
  for (const name of ['find','getCount']) {
    assert.equal(routeDecision('POST',`/api/deal/document/inbox/${name}`,true),'denied');
    assert.equal(routeDecision('GET',`/api/trpc/document.inbox.${name}`,true),'denied');
  }
});
test('r1 finding 3: recipient origin allowance is exact and limited to recipient routes', async () => {
  const {isRecipientOrigin}=await import('../../apps/remix/server/chief/recipient-origin');
  const saved=process.env.CHIEF_RECIPIENT_URL;process.env.CHIEF_RECIPIENT_URL='http://127.0.0.1:8798';
  try {
    const req=(host:string,path:string,origin:string)=>new Request(host+path,{method:'POST',headers:{Origin:origin}});
    assert.equal(isRecipientOrigin(req('http://127.0.0.1:8798','/api/trpc/envelope.field.sign','http://127.0.0.1:8798')),true);
    assert.equal(isRecipientOrigin(req('http://127.0.0.1:8798','/api/trpc/envelope.field.sign','https://attacker.example')),false);
    assert.equal(isRecipientOrigin(req('http://127.0.0.1:8798','/api/deal/team/settings/update','http://127.0.0.1:8798')),false);
    assert.equal(isRecipientOrigin(req('http://staff.example','/api/trpc/envelope.field.sign','http://127.0.0.1:8798')),false);
  } finally { if(saved===undefined) delete process.env.CHIEF_RECIPIENT_URL; else process.env.CHIEF_RECIPIENT_URL=saved; }
});
test('r1 finding 3: recipient PDF URLs use the recipient origin', async () => {
  const {createChiefPublicEnv}=await import('../../apps/remix/app/chief/public-env.server');
  const saved=process.env.CHIEF_RECIPIENT_URL;process.env.CHIEF_RECIPIENT_URL='http://127.0.0.1:8798';
  try {
    assert.equal(createChiefPublicEnv(new Request('http://127.0.0.1:8798/sign/token')).NEXT_PUBLIC_WEBAPP_URL,'http://127.0.0.1:8798');
    assert.notEqual(createChiefPublicEnv(new Request('http://staff.example/sign/token')).NEXT_PUBLIC_WEBAPP_URL,'http://127.0.0.1:8798');
  } finally { if(saved===undefined) delete process.env.CHIEF_RECIPIENT_URL; else process.env.CHIEF_RECIPIENT_URL=saved; }
});
