import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { parseTenantBrand, tenantLogoResponse } from '../../apps/remix/app/chief/tenant-brand.server';
import { DEFAULT_TENANT, tenantHtmlAttributes } from '../../apps/remix/app/chief/tenant-brand';
import { scan } from './tenant-scan';
import { TenantIdentity } from '../../apps/remix/app/chief/tenant-identity';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const withLogo = async (run: (file: string) => unknown) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tenant-'));
  const file = path.join(dir, 'logo.png');
  writeFileSync(file, png);
  try {
    await run(file);
  } finally {
    rmSync(dir, { recursive: true });
  }
};

test('defaults retain the Fleet identity and add no chrome attributes', () => {
  const { brand } = parseTenantBrand({});
  assert.deepEqual(brand, DEFAULT_TENANT);
  assert.deepEqual(tenantHtmlAttributes(brand), {});
  const html = renderToStaticMarkup(React.createElement(TenantIdentity, { brand }));
  assert.match(html, /fds-lockup__mark/);
  assert.match(html, />Fleet<\/span>/);
  assert.doesNotMatch(html, /<img/);
});

test('configured logo replaces mark and name, server exposes URL only, fds uses HSL slots', async () => {
  await withLogo((file) => {
    const { brand, logo } = parseTenantBrand({
      FLEET_TENANT_NAME: 'Acme Test Co',
      FLEET_TENANT_LOGO: file,
      FLEET_TENANT_LOGO_BASELINE: '0.75',
      FLEET_TENANT_CHROME: '#123456',
      FLEET_TENANT_CHROME_RULE: '#abc',
      FLEET_TENANT_SURFACE: 'warm',
      FLEET_TENANT_POWERED_BY: '1',
    });
    assert.equal(brand.name, 'Acme Test Co');
    assert.equal(brand.logoBaseline, 0.75);
    assert.match(brand.logoUrl, /^\/chief\/sign-tenant-logo\?v=[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(brand).includes(file));
    assert.deepEqual(logo?.bytes, png);
    const attributes = tenantHtmlAttributes(brand);
    assert.equal(attributes['data-chrome'], 'dark');
    assert.equal(attributes['data-chrome-rule'], '');
    assert.equal(attributes['data-surface'], 'warm');
    assert.equal(attributes.style?.['--chrome-base'], '210 65.3846% 20.3922%');
    const html = renderToStaticMarkup(React.createElement(TenantIdentity, { brand }));
    assert.match(html, /alt="Acme Test Co"/);
    assert.match(html, /fleet-tenant-logo/);
    assert.doesNotMatch(html, /fds-lockup__mark|fds-lockup__family/);
  });
});

test('name-only branding escapes HTML and keeps the Fleet mark', () => {
  const { brand } = parseTenantBrand({ FLEET_TENANT_NAME: 'Acme <Test> Co' });
  const html = renderToStaticMarkup(React.createElement(TenantIdentity, { brand }));
  assert.match(html, /Acme &lt;Test&gt; Co/);
  assert.match(html, /fds-lockup__mark/);
});

test('invalid fields independently fall back and each field logs once per parser logger', () => {
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(message);
  const env = {
    FLEET_TENANT_NAME: '\r\nInjected',
    FLEET_TENANT_LOGO: '/missing.png',
    FLEET_TENANT_LOGO_BASELINE: 'NaN',
    FLEET_TENANT_CHROME: '#123456;display:none',
    FLEET_TENANT_CHROME_RULE: '#12345678',
    FLEET_TENANT_SURFACE: 'cold',
    FLEET_TENANT_POWERED_BY: 'true',
  };
  assert.deepEqual(parseTenantBrand(env, warn).brand, DEFAULT_TENANT);
  parseTenantBrand(env, warn);
  assert.equal(warnings.length, 7);
  for (const baseline of ['-0.1', '1.01', '1px', 'Infinity']) {
    assert.equal(parseTenantBrand({ FLEET_TENANT_LOGO_BASELINE: baseline }, warn).brand.logoBaseline, 0.8);
  }
  for (const baseline of ['0', '1']) {
    assert.equal(parseTenantBrand({ FLEET_TENANT_LOGO_BASELINE: baseline }).brand.logoBaseline, Number(baseline));
  }
});

test('file validation rejects wrong formats, oversized files and SVG, falling back to the tenant name', async () => {
  await withLogo((file) => {
    for (const bytes of [
      Buffer.from('not an image'),
      Buffer.alloc(204800),
      Buffer.from('<svg><script>alert(1)</script></svg>'),
    ]) {
      writeFileSync(file, bytes);
      assert.equal(parseTenantBrand({ FLEET_TENANT_LOGO: file, FLEET_TENANT_CHROME: '#123456' }).brand.logoUrl, '');
    }
    const svg = file.replace('.png', '.svg');
    const warnings: string[] = [];
    const warn = (message: string) => warnings.push(message);
    for (const logoPath of [svg, file]) {
      writeFileSync(
        logoPath,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0h20v20z"/></svg>',
      );
      for (let attempt = 0; attempt < 3; attempt++) {
        const tenant = parseTenantBrand(
          { FLEET_TENANT_NAME: 'Acme Test Co', FLEET_TENANT_LOGO: logoPath, FLEET_TENANT_CHROME: '#123456' },
          warn,
        );
        assert.equal(tenant.brand.logoUrl, '');
        assert.equal(tenant.logo, undefined);
        assert.equal(tenant.brand.name, 'Acme Test Co');
        const html = renderToStaticMarkup(React.createElement(TenantIdentity, { brand: tenant.brand }));
        assert.match(html, />Acme Test Co<\/span>/);
        assert.doesNotMatch(html, /<img/);
        assert.equal(tenantLogoResponse(new Request('https://sign.test/chief/sign-tenant-logo'), tenant).status, 404);
      }
    }
    assert.deepEqual(warnings, ['Invalid FLEET_TENANT_LOGO; using default']);
    writeFileSync(svg, '<svg><image href="https://example.test/logo.png"/></svg>');
    assert.equal(parseTenantBrand({ FLEET_TENANT_LOGO: svg, FLEET_TENANT_CHROME: '#123456' }).brand.logoUrl, '');
  });
});

test('same-origin asset is hash checked, immutable, typed and unavailable when unset', async () => {
  await withLogo(async (file) => {
    const tenant = parseTenantBrand({ FLEET_TENANT_LOGO: file, FLEET_TENANT_CHROME: '#123456' });
    const response = tenantLogoResponse(new Request(`https://sign.test${tenant.brand.logoUrl}`), tenant);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'image/png');
    assert.match(response.headers.get('Cache-Control') ?? '', /immutable/);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.equal(tenantLogoResponse(new Request('https://sign.test/chief/sign-tenant-logo?v=old'), tenant).status, 404);
    assert.equal(
      tenantLogoResponse(new Request('https://sign.test/chief/sign-tenant-logo'), parseTenantBrand({})).status,
      404,
    );
  });
});

test('wiring uses the existing public env loader, recipient-only attributes and fixed asset handler', () => {
  const read = (p: string) => readFileSync(new URL(`../../apps/remix/${p}`, import.meta.url), 'utf8');
  assert.match(read('app/chief/public-env.server.ts'), /getTenantBrand/);
  assert.match(read('app/root.tsx'), /tenantHtmlAttributes/);
  assert.match(read('app/root.tsx'), /isRecipientRoute/);
  assert.match(read('app/root.tsx'), /TenantBrandProvider/);
  assert.match(read('server/router.ts'), /tenantLogoResponse/);
  const header = read('app/chief/fleet-header.tsx');
  assert.match(header, /TenantIdentity/);
  assert.match(header, /brand.name/);
  assert.match(header, /renderAttribution\('page'/);
  assert.doesNotMatch(header, /Powered by Fleet/);
  const css = read('app/chief/fleet-documenso.css');
  assert.match(css, /--tenant-logo-height: 20px/);
  assert.match(css, /--tenant-logo-height: 17px/);
  assert.match(css, /align-items: baseline/);
});

test('configured tenant names do not ship in the product tree', () => {
  assert.deepEqual(scan(path.resolve(import.meta.dirname, '../..')), []);
});

test('malformed XML, namespace-qualified external links, and corrupt PNG chunks fall back', async () => {
  await withLogo((file) => {
    writeFileSync(file, Buffer.concat([png.subarray(0, 45), Buffer.from('changed'), png.subarray(52)]));
    assert.equal(parseTenantBrand({ FLEET_TENANT_LOGO: file, FLEET_TENANT_CHROME: '#123456' }).brand.logoUrl, '');
    const svg = file.replace('.png', '.svg');
    for (const content of [
      '<svg xmlns="http://www.w3.org/2000/svg"><path></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image xmlns:x="http://www.w3.org/1999/xlink" x:href="https://example.test/image.png"/></svg>',
    ]) {
      writeFileSync(svg, content);
      assert.equal(parseTenantBrand({ FLEET_TENANT_LOGO: svg, FLEET_TENANT_CHROME: '#123456' }).brand.logoUrl, '');
    }
  });
});

test('full lockup renders both product labels with default, name-only and logo settings', async () => {
  const { MemoryRouter } = await import('react-router');
  const { FleetLockup, FleetVisitorFooter } = await import('../../apps/remix/app/chief/fleet-header');
  const { TenantBrandProvider } = await import('../../apps/remix/app/chief/tenant-identity');
  for (const product of ['Sign', 'Dealroom']) {
    for (const name of ['Fleet', 'Acme Test Co']) {
      const brand = { ...DEFAULT_TENANT, name, poweredBy: name !== 'Fleet' };
      const render = (logoUrl: string) =>
        renderToStaticMarkup(
          React.createElement(
            MemoryRouter,
            null,
            React.createElement(
              TenantBrandProvider,
              { value: { ...brand, logoUrl } },
              React.createElement(FleetLockup, { product }),
              React.createElement(FleetVisitorFooter),
            ),
          ),
        );
      const html = render('');
      assert.ok(html.includes(`aria-label="${name} ${product}"`));
      assert.ok(html.includes(`class="fds-lockup__product">${product}</span>`));
      assert.ok(html.includes(`${name} Dealroom · Every copy`));
      assert.ok(html.includes('Open-source software built on the Fleet.'));
      assert.ok(!html.includes('Powered by Fleet'));
      assert.match(render('/chief/sign-tenant-logo?v=test'), /<img[^>]+alt=/);
      assert.doesNotMatch(render('/chief/sign-tenant-logo?v=test'), /fds-lockup__mark|fds-lockup__family/);
    }
  }
});

test('tenant names survive public-env script serialization without becoming markup', async () => {
  const { runInNewContext } = await import('node:vm');
  const { serializePublicEnvironment, tenantPageTitle, tenantFromEnvironment } = await import(
    '../../apps/remix/app/chief/tenant-brand'
  );
  const brand = parseTenantBrand({ FLEET_TENANT_NAME: 'Acme </script><Test> Co' }).brand;
  const publicEnv = { FLEET_TENANT_BRAND: JSON.stringify(brand) };
  const script = serializePublicEnvironment(publicEnv);
  assert.ok(!script.includes('<'));
  const context = { window: {} as { __ENV__?: typeof publicEnv } };
  runInNewContext(`window.__ENV__ = ${script}`, context);
  assert.equal(context.window.__ENV__?.FLEET_TENANT_BRAND, publicEnv.FLEET_TENANT_BRAND);
  assert.equal(tenantFromEnvironment(context.window.__ENV__).name, brand.name);
  assert.equal(
    tenantPageTitle('Sign document', [{ id: 'root', data: { publicEnv } }]),
    `Sign document · ${brand.name} Sign`,
  );
  assert.equal(tenantPageTitle('Sign document', []), 'Sign document · Fleet Sign');
});
