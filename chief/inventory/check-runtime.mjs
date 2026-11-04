import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = process.env.APP_ROOT || '/app';
const { default: app } = await import(`${root}/apps/remix/build/server/hono/server/router.js`);
const { appRouter } = await import(`${root}/apps/remix/build/server/hono/packages/trpc/server/router.js`);
const build = await import(`${root}/apps/remix/build/server/index.js`);
const manifests = process.env.MANIFEST_ROOT || `${root}/chief/inventory`;
const expected = name => JSON.parse(fs.readFileSync(`${manifests}/${name}.json`));
const actualProcedures=Object.entries(appRouter._def.procedures);
assert.deepEqual(actualProcedures.map(([name])=>name).sort(),expected('procedures').map(r=>r.name).sort());
for(const [name,p] of actualProcedures){
 const entry=expected('procedures').find(r=>r.name===name);
 assert.equal(entry.type,p._def.type,name);
 assert.ok(['deal','denied','recipient','plumbing','operator','human'].includes(entry.classification),name);
 if(p._def.type==='mutation') assert.equal(typeof entry.widensAccess,'boolean',name);
}
const routeKey=r=>`${r.method} ${r.path}`;
assert.deepEqual(app.routes.map(routeKey).sort(),expected('hono').map(routeKey).sort(),'Complete Hono table changed: review and classify every new entry');
const actualRemix=Object.values(build.routes).map(r=>({id:r.id,loader:!!r.module.loader,action:!!r.module.action}));
assert.deepEqual(actualRemix.sort((a,b)=>a.id.localeCompare(b.id)),expected('remix').map(({id,loader,action})=>({id,loader,action})).sort((a,b)=>a.id.localeCompare(b.id)),'Remix loader/action inventory drift');
console.log(JSON.stringify({passed:true,trpc:actualProcedures.length,hono:app.routes.length,remix:actualRemix.length,loaders:actualRemix.filter(r=>r.loader).length,actions:actualRemix.filter(r=>r.action).length}));
process.exit(0);
