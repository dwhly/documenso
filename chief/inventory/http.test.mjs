import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const base=process.env.SIGN_BASE || 'http://sign-v1.100-110-241-2.sslip.io';
const {token,teamId}=JSON.parse(fs.readFileSync('chief/deploy/secrets/staff.json'));
const post=(path,body,auth=token)=>fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify(body)});
for(const path of ['/admin','/signup','/api/v1/me','/api/ai/detect-fields','/api/jobs/run','/api/trpc/envelope.find,admin.user.create','/api/trpc/unknown.x','/api/trpc/apiToken.create','/api/auth/passkey/authorize','/api/auth/email-password/signup']){
 test(`HTTP denied ${path}`,async()=>assert.equal((await post(path,{})).status,404));
}
test('generated supplemental schema is served',async()=>{
 const r=await fetch(`${base}/api/deal/openapi.json`);assert.equal(r.status,200);const spec=await r.json();assert.ok(spec.paths['/team/settings/update']);assert.ok(spec.paths['/webhook/editWebhook']);assert.equal(Object.keys(spec.paths).length,36);
});
test('adapter enforces native authentication',async()=>{
 assert.equal((await post('/api/deal/webhook/getTeamWebhooks',{},null)).status,401);
 assert.equal((await post('/api/deal/webhook/getTeamWebhooks',{},'invalid')).status,401);
});
test('adapter binds credentials to issuing team',async()=>{
 const r=await post('/api/deal/team/settings/update',{teamId:JSON.parse(fs.readFileSync('chief/deploy/secrets/second-team.json')).teamId,data:{brandingEnabled:true}});assert.equal(r.status,403);
});
test('adapter returns actual native webhooks',async()=>{
 const r=await post('/api/deal/webhook/getTeamWebhooks',{});assert.equal(r.status,200);assert.ok(Array.isArray(await r.json()));
});
test('EE auth cannot be enabled through ordinary edit',async()=>{
 const r=await post('/api/v2/envelope/update',{envelopeId:'not-important',data:{globalActionAuth:['PASSKEY']}});assert.equal(r.status,403);
});
test('recipient listener header denies staff and mixed procedure batches',async()=>{
 for(const path of ['/signin','/api/deal/openapi.json','/api/trpc/envelope.field.sign,envelope.create']) {
  const r=await fetch(`${base}${path}`,{headers:{'X-Chief-Recipient-Listener':'1'}});assert.equal(r.status,404,path);
 }
 const r=await fetch(`${base}/assets/not-an-asset`,{headers:{'X-Chief-Recipient-Listener':'1'}});assert.notEqual(r.status,200);
});
test('multipart adapter also binds the issuing team',async()=>{
 const form=new FormData();form.append('payload',JSON.stringify({teamId:JSON.parse(fs.readFileSync('chief/deploy/secrets/second-team.json')).teamId}));
 const r=await fetch(`${base}/api/deal/team/settings/updateBrandingLogo`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});assert.equal(r.status,403);
});
test('native token list adapter does not disclose token material',async()=>{
 const r=await post('/api/deal/apiToken/getMany',{});assert.equal(r.status,200);const rows=await r.json();assert.ok(Array.isArray(rows));assert.ok(rows.length>0);assert.ok(rows.every(row=>!('token' in row)));
});

test('r1 finding 1: payload brackets and every multipart string are scanned', async()=>{
 for(const path of ['/api/v2/envelope/create','/api/v2/envelope/item/create-many']) {
  for(const key of ['payload[]','extra[]']) {
   const body=new FormData(); body.append(key,JSON.stringify({globalActionAuth:['PASSKEY']}));
   const r=await fetch(`${base}${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body});
   assert.equal(r.status,403,`${path} ${key}`);
  }
 }
});
test('r1 finding 1: unsupported API content types fail closed',async()=>{
 for(const type of ['text/plain','application/x-www-form-urlencoded','application/jsonp']) {
  const r=await fetch(`${base}/api/v2/envelope/create`,{method:'POST',headers:{'Content-Type':type},body:'{}'});
  assert.equal(r.status,415,type);
 }
});
test('r1 finding 3: independent recipient socket rejects staff without trusting headers', async()=>{
 const recipient=process.env.SIGN_RECIPIENT_BASE || 'http://127.0.0.1:8798';
 for(const value of [undefined,'0','1']) {
  for(const path of ['/signin','/api/deal/openapi.json','/api/trpc/envelope.field.sign,envelope.create','/api/jobs/run']) {
   const r=await fetch(`${recipient}${path}`,{headers:value?{'X-Chief-Recipient-Listener':value}:{}});
   assert.equal(r.status,404,`${path} header=${value}`);
  }
 }
 assert.equal((await fetch(`${recipient}/articles/signature-disclosure`)).status,200);
});
test('r1 finding 4: public share cannot be invoked through staff adapter', async()=>{
 assert.equal((await post('/api/deal/document/share',{documentId:1},'***')).status,404);
});
test('r1 finding 9: malformed JSON and multipart are client errors',async()=>{
 for(const [type,body] of [['application/json','{'],['multipart/form-data; boundary=missing','broken']]) {
  const r=await fetch(`${base}/api/v2/envelope/create`,{method:'POST',headers:{'Content-Type':type},body});assert.equal(r.status,400);
 }
});
test('r1 finding 9: oversized unauthenticated body is rejected before inspection',async()=>{
 const r=await fetch(`${base}/api/trpc/envelope.field.sign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(25*1024*1024)})});assert.equal(r.status,413);
});
test('r1 finding 11: inbox is human-only and adapter has native rate limiting',async()=>{
 for(const path of ['document/inbox/find','document/inbox/getCount']) assert.equal((await post(`/api/deal/${path}`,{})).status,404);
 const r=await fetch(`${base}/api/deal/openapi.json`);assert.equal(r.status,200);assert.equal(r.headers.get('x-ratelimit-limit'),'1000');assert.ok(Number(r.headers.get('x-ratelimit-remaining'))<1000);
});
test('r1 finding 5: same staff can mutate second team with its own credential',async()=>{
 const second=JSON.parse(fs.readFileSync('chief/deploy/secrets/second-team.json'));
 assert.notEqual(second.teamId,teamId);
 assert.equal((await post('/api/deal/team/settings/update',{teamId:second.teamId,data:{brandingEnabled:true}},second.token)).status,200);
 const body=new FormData();body.append('payload',JSON.stringify({teamId:second.teamId}));
 assert.equal((await fetch(`${base}/api/deal/team/settings/updateBrandingLogo`,{method:'POST',headers:{Authorization:`Bearer ${second.token}`},body})).status,200);
});
test('r1 finding 11: supplemental API applies the native rate limiter',async()=>{
 const r=await fetch(`${base}/api/deal/openapi.json`);assert.equal(r.status,200);
 assert.equal(r.headers.get('x-ratelimit-limit'),'1000');assert.ok(Number(r.headers.get('x-ratelimit-remaining'))<1000);
});
