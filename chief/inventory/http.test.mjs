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
 const r=await fetch(`${base}/api/deal/openapi.json`);assert.equal(r.status,200);const spec=await r.json();assert.ok(spec.paths['/team/settings/update']);assert.ok(spec.paths['/webhook/editWebhook']);assert.equal(Object.keys(spec.paths).length,39);
});
test('adapter enforces native authentication',async()=>{
 assert.equal((await post('/api/deal/webhook/getTeamWebhooks',{},null)).status,401);
 assert.equal((await post('/api/deal/webhook/getTeamWebhooks',{},'invalid')).status,401);
});
test('adapter binds credentials to issuing team',async()=>{
 const r=await post('/api/deal/team/settings/update',{teamId:teamId+999,data:{brandingEnabled:true}});assert.equal(r.status,403);
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
 const form=new FormData();form.append('payload',JSON.stringify({teamId:teamId+999}));
 const r=await fetch(`${base}/api/deal/team/settings/updateBrandingLogo`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});assert.equal(r.status,403);
});
test('native token list adapter does not disclose token material',async()=>{
 const r=await post('/api/deal/apiToken/getMany',{});assert.equal(r.status,200);const rows=await r.json();assert.ok(Array.isArray(rows));assert.ok(rows.length>0);assert.ok(rows.every(row=>!('token' in row)));
});
