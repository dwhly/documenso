// C1b packaging guard: apps/remix/server/main.js imports names from the rollup bundle (input server/router.ts,
// preserveModules). Rollup tree-shakes exports that nothing in the bundle uses, so every name main.js imports from
// ./hono/server/chief/* must be re-exported by server/router.ts. Without this, the Sign container crash-loops at
// boot ("does not provide an export named 'staffFetch'"), which unit tests importing the TS source can't see.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const remix = new URL('../../apps/remix/server/', import.meta.url);
const main = readFileSync(new URL('main.js', remix), 'utf8');
const router = readFileSync(new URL('router.ts', remix), 'utf8');

test('every name main.js imports from the bundled chief modules is re-exported by router.ts', () => {
  const imports = [...main.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/hono\/server\/chief\/([\w-]+)\.js'/g)];
  assert.ok(imports.length > 0, 'expected main.js to import from the bundled chief modules');
  for (const [, names, mod] of imports) {
    for (const name of names.split(',').map((n: string) => n.trim()).filter(Boolean)) {
      const reexport = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'\\./chief/${mod}'`);
      assert.match(router, reexport, `router.ts must re-export ${name} from ./chief/${mod} or rollup drops it`);
    }
  }
});
