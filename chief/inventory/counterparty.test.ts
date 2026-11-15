import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as listeners from '../../apps/remix/server/chief/recipient-listener';

const KEY = 'fixture-private-proxy-key';
const ok = (request: Request) => Response.json(Object.fromEntries(request.headers));
const req = (path: string, init: RequestInit = {}) => new Request(`http://sign:3000${path}`, init);
const staff = (request: Request) => listeners.staffFetch(ok)(request);
const tokenOnly = ['envelope.recipient.report', 'envelope.field.sign', 'envelope.signingStatus',
  'document.getDocumentByToken', 'field.signFieldWithToken', 'field.removeSignedFieldWithToken',
  'recipient.completeDocumentWithToken', 'recipient.rejectDocumentWithToken'];
const dual = ['envelope.item.getManyByToken', 'envelope.attachment.find'];

for (const configured of ['', '  ', undefined]) {
  test(`3001 unavailable without configured key: ${JSON.stringify(configured)}`, async () => {
    const fetch = listeners.recipientFetch(ok, () => configured);
    assert.equal((await fetch(req('/sign/token', { headers: { 'x-fleet-proxy-key': KEY } }))).status, 503);
    assert.equal((await fetch(req('/api/auth/session-json'))).status, 503);
  });
}
test('3001 rejects caller key before routes, strips the valid key and retains browser metadata', async () => {
  const fetch = listeners.recipientFetch(ok, () => KEY);
  for (const key of ['', 'different', KEY + 'extra']) {
    assert.equal((await fetch(req('/sign/token', { headers: { 'x-fleet-proxy-key': key } }))).status, 403);
  }
  const response = await fetch(req('/sign/token', { headers: { 'x-fleet-proxy-key': KEY,
    'x-forwarded-for': '100.64.0.5', 'user-agent': 'Browser fixture' } }));
  assert.equal(response.status, 200);
  const headers = await response.json();
  assert.equal(headers['x-fleet-proxy-key'], undefined);
  assert.equal(headers['x-forwarded-for'], '100.64.0.5');
  assert.equal(headers['user-agent'], 'Browser fixture');
});
test('3001 runtime reads only the configured key file and fails closed if absent or blank', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-key-test-'));
  const saved = process.env.FLEET_PROXY_KEY_FILE;
  try {
    process.env.FLEET_PROXY_KEY_FILE = join(dir, 'key');
    const fetch = listeners.recipientFetch(ok);
    assert.equal((await fetch(req('/sign/token'))).status, 503);
    writeFileSync(process.env.FLEET_PROXY_KEY_FILE, '\n');
    assert.equal((await fetch(req('/sign/token'))).status, 503);
    writeFileSync(process.env.FLEET_PROXY_KEY_FILE, KEY);
    assert.equal((await fetch(req('/sign/token', { headers: { 'x-fleet-proxy-key': KEY } }))).status, 200);
  } finally {
    if (saved === undefined) delete process.env.FLEET_PROXY_KEY_FILE;
    else process.env.FLEET_PROXY_KEY_FILE = saved;
    rmSync(dir, { recursive: true });
  }
});
for (const suffix of ['', '/complete', '/expired', '/rejected', '/waiting']) {
  test(`3000 denies signing path ${suffix} including data`, async () => {
    for (const data of ['', '.data']) {
      assert.equal((await staff(req(`/sign/token${suffix}${data}`, { headers: { 'x-fleet-proxy-key': KEY } }))).status, 404);
    }
  });
}
test('3000 denies all three token file forms', async () => {
  for (const path of ['/api/files/token/t/envelopeItem/i', '/api/files/token/t/envelopeItem/i/download',
    '/api/files/token/t/envelopeItem/i/download/original', '/api/files/token/t/envelope/e/envelopeItem/i/dataId/d/original/item.pdf']) {
    assert.equal((await staff(req(path))).status, 404);
  }
});
for (const name of tokenOnly) {
  test(`3000 denies token-only procedure in mixed batch: ${name}`, async () => {
    for (const names of [name, `${name},envelope.find`, `envelope.find,${name}`]) {
      assert.equal((await staff(req(`/api/trpc/${names}?batch=1&input={}`, { method: 'POST' }))).status, 404);
    }
  });
}
for (const name of dual) {
  test(`3000 parses every dual-mode batch index: ${name}`, async () => {
    for (const value of [{ token: 't' }, { token: null }, { access: { type: 'recipient', token: 't' } }]) {
      for (const index of [0, 1]) {
        const names = index ? `envelope.find,${name}` : `${name},envelope.find`;
        const input = JSON.stringify({ [index]: { json: value }, [1 - index]: { json: {} } });
        assert.equal((await staff(req(`/api/trpc/${names}?batch=1&input=${encodeURIComponent(input)}`))).status, 404);
      }
      assert.equal((await staff(req(`/api/trpc/${name}`, { method: 'POST', body: JSON.stringify({ json: value }) }))).status, 404);
    }
    for (const input of ['', '{', '{}', 'null', JSON.stringify({ '0': { json: null } })]) {
      assert.equal((await staff(req(`/api/trpc/${name}?batch=1&input=${encodeURIComponent(input)}`))).status, 404);
    }
  });
}
test('3000 preserves staff download, bulk download and attachment inputs, strips forwarding and key', async () => {
  for (const [name, value] of [[dual[0], { envelopeId: 'e', access: { type: 'user' } }],
    [dual[1], { envelopeId: 'e' }]] as const) {
    const input = encodeURIComponent(JSON.stringify({ '0': { json: value }, '1': { json: value } }));
    const response = await staff(req(`/api/trpc/${name},${name}?batch=1&input=${input}`, {
      headers: { 'x-forwarded-for': '100.64.0.5', 'x-real-ip': '100.64.0.6', 'x-fleet-proxy-key': KEY } }));
    assert.equal(response.status, 200);
    const headers = await response.json();
    assert.equal(headers['x-forwarded-for'], undefined);
    assert.equal(headers['x-real-ip'], undefined);
    assert.equal(headers['x-fleet-proxy-key'], undefined);
  }
});
test('3000 checks both attachment aliases and unparseable inputs', async () => {
  for (const alias of ['v2', 'v2-beta']) {
    assert.equal((await staff(req(`/api/${alias}/envelope/attachment?token=t&envelopeId=e`))).status, 404);
    assert.equal((await staff(req(`/api/${alias}/envelope/attachment?envelopeId=e`))).status, 200);
    assert.equal((await staff(req(`/api/${alias}/envelope/attachment`, { method: 'POST', body: '{' }))).status, 404);
  }
});
test('recipient inventory drift requires explicit scope and staff-mode classification', () => {
  const inventory = JSON.parse(readFileSync('apps/remix/server/chief/procedures.json', 'utf8'));
  assert.deepEqual(inventory.filter((p: any) => p.classification === 'recipient').map((p: any) => p.name).sort(),
    [...tokenOnly, ...dual].sort());
  assert.deepEqual(listeners.TOKEN_ONLY_PROCEDURES, tokenOnly);
  assert.deepEqual(listeners.DUAL_MODE_PROCEDURES, dual);
});

test('staff origin uses configured host and scheme while caller IP authority is discarded', async () => {
  const before = process.env.NEXT_PUBLIC_WEBAPP_URL;
  process.env.NEXT_PUBLIC_WEBAPP_URL = 'https://staff.test:9444';
  try {
    const response = await staff(req('/api/theme', { method: 'POST', headers: {
      origin: 'https://staff.test:9444', 'x-forwarded-host': 'caller.test',
      'x-forwarded-proto': 'http', 'x-forwarded-for': '100.64.0.8',
    } }));
    const headers = await response.json();
    assert.equal(headers['x-forwarded-host'], 'staff.test:9444');
    assert.equal(headers['x-forwarded-proto'], 'https');
    assert.equal(headers.origin, 'https://staff.test:9444');
    assert.equal(headers['x-forwarded-for'], undefined);
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_WEBAPP_URL;
    else process.env.NEXT_PUBLIC_WEBAPP_URL = before;
  }
});
