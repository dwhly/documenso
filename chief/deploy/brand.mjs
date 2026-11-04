import fs from 'node:fs';
import assert from 'node:assert/strict';
const {token,teamId}=JSON.parse(fs.readFileSync('chief/deploy/secrets/staff.json'));
const base=process.env.SIGN_BASE || 'http://sign-v1.100-110-241-2.sslip.io';
const post=async (path,body,headers={})=>{
 const r=await fetch(`${base}/api/deal/${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,...headers},body});
 const text=await r.text();assert.equal(r.ok,true,`${path}: ${r.status} ${text}`);console.log(path,r.status);
};
await post('team/settings/update',JSON.stringify({teamId,data:{brandingEnabled:true,brandingCompanyDetails:'AmForge LLC — confidential deal communications',brandingUrl:'http://sign-v1.100-110-241-2.sslip.io',includeSigningCertificate:true,includeAuditLog:true,aiFeaturesEnabled:false}}),{'Content-Type':'application/json'});
const form=new FormData();form.append('payload',JSON.stringify({teamId}));form.append('brandingLogo',new File([fs.readFileSync('chief/deploy/branding/logo.png')],'logo.png',{type:'image/png'}));
await post('team/settings/updateBrandingLogo',form);
