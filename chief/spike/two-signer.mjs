import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.SIGN_BASE || 'http://sign-v1.100-110-241-2.sslip.io';
const credential=JSON.parse(fs.readFileSync('chief/deploy/secrets/staff.json'));
const artifacts='chief/deploy/artifacts';fs.mkdirSync(artifacts,{recursive:true});
const headers={Authorization:`Bearer ${credential.token}`};
const api=async (route,options={})=>{
 const response=await fetch(`${base}/api/v2/${route}`,{...options,headers:{...headers,...options.headers}});
 const text=await response.text();assert.equal(response.ok,true,`${route}: ${response.status} ${text.slice(0,800)}`);return JSON.parse(text);
};
const payload={type:'DOCUMENT',title:`Chief two signer acceptance ${Date.now()}`,meta:{signingOrder:'SEQUENTIAL'},recipients:[1,2].map(i=>({email:`chief-spike-signer${i}@amforge.test`,name:`Chief Signer ${i}`,role:'SIGNER',signingOrder:i,fields:[{identifier:'contract.pdf',type:'SIGNATURE',fieldMeta:{type:'signature'},page:1,positionX:10,positionY:15+i*20,width:40,height:10}]}))};
const form=new FormData();form.append('payload',JSON.stringify(payload));form.append('files',new File([fs.readFileSync('assets/example.pdf')],'contract.pdf',{type:'application/pdf'}));
const envelope=await api('envelope/create',{method:'POST',body:form});
fs.writeFileSync(`${artifacts}/envelope.json`,JSON.stringify(envelope,null,2));
const sent=await api('envelope/distribute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({envelopeId:envelope.id,meta:{distributionMethod:'NONE'}})});
fs.writeFileSync(`${artifacts}/sent.json`,JSON.stringify(sent,null,2));
const browser=await chromium.launch({headless:true});
try {
 for (const [i,recipient] of sent.recipients.entries()) {
  const context=await browser.newContext();const page=await context.newPage();
  page.on('pageerror',error=>console.error('PAGE_ERROR',error.message));
  await page.goto(`${base}/sign/${recipient.token}`,{waitUntil:'networkidle'});
  await page.screenshot({path:`${artifacts}/signer-${i+1}-before.png`,fullPage:true});
  await page.getByTestId('signature-pad-dialog-button').click();
  await page.getByRole('tab',{name:'Type',exact:true}).click();
  await page.getByTestId('signature-pad-type-input').fill(`Chief Signer ${i+1}`);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  const canvas=page.locator('.konva-container').first();
  const bounds=await canvas.boundingBox();assert.ok(bounds);
  const signed=page.waitForResponse(r=>r.url().includes('/api/trpc/') && r.url().includes('envelope.field.sign'));
  await canvas.click({position:{x:bounds.width*0.30,y:bounds.height*(0.40+i*0.20)}});
  assert.equal((await signed).ok(),true);
  await page.getByRole('button',{name:'Complete',exact:true}).click();
  await page.getByRole('button',{name:'Sign',exact:true}).click();
  await page.waitForURL('**/complete');
  await page.screenshot({path:`${artifacts}/signer-${i+1}-complete.png`,fullPage:true});
  console.log(`PASS signer ${i+1} completed via accountless browser`);await context.close();
 }
 let completed;
 for(let i=0;i<40;i++){
  completed=await api(`envelope/${envelope.id}`);
  if(completed.status==='COMPLETED') break;
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 assert.equal(completed.status,'COMPLETED');
 fs.writeFileSync(`${artifacts}/completed.json`,JSON.stringify(completed,null,2));
 for(const [kind,route] of [['sealed',`envelope/item/${completed.envelopeItems[0].id}/download`],['certificate',`envelope/${envelope.id}/certificate/download`],['audit',`envelope/${envelope.id}/audit-log/download`]]){
  const response=await fetch(`${base}/api/v2/${route}`,{headers});assert.equal(response.status,200,kind);fs.writeFileSync(`${artifacts}/${kind}.pdf`,Buffer.from(await response.arrayBuffer()));
 }
 console.log(`PASS envelope ${envelope.id} completed; sealed PDF, certificate and audit downloaded`);
} finally {await browser.close();}
