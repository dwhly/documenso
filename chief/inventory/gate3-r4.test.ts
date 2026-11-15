import assert from 'node:assert/strict';
import test from 'node:test';
import { staffFetch, TOKEN_ONLY_PROCEDURES, DUAL_MODE_PROCEDURES } from '../../apps/remix/server/chief/recipient-listener';
import { matchRoutes } from 'react-router';
import { Hono } from 'hono';

const staff = staffFetch(() => new Response('forwarded'));
const recipientPaths = [
  ...['', '/complete', '/expired', '/rejected', '/waiting'].map(end => '/sign/t' + end),
  '/api/files/token/t/envelopeItem/i', '/api/files/token/t/envelope/e/envelopeItem/i/dataId/d/original/item.pdf',
  ...TOKEN_ONLY_PROCEDURES.map(name => '/api/trpc/' + name),
  ...DUAL_MODE_PROCEDURES.map(name => '/api/trpc/' + name),
  '/api/v2/envelope/attachment', '/api/v2-beta/envelope/attachment',
];
for (const suffix of ['/', '//', '/.data', '//.data', '/.DATA', '/.data/', '/.data//', '/.DATA/', '/%2Edata', '%2F.data', ';v=1/.data']) {
  test(`r4 M1 all token surfaces deny ${suffix}`, async () => {
    const previous = process.env.NEXT_PUBLIC_BASE_PATH;
    try {
      for (const prefix of ['', '/preview']) {
        process.env.NEXT_PUBLIC_BASE_PATH = prefix;
        for (const path of recipientPaths) {
          const input = encodeURIComponent(JSON.stringify({ json: { token: 't', envelopeId: 'e', access: { type: 'recipient', token: 't' } } }));
          for (const variant of [path, path.toUpperCase()]) {
            assert.equal((await staff(new Request(`https://staff.test${prefix}${variant}${suffix}?token=t&input=${input}`))).status, 404, prefix+variant+suffix);
          }
        }
      }
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
      else process.env.NEXT_PUBLIC_BASE_PATH = previous;
    }
  });
}
test('r4 M1 encoded separators, repeated encodings and parameters fail closed', async () => {
  for (const path of ['/s%69gn/t/.data', '/sign%2Ft/.data', '/sign%252Ft/.data', '//sign/t/.data',
    '/sign;t=1/t/.data', '/sign/t/complete;v=1/.data', '/sign/t/%2Edata', '/sign/t/%252Edata', '/sign/t/_.data']) {
    assert.equal((await staff(new Request('https://staff.test'+path))).status, 404, path);
  }
  assert.equal((await staff(new Request('https://staff.test/signin'))).status, 200);
});
test('r4 M1 installed routers retain separators and decode parameters as inspected', async () => {
  const routes = [{ path: '/sign/:token' }];
  assert.equal(matchRoutes(routes, '/s%69gn/t%2Fu/')?.[0].params.token, 't/u');
  assert.equal(matchRoutes(routes, '/SIGN/t;v=1//')?.[0].params.token, 't;v=1');
  const hono = new Hono();
  hono.get('/sign/:token', c => c.json({ path: c.req.path, token: c.req.param('token') }));
  assert.deepEqual(await (await hono.request('/s%69gn/t%2Fu')).json(), { path: '/sign/t%2Fu', token: 't/u' });
  assert.deepEqual(await (await hono.request('/sign/t;v=1')).json(), { path: '/sign/t;v=1', token: 't;v=1' });
});
