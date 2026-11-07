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
test('fds r2: recipient origin behind a TLS proxy honours X-Forwarded-Proto/Host', async () => {
  const {createChiefPublicEnv}=await import('../../apps/remix/app/chief/public-env.server');
  const {isRecipientOrigin}=await import('../../apps/remix/server/chief/recipient-origin');
  const saved=process.env.CHIEF_RECIPIENT_URL;process.env.CHIEF_RECIPIENT_URL='https://sign.example:9445';
  try {
    const proxied=(path:string,host:string,extra:Record<string,string>={})=>new Request(`http://${host}${path}`,{method:'POST',headers:{'X-Forwarded-Proto':'https','X-Forwarded-Host':host,...extra}});
    assert.equal(createChiefPublicEnv(proxied('/sign/token','sign.example:9445')).NEXT_PUBLIC_WEBAPP_URL,'https://sign.example:9445');
    assert.notEqual(createChiefPublicEnv(proxied('/sign/token','sign.example:9444')).NEXT_PUBLIC_WEBAPP_URL,'https://sign.example:9445');
    // Without the proxy headers a plain-http request is not the https recipient origin.
    assert.notEqual(createChiefPublicEnv(new Request('http://sign.example:9445/sign/token')).NEXT_PUBLIC_WEBAPP_URL,'https://sign.example:9445');
    assert.equal(isRecipientOrigin(proxied('/api/trpc/envelope.field.sign','sign.example:9445',{Origin:'https://sign.example:9445'})),true);
    assert.equal(isRecipientOrigin(proxied('/api/trpc/envelope.field.sign','sign.example:9445',{Origin:'https://attacker.example'})),false);
    assert.equal(isRecipientOrigin(proxied('/api/deal/team/settings/update','sign.example:9445',{Origin:'https://sign.example:9445'})),false);
  } finally { if(saved===undefined) delete process.env.CHIEF_RECIPIENT_URL; else process.env.CHIEF_RECIPIENT_URL=saved; }
});
test('fds r2: recipient listener answers the session poll as signed out, never with a staff session', async () => {
  const {recipientFetch}=await import('../../apps/remix/server/chief/recipient-listener');
  let reached=false;
  const handler=recipientFetch(() => { reached=true; return new Response('app'); });
  const res=await handler(new Request('https://sign.example:9445/api/auth/session-json',{headers:{cookie:'sessionId=staff'}}));
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{json:{isAuthenticated:false,session:null,user:null}});
  assert.equal(reached,false);
  assert.equal((await handler(new Request('https://sign.example:9445/api/auth/session'))).status,404);
  assert.equal((await handler(new Request('https://sign.example:9445/api/auth/session-json',{method:'POST'}))).status,404);
});
test('fds r2: email subjects read "Fleet Dealroom: <what>" only when the prefix env is set', async () => {
  const {withSubjectPrefix}=await import('../../packages/email/chief-subject');
  assert.equal(withSubjectPrefix('Please sign this document','Fleet Dealroom'),'Fleet Dealroom: please sign this document');
  assert.equal(withSubjectPrefix('Your verification code','Fleet Dealroom'),'Fleet Dealroom: your verification code');
  assert.equal(withSubjectPrefix('Raj has invited you to sign "NDA"','Fleet Dealroom'),'Fleet Dealroom: Raj has invited you to sign "NDA"');
  assert.equal(withSubjectPrefix('Fleet Dealroom: already','Fleet Dealroom'),'Fleet Dealroom: already');
  assert.equal(withSubjectPrefix('Please sign this document',undefined),'Please sign this document');
});
