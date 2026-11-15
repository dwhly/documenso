import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { staffFetch } from '../../apps/remix/server/chief/recipient-listener';

const staff = staffFetch((request) => Response.json(Object.fromEntries(request.headers)));

test('nit1 staff boundary matches mixed case and configured base path', async () => {
  const previous = process.env.NEXT_PUBLIC_BASE_PATH;
  try {
    for (const prefix of ['', '/preview']) {
      process.env.NEXT_PUBLIC_BASE_PATH = prefix;
      for (const path of ['/SIGN/token', '/Sign/token/COMPLETE.DATA', '/API/FILES/TOKEN/t/envelopeItem/i',
        '/API/V2/envelope/ATTACHMENT?token=t']) {
        assert.equal((await staff(new Request(`https://staff.test${prefix}${path}`))).status, 404, prefix+path);
      }
      const input = encodeURIComponent(JSON.stringify({ json: { envelopeId: 'e', access: { type: 'user' } } }));
      assert.equal((await staff(new Request(`https://staff.test${prefix}/api/trpc/envelope.item.getManyByToken?input=${input}`))).status, 200);
    }
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = previous;
  }
});

test('minor14 staff removes all caller IP authority and recipient marker', async () => {
  const response = await staff(new Request('https://staff.test/signin', { headers: {
    forwarded: 'for=1.2.3.4', 'x-real-ip': '1.2.3.4', 'x-chief-recipient-listener': '1',
    'x-forwarded-for': '1.2.3.4', 'x-fleet-proxy-key': 'caller-value',
  } }));
  const headers = await response.json();
  for (const name of ['forwarded', 'x-real-ip', 'x-chief-recipient-listener', 'x-forwarded-for', 'x-fleet-proxy-key']) {
    assert.equal(headers[name], undefined, name);
  }
});

test('minor14 main wires staffFetch only to 3000 and recipientFetch to 3001', () => {
  const main = readFileSync('apps/remix/server/main.js', 'utf8');
  assert.match(main, /import \{ recipientFetch, staffFetch \} from '\.\/hono\/server\/chief\/recipient-listener\.js';/);
  assert.match(main, /const port = parseInt\(process\.env\.PORT \|\| '3000', 10\);/);
  assert.match(main, /serve\(\{ fetch: staffFetch\(handler\.fetch\), port \}\)/);
  assert.match(main, /serve\(\{ fetch: recipientFetch\(handler\.fetch\), port: parseInt\(process\.env\.CHIEF_RECIPIENT_PORT \|\| '3001', 10\) \}\)/);
});
