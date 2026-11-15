import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const http = readFileSync('chief/inventory/http.test.mjs', 'utf8');
const assertion = http.split("/assets/not-an-asset")[1].split(';')[1];
for (const status of [301, 403, 500]) {
  test(`r4 nit3 live missing-asset assertion rejects ${status}`, () => {
    assert.throws(() => runInNewContext(assertion, { assert, r: new Response('', { status }) }), assert.AssertionError);
  });
}
test('r4 nit3 live missing-asset assertion accepts exactly 404', () => {
  runInNewContext(assertion, { assert, r: new Response('', { status: 404 }) });
});

test('r4 nit2 ownership harness labels staff denial separately and checks own token on each listener', () => {
  const source = readFileSync('packages/app-tests/e2e/api/chief/recipient-artifact-access.spec.ts', 'utf8');
  const ownership = source.split("test('[11]")[1].split("test('[1]")[0];
  assert.match(ownership, /const boundary = origin === STAFF \? 'staff blanket denial' : 'recipient ownership'/);
  assert.match(ownership, /fetchAll\(request, origin, tokenPaths\(theirs.otherToken, theirs\)\)/);
  assert.match(ownership, /origin === STAFF \? '404' : 'SEALED'/);
});
