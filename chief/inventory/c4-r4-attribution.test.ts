import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { createTransport } from 'nodemailer';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

const modulePath = '../../packages/fleet-ui/fleet-attribution';
const tenant = {
  FLEET_TENANT_NAME: 'Acme <Test> & "Co"',
  FLEET_ABOUT_URL: 'https://fleet.example.test/about?a=1&b=2',
  FLEET_SOURCE_URL: 'https://source.example.test/tree/0123456789',
};
const invalid = [
  'javascript:alert(1)',
  'http://example.test',
  '//example.test',
  'https://',
  'https://user:pass@example.test',
  'https://example.test/\npath',
  'https://example.test/"<tag>',
  'https://example.test\\@other.test',
  'https://example.test:bad',
  'https://example.test:99999',
  'https://exa mple.test',
  'https://[broken',
];

test('all three slugs match Send byte for byte for neutral, tenant, Unicode, partial and unsafe settings', async () => {
  const { renderAttribution } = await import(modulePath);
  const cases = [
    {},
    tenant,
    { FLEET_TENANT_NAME: 'Équipe 🛶', FLEET_SOURCE_URL: tenant.FLEET_SOURCE_URL },
    { FLEET_ABOUT_URL: tenant.FLEET_ABOUT_URL },
    { FLEET_TENANT_NAME: ' \n ' },
    ...invalid.map((url) => ({ FLEET_ABOUT_URL: url, FLEET_SOURCE_URL: url })),
  ];
  const slugs = ['page', 'email-html', 'email-text'];
  const send = process.env.SEND_REPO || path.resolve('../send-style');
  const result = spawnSync(
    'python3',
    [
      '-c',
      'import json,sys; from dealroom_sign.fleet_attribution import render_attribution; cases=json.load(sys.stdin); print(json.dumps([[render_attribution(s,c) for s in ["page","email-html","email-text"]] for c in cases]))',
    ],
    { cwd: path.join(send, 'backend'), input: JSON.stringify(cases), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    cases.map((settings) => slugs.map((slug) => renderAttribution(slug, settings))),
    JSON.parse(result.stdout),
  );
  assert.equal(renderAttribution('page', {}), 'Open-source software built on the Fleet.');
  for (const url of invalid) {
    assert.equal(
      renderAttribution('page', { FLEET_ABOUT_URL: url, FLEET_SOURCE_URL: url }),
      'Open-source software built on the Fleet.',
    );
  }
  assert.match(renderAttribution('page', tenant), /Acme &lt;Test&gt; &amp; &quot;Co&quot;/);
});

test('recipient footer uses server settings regardless of the legacy powered-by flag', async () => {
  const { createChiefPublicEnv } = await import('../../apps/remix/app/chief/public-env.server');
  const { tenantFromEnvironment } = await import('../../apps/remix/app/chief/tenant-brand');
  const { TenantBrandProvider } = await import('../../apps/remix/app/chief/tenant-identity');
  const { FleetVisitorFooter } = await import('../../apps/remix/app/chief/fleet-header');
  const { renderAttribution } = await import(modulePath);
  const original = { ...process.env };
  try {
    Object.assign(process.env, tenant, { FLEET_TENANT_POWERED_BY: '' });
    const env = createChiefPublicEnv(new Request('https://recipient.test/sign/token'));
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          TenantBrandProvider,
          { value: tenantFromEnvironment(env) },
          React.createElement(FleetVisitorFooter),
        ),
      ),
    );
    assert.ok(html.includes(renderAttribution('page', tenant)));
    assert.doesNotMatch(html, /Powered by Fleet/);
  } finally {
    process.env = original;
  }
});

test('both transports attach canonical MIME parts even to plain-only mail', async () => {
  const { withFleetAttribution } = await import('../../packages/fleet-ui/fleet-mail');
  const { renderAttribution } = await import(modulePath);
  const original = { ...process.env };
  try {
    Object.assign(process.env, tenant);
    const transport = withFleetAttribution(createTransport({ streamTransport: true, buffer: true }));
    for (const html of [undefined, '<html><body><p>Signed copy</p></body></html>']) {
      const result = await transport.sendMail({
        from: 'sender@example.test',
        to: 'reader@example.test',
        subject: 'Signed copy',
        text: 'Signed copy',
        html,
        textEncoding: 'base64',
      });
      const mime = result.message.toString();
      const bodies = [
        ...mime.matchAll(
          /Content-Type: text\/(plain|html);[^]*?Content-Transfer-Encoding: base64\r\n\r\n([^]*?)(?=\r\n--)/g,
        ),
      ].map((m) => Buffer.from(m[2], 'base64').toString());
      assert.equal(bodies.length, 2, mime);
      assert.ok(bodies[0].endsWith(renderAttribution('email-text', tenant)));
      assert.ok(bodies[1].includes(renderAttribution('email-html', tenant)));
      assert.ok(bodies[1].indexOf('Open-source') < bodies[1].indexOf('</body>') || !html);
    }
  } finally {
    process.env = original;
  }
});

test('missing or invalid AGPL source emits one startup warning per process', () => {
  for (const source of ['', 'javascript:alert(1)', tenant.FLEET_SOURCE_URL]) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { getTenantBrand } from './apps/remix/app/chief/tenant-brand.server.ts'; getTenantBrand(); getTenantBrand();`,
      ],
      { env: { ...process.env, FLEET_SOURCE_URL: source }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal((result.stderr.match(/FLEET_SOURCE_URL/g) || []).length, source === tenant.FLEET_SOURCE_URL ? 0 : 1);
    if (source !== tenant.FLEET_SOURCE_URL) assert.match(result.stderr, /AGPL/);
  }
});

test('recipient layout retains attribution for authenticated completion visitors too', () => {
  const layout = readFileSync('apps/remix/app/routes/_recipient+/_layout.tsx', 'utf8');
  assert.match(layout, /<FleetVisitorFooter\s*\/>/);
  assert.doesNotMatch(layout, /\{[^{}]*&&\s*<FleetVisitorFooter/);
});

test('system and organisation transports deliver both footers over SMTP', async () => {
  const messages: string[] = [];
  const server = createServer((socket) => {
    let input = '';
    let body: string[] | undefined;
    socket.setEncoding('utf8');
    socket.write('220 localhost test sink\r\n');
    socket.on('data', (chunk) => {
      input += chunk;
      let end: number;
      while ((end = input.indexOf('\r\n')) >= 0) {
        const line = input.slice(0, end);
        input = input.slice(end + 2);
        if (body) {
          if (line === '.') {
            messages.push(body.join('\r\n'));
            body = undefined;
            socket.write('250 accepted\r\n');
          } else {
            body.push(line.replace(/^\.\./, '.'));
          }
        } else if (line === 'DATA') {
          body = [];
          socket.write('354 send content\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 bye\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const original = { ...process.env };
  try {
    Object.assign(process.env, tenant, {
      NEXT_PRIVATE_SMTP_TRANSPORT: 'smtp-auth',
      NEXT_PRIVATE_SMTP_HOST: '127.0.0.1',
      NEXT_PRIVATE_SMTP_PORT: String(port),
      NEXT_PRIVATE_SMTP_SECURE: 'false',
      NEXT_PRIVATE_SMTP_USERNAME: '',
      NEXT_PRIVATE_SMTP_PASSWORD: '',
      NEXT_PRIVATE_SMTP_SERVICE: '',
      NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS: 'true',
    });
    const { mailer } = await import('../../packages/email/mailer');
    const { buildTransport } = await import('../../packages/email/transports/build-transport');
    const { renderAttribution } = await import(modulePath);
    const organisation = buildTransport({ type: 'SMTP_AUTH', host: '127.0.0.1', port, secure: false, ignoreTLS: true });
    for (const transport of [mailer, organisation]) {
      await transport.sendMail({
        from: 'sender@example.test',
        to: 'reader@example.test',
        subject: 'Invitation',
        text: 'Review and sign',
        textEncoding: 'base64',
      });
    }
    assert.equal(messages.length, 2);
    for (const mime of messages) {
      const bodies = [
        ...mime.matchAll(
          /Content-Type: text\/(plain|html);[^]*?Content-Transfer-Encoding: base64\r\n\r\n([^]*?)(?=\r\n--)/g,
        ),
      ].map((m) => Buffer.from(m[2], 'base64').toString());
      assert.equal(bodies.length, 2, mime);
      assert.ok(bodies[0].endsWith(renderAttribution('email-text', tenant)));
      assert.ok(bodies[1].includes(renderAttribution('email-html', tenant)));
    }
  } finally {
    process.env = original;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
