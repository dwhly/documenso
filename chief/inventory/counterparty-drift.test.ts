import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const contract = read('chief/inventory/counterparty-contract.json');

test('recipient procedures, input modes, token file routes and aliases match the reviewed Send boundary', {
  skip: process.env.SEND_REPO === undefined ? 'SEND_REPO is unset; provide the Send checkout to run the cross-repository drift check' : false,
}, () => {
  const sign = read('apps/remix/server/chief/procedures.json').filter((p: any) => p.classification === 'recipient');
  const files = read('apps/remix/server/chief/hono.json').filter((p: any) => p.classification === 'recipient');
  assert.deepEqual(sign, contract.procedures);
  assert.deepEqual(files, contract.files);
  const sendRoot = process.env.SEND_REPO!;
  assert.deepEqual(read(resolve(sendRoot, 'backend/dealroom_sign/recipient_contract.json')), contract);
  for (const [path, expected] of Object.entries(contract.source_sha256)) {
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    assert.equal(actual, expected, `Reclassify recipient schema/router drift: ${path}`);
  }
  const proxy = readFileSync(resolve(sendRoot, 'backend/dealroom_sign/recipient_proxy.py'), 'utf8');
  const block = proxy.split('RPC = {')[1].split('\n}')[0];
  const allowed = [...block.matchAll(/^    '([^']+)':/gm)].map((m) => m[1]);
  assert.deepEqual([...allowed, ...contract.send_denied].sort(), sign.map((p: any) => p.name).sort());
});
