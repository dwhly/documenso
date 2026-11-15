import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import SuperJSON from 'superjson';

import { staffFetch } from '../../apps/remix/server/chief/recipient-listener';

const staff = staffFetch(async request => Response.json({
  forwarded: true, body: request.method === 'POST' ? await request.text() : null,
}));
const procedures = JSON.parse(readFileSync('apps/remix/server/chief/procedures.json', 'utf8'));
const specimens = [
  ['envelope.attachment.find', {
    json: { envelopeId: 'E', t: 'recipient-token' },
    meta: { referentialEqualities: { t: ['token'] }, v: 1 },
  }],
  ['envelope.item.getManyByToken', {
    json: { envelopeId: 'E', access: { type: 'user' }, a: { type: 'recipient', token: 'recipient-token' } },
    meta: { referentialEqualities: { a: ['access'] }, v: 1 },
  }],
] as const;

const rpc = (name: string, member: unknown, method = 'GET', batch = false, index = 0) => {
  const names = batch ? ['team.get', 'team.get', 'team.get'].map((p, i) => i === index ? name : p) : [name];
  const data = batch ? Object.fromEntries(names.map((_, i) => [i, i === index ? member : { json: { teamId: 1 } }])) : member;
  const url = new URL('https://staff.test/api/trpc/' + names.join(','));
  if (batch) {
    url.searchParams.set('batch', '1');
  }
  if (method === 'GET') {
    url.searchParams.set('input', JSON.stringify(data));
  }
  return new Request(url, method === 'GET' ? {} : {
    method, body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' },
  });
};
const deny = async (request: Request, fetch = staff) => {
  const response = await fetch(request);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Open the link in your Fleet Dealroom email' });
};

for (const [name, member] of specimens) {
  for (const method of ['GET', 'POST']) {
    for (const position of ['single', 0, 1, 2] as const) {
      test(`r5 M1 ${name} referentialEqualities deny ${method} ${position}`, async () => {
        const restored = SuperJSON.deserialize<any>(member as any);
        if (name === 'envelope.attachment.find') {
          assert.equal(restored.token, 'recipient-token');
        } else {
          assert.deepEqual(restored.access, { type: 'recipient', token: 'recipient-token' });
        }
        await deny(rpc(name, member, method, position !== 'single', typeof position === 'number' ? position : 0));
      });
    }
  }
}

for (const method of ['GET', 'POST']) {
  test(`r5 M1 every procedure validates the SuperJSON shape on ${method}`, async () => {
    const invalid = [
      { json: {}, extra: true },
      { json: {}, meta: { referentialEqualities: {}, v: 1 } },
      { json: {}, meta: { futureFeature: {}, values: {}, v: 1 } },
      { json: {}, meta: { values: {}, v: 2 } },
      ...['Date', 'map', 'set', 'bigint', 'number', 'regexp', 'symbol', 'custom'].map(type => ({
        json: { value: null }, meta: { values: { value: [type] }, v: 1 },
      })),
      { json: {}, meta: { values: { value: ['undefined', {}] }, v: 1 } },
      { json: {}, meta: null },
      null, [],
    ];
    for (const { name } of [...procedures, { name: 'future.procedure' }]) {
      for (const member of invalid) {
        await deny(rpc(name, member, method));
        await deny(rpc(name, member, method, true, 1));
      }
    }
  });

  test(`r5 M1 undefined metadata and ordinary staff calls survive ${method}`, async () => {
    for (const name of ['team.get', ...specimens.map(([name]) => name)]) {
      const member = SuperJSON.serialize({ envelopeId: 'E', access: { type: 'user' }, optional: undefined,
        nested: { optional: undefined }, list: [undefined] });
      for (const batch of [false, true]) {
        const request = rpc(name, member, method, batch, 1);
        const body = method === 'POST' ? await request.clone().text() : null;
        assert.deepEqual(await (await staff(request)).json(), { forwarded: true, body });
      }
    }
    assert.equal((await staff(rpc('team.get', SuperJSON.serialize(undefined), method))).status, 200);
  });

  test(`r5 M1 malformed batch and raw recipient authority deny ${method}`, async () => {
    for (const input of [{ '0': { json: {} }, other: { json: {} } }, { '0': { json: {} } }, [], null]) {
      const request = rpc('team.get,team.get', input, method);
      const url = new URL(request.url);
      url.searchParams.set('batch', '1');
      await deny(new Request(url, request));
    }
    for (const [name] of specimens) {
      for (const value of [{ token: null }, { token: '' }, { access: { type: 'recipient' } }]) {
        await deny(rpc(name, { json: { envelopeId: 'E', ...value } }, method));
      }
    }
  });

  test(`r5 M1 undefined annotations cannot create a token field on ${method}`, async () => {
    for (const [name] of specimens) {
      const member = {
        json: { envelopeId: 'E', access: { type: 'user' } },
        meta: { values: { token: ['undefined'] }, v: 1 },
      };
      assert.equal('token' in member.json, false);
      assert.equal('token' in SuperJSON.deserialize<object>(member as any), true);
      for (const batch of [false, true]) {
        await deny(rpc(name, member, method, batch, 1));
      }
    }
  });
}

test('r5 M1 no-input staff GET and multipart uploads retain their native transport', async () => {
  assert.equal((await staff(new Request('https://staff.test/api/trpc/auth.getAuthMethods'))).status, 200);
  const uploads = ['envelope.create', 'envelope.use', 'envelope.item.createMany', 'envelope.item.replacePdf',
    'document.create', 'template.createTemplate', 'team.settings.updateBrandingLogo', 'organisation.settings.updateBrandingLogo'];
  for (const name of uploads) {
    const form = new FormData();
    form.set('payload', JSON.stringify({ title: 'Staff PDF' }));
    form.set('file', new Blob(['%PDF-fixture'], { type: 'application/pdf' }), 'staff.pdf');
    const request = new Request('https://staff.test/api/trpc/' + name, { method: 'POST', body: form });
    const body = await request.clone().text();
    assert.deepEqual(await (await staff(request)).json(), { forwarded: true, body });
  }
  for (const name of specimens.map(([name]) => name)) {
    const form = new FormData();
    form.set('token', 'recipient-token');
    await deny(new Request('https://staff.test/api/trpc/' + name, { method: 'POST', body: form }));
  }
});

test('r5 M1 each independent layer denies the reference payload with its peer removed', async () => {
  const sourcePath = resolve('apps/remix/server/chief/recipient-listener.ts');
  const original = readFileSync(sourcePath, 'utf8');
  const shape = '!allowedSuperJSON(member)';
  const decoded = '!staffInputAllowed(name, SuperJSON.deserialize(member))';
  assert.equal(original.split(shape).length, 2, 'one shape guard');
  assert.equal(original.split(decoded).length, 2, 'one decoded-input guard');
  for (const removed of [[shape], [decoded], [shape, decoded]]) {
    const temporary = sourcePath.replace('.ts', `.r5-${randomUUID()}.ts`);
    try {
      writeFileSync(temporary, removed.reduce((source, guard) => source.replace(guard, 'false'), original));
      const { staffFetch: mutant } = await import(pathToFileURL(temporary).href);
      const fetch = mutant(() => Response.json({ forwarded: true }));
      for (const [name, member] of specimens) {
        for (const method of ['GET', 'POST']) {
          for (const batch of [false, true]) {
            const request = rpc(name, member, method, batch, 1);
            if (removed.length === 1) {
              await deny(request, fetch);
            } else {
              assert.deepEqual(await (await fetch(request)).json(), { forwarded: true });
            }
          }
        }
      }
    } finally {
      unlinkSync(temporary);
    }
  }
});
