import assert from 'node:assert/strict';
const root='/app/apps/remix/build/server/hono';
const {procedureInventory}=await import(`${root}/server/chief/policy.js`);
// Introduce an actual native public procedure into the adapter inventory to model future misclassification.
procedureInventory.find(p=>p.name==='document.share').classification='deal';
await assert.rejects(import(`${root}/server/chief/deal-api.js`), /Deal adapter requires native staff authentication: document.share/);
console.log('PASS r1 finding 4: adapter rejects a native unauthenticated procedure at construction');
process.exit(0);
