import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

import { FleetDealroomTabs } from '../../apps/remix/app/chief/fleet-header';
import { parseTenantBrand, tenantLogoResponse } from '../../apps/remix/app/chief/tenant-brand.server';
import { tenantPageTitle } from '../../apps/remix/app/chief/tenant-brand';

const read = (p: string) => readFileSync(p, 'utf8');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const withLogo = (run: (file: string) => void) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gate3-'));
  try {
    const file = path.join(dir, 'logo.png');
    writeFileSync(file, png);
    run(file);
  } finally {
    rmSync(dir, { recursive: true });
  }
};

test('H2 Rooms uses new URL first and deprecated deployment key as fallback', () => {
  const keys = ['NEXT_PUBLIC_FLEET_SEND_URL', 'NEXT_PUBLIC_AMFORGE_SEND_URL'];
  const original = keys.map((key) => process.env[key]);
  const render = () =>
    renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(FleetDealroomTabs)));
  try {
    delete process.env[keys[0]];
    process.env[keys[1]] = 'https://legacy-send.example.test';
    assert.match(render(), /href="https:\/\/legacy-send.example.test"/);
    process.env[keys[0]] = 'https://send.example.test';
    assert.match(render(), /href="https:\/\/send.example.test"/);
    assert.doesNotMatch(render(), /legacy-send/);
    process.env[keys[0]] = '';
    assert.match(render(), /legacy-send.example.test/);
    delete process.env[keys[1]];
    assert.doesNotMatch(render(), />Rooms<\/a>/);
  } finally {
    keys.forEach((key, i) => (original[i] === undefined ? delete process.env[key] : (process.env[key] = original[i])));
  }
});

test('M1 Sign has its own mounted logo route, independent of Send configuration', () =>
  withLogo((file) => {
    const config = parseTenantBrand({ FLEET_TENANT_LOGO: file, FLEET_TENANT_CHROME: '#123456' });
    assert.match(config.brand.logoUrl, /^\/chief\/sign-tenant-logo\?v=/);
    assert.equal(tenantLogoResponse(new Request('https://recipient.test' + config.brand.logoUrl), config).status, 200);
    assert.match(read('apps/remix/server/router.ts'), /app.get\('\/chief\/sign-tenant-logo'/);
  }));

test('M2 white text requires 4.5 contrast and warns once', () => {
  const warnings: string[] = [];
  const warn = (s: string) => warnings.push(s);
  for (const colour of ['#fff', '#abcdef', '#777777']) {
    const { brand } = parseTenantBrand({ FLEET_TENANT_CHROME: colour }, warn);
    assert.equal(brand.chrome, '');
    assert.equal(brand.chromeHsl, '');
  }
  assert.equal(warnings.length, 1);
  assert.equal(parseTenantBrand({ FLEET_TENANT_CHROME: '#767676' }).brand.chrome, '#767676');
});

test('M4 logo without valid chrome falls back to name only', () =>
  withLogo((file) => {
    const warnings: string[] = [];
    const warn = (s: string) => warnings.push(s);
    for (const chrome of ['', '#fff', 'invalid']) {
      const config = parseTenantBrand(
        { FLEET_TENANT_NAME: 'Acme Test Co', FLEET_TENANT_LOGO: file, FLEET_TENANT_CHROME: chrome },
        warn,
      );
      assert.equal(config.brand.logoUrl, '');
      assert.equal(config.logo, undefined);
      assert.equal(config.brand.name, 'Acme Test Co');
    }
    assert.equal(warnings.filter((s) => s.includes('TENANT_LOGO')).length, 1);
  }));

test('L2 FIFO returns promptly and server configuration is parsed at module boot', () =>
  withLogo((file) => {
    rmSync(file);
    execFileSync('mkfifo', [file]);
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { parseTenantBrand } from './apps/remix/app/chief/tenant-brand.server.ts'; if (parseTenantBrand({ FLEET_TENANT_LOGO: process.argv[1], FLEET_TENANT_CHROME: '#123456' }).brand.logoUrl) process.exit(1);`,
        file,
      ],
      { timeout: 3000 },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr.toString());
    const source = read('apps/remix/app/chief/tenant-brand.server.ts');
    assert.match(source, /O_NONBLOCK/);
    assert.match(source, /getTenantBrand\(\);/);
  }));

const crc32 = (bytes: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

test('L3 IHDR dimensions and length are bounded, including CRC-valid oversized PNGs', () =>
  withLogo((file) => {
    for (const [width, height, length] of [
      [2001, 1, 13],
      [1, 601, 13],
      [30000, 30000, 13],
      [1, 1, 14],
    ]) {
      const chunk = Buffer.alloc(12 + length);
      chunk.writeUInt32BE(length);
      chunk.write('IHDR', 4);
      chunk.writeUInt32BE(width, 8);
      chunk.writeUInt32BE(height, 12);
      png.copy(chunk, 16, 24, 29);
      chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
      writeFileSync(file, Buffer.concat([png.subarray(0, 8), chunk, png.subarray(33)]));
      assert.equal(parseTenantBrand({ FLEET_TENANT_LOGO: file, FLEET_TENANT_CHROME: '#123456' }).brand.logoUrl, '');
    }
  }));

test('M3 L5 theme has polite status and a forced-colour visible SVG', () => {
  const source = read('apps/remix/app/chief/fleet-theme-toggle.tsx');
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /title=\{label\}/);
  assert.match(source, /<Icon aria-hidden="true"/);
  assert.match(read('apps/remix/app/chief/fleet-documenso.css'), /forced-colors: active/);
});

test('L6 localized title is built from parts and follows the signing product', () => {
  const matches = [
    {
      id: 'root',
      data: {
        publicEnv: {
          FLEET_TENANT_BRAND: JSON.stringify(parseTenantBrand({ FLEET_TENANT_NAME: 'Acme Test Co' }).brand),
        },
      },
    },
  ];
  assert.equal(tenantPageTitle('Signer le document', matches), 'Signer le document · Acme Test Co Sign');
  assert.match(read('apps/remix/app/routes/_recipient+/_layout.tsx'), /msg`Sign document`/);
});

test('L7 signing index remains byte-identical to approved upstream baseline', () => {
  const file = 'apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx';
  assert.equal(read(file), execFileSync('git', ['show', `d3b7f7c6:${file}`], { encoding: 'utf8' }));
  assert.match(
    read('apps/remix/app/chief/fleet-documenso.css'),
    /p\.mt-36:has\(> a\[href="\/articles\/signature-disclosure"\]\)/,
  );
});

test('N5 logo does not advertise an unimplemented ETag validator', () =>
  withLogo((file) => {
    const config = parseTenantBrand({ FLEET_TENANT_LOGO: file, FLEET_TENANT_CHROME: '#123456' });
    assert.equal(
      tenantLogoResponse(new Request('https://sign.test' + config.brand.logoUrl), config).headers.get('ETag'),
      null,
    );
  }));

test('N6 logo geometry CSS is identical across Send and Sign', () => {
  assert.ok(process.env.SEND_REPO);
  const block = (source: string) =>
    source.slice(source.indexOf("/* The inline image's bottom")).split('\n\n')[0].trim();
  const send = block(read(path.join(process.env.SEND_REPO!, 'frontend/public/dealroom/shell.css')));
  const sign = block(read('apps/remix/app/chief/fleet-documenso.css'));
  assert.ok(send.includes('--tenant-logo-height'));
  assert.equal(send, sign);
});

test('N7 signer button type override is scoped to branded signer pages', () => {
  assert.match(read('apps/remix/app/chief/fleet-documenso.css'), /\.documenso-branded \.inline-flex\.rounded-md/);
});

test('M5 scanners catch fixture names, normalized colours and domains in every served tree', async () => {
  const { mkdirSync } = await import('node:fs');
  const { scan } = await import('./tenant-scan');
  const dir = mkdtempSync(path.join(tmpdir(), 'scan-'));
  try {
    for (const relative of [
      'apps/remix/app/root.tsx',
      'apps/remix/app/chief/check.ts',
      'apps/remix/app/routes/_recipient+/check.tsx',
      'apps/remix/server/chief/check.json',
      'apps/remix/server/router.ts',
      'apps/remix/public/chief/logo.svg',
      'packages/fleet-ui/theme.css',
      'packages/fleet-ui/module.mjs',
      'packages/email/templates/mail.html',
    ]) {
      const file = path.join(dir, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      for (const value of ['aCmE tEsT cO', '#1A2B3C', '#ABC', '#aabbcc', 'TENANT.EXAMPLE.TEST']) {
        writeFileSync(file, value);
        assert.deepEqual(
          scan(dir, { FLEET_TEST_TENANT_COLOURS: '#1a2b3c,#aabbcc', FLEET_TEST_TENANT_DOMAINS: 'tenant.example.test' }),
          [relative],
          `${relative}: ${value}`,
        );
      }
      rmSync(file);
    }
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('H2 scanner allows exactly one deprecated constant and rejects tenant words anywhere else', async () => {
  const { mkdirSync } = await import('node:fs');
  const { scan } = await import('./tenant-scan');
  const dir = mkdtempSync(path.join(tmpdir(), 'legacy-scan-'));
  const relative = 'apps/remix/app/chief/fleet-send-url.ts';
  const file = path.join(dir, relative);
  const constant = "export const DEPRECATED_SEND_URL_KEY = 'NEXT_PUBLIC_AMFORGE_SEND_URL';";
  const fixtures = { FLEET_TEST_TENANT_NAMES: 'AmForge' };
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, constant);
    assert.deepEqual(scan(dir, fixtures), []);
    for (const source of [
      constant + '\n' + constant,
      constant + '\n// AmForge',
      constant.replace('export const', 'const'),
    ]) {
      writeFileSync(file, source);
      assert.deepEqual(scan(dir, fixtures), [relative]);
    }
    writeFileSync(file, '');
    writeFileSync(path.join(path.dirname(file), 'other.ts'), constant);
    assert.deepEqual(scan(dir, fixtures), ['apps/remix/app/chief/other.ts']);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
