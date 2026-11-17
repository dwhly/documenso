import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from 'remix-themes';
import { FleetThemeToggle } from '../../apps/remix/app/chief/fleet-theme-toggle';
import { createChiefPublicEnv } from '../../apps/remix/app/chief/public-env.server';
import { scan } from './tenant-scan';

const legacy = 'NEXT_PUBLIC_AMFORGE_SEND_URL';
test('M-new-1 only authenticated staff pages receive the resolved Rooms URL', () => {
  const keys = [legacy, 'NEXT_PUBLIC_FLEET_SEND_URL', 'CHIEF_RECIPIENT_URL'];
  const original = keys.map((key) => process.env[key]);
  try {
    process.env.CHIEF_RECIPIENT_URL = 'https://recipient.test';
    process.env[legacy] = 'https://amforge.staff.test';
    delete process.env.NEXT_PUBLIC_FLEET_SEND_URL;
    for (const current of [undefined, '', 'https://new.staff.test']) {
      if (current === undefined) {
        delete process.env.NEXT_PUBLIC_FLEET_SEND_URL;
      } else {
        process.env.NEXT_PUBLIC_FLEET_SEND_URL = current;
      }
      const expected = current || process.env[legacy];
      const staff = createChiefPublicEnv(new Request('https://staff.test/t/team/documents'), true);
      assert.equal(staff.NEXT_PUBLIC_FLEET_SEND_URL, expected);
      assert.ok(!(legacy in staff));
      for (const [url, authenticated] of [
        ['https://recipient.test/sign/token', false],
        ['https://recipient.test/t/team/documents', true],
        ['https://staff.test/sign/token', true],
        ['https://staff.test/sign/token', false],
        ['https://staff.test/d/token', true],
        ['https://staff.test/embed/sign/token', true],
        ['https://staff.test/t/team/documents/123/edit', true],
        ['https://staff.test/t/team/templates/123/edit', true],
        ['https://staff.test/o/org/signin', true],
        ['https://staff.test/share/token', true],
        ['https://staff.test/signin', false],
        ['https://staff.test/t/team/documents', false],
      ] as const) {
        const environment = createChiefPublicEnv(new Request(url), authenticated);
        assert.ok(!(legacy in environment), url);
        assert.ok(!('NEXT_PUBLIC_FLEET_SEND_URL' in environment), url);
        assert.doesNotMatch(JSON.stringify(environment), /amforge|staff\.test/i);
      }
      const proxied = createChiefPublicEnv(
        new Request('http://internal/t/team/documents', {
          headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'recipient.test' },
        }),
        true,
      );
      assert.ok(!('NEXT_PUBLIC_FLEET_SEND_URL' in proxied));
    }
  } finally {
    keys.forEach((key, i) => (original[i] === undefined ? delete process.env[key] : (process.env[key] = original[i])));
  }
});

test('M-new-1 the deprecated key exists only in server code', () => {
  const client = readFileSync('apps/remix/app/chief/fleet-send-url.ts', 'utf8');
  assert.doesNotMatch(client, /AMFORGE|DEPRECATED_SEND_URL_KEY|\.server/);
  const bundle = buildSync({
    entryPoints: ['apps/remix/app/chief/fleet-header.tsx'],
    bundle: true,
    write: false,
    platform: 'browser',
  });
  assert.doesNotMatch(bundle.outputFiles[0].text, /NEXT_PUBLIC_AMFORGE_SEND_URL|DEPRECATED_SEND_URL_KEY/);
});

for (const value of [
  '210 39.5349% 16.8627%',
  '210 40% 17%',
  'hsl(210, 39.5349%, 16.8627%)',
  'rgb(26, 43, 60)',
  'RGB(26,43,60)',
  'rgb(26 43 60)',
]) {
  test(`L-new-3 scanner detects colour representation ${value}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'colour-'));
    try {
      const relative = 'apps/remix/app/chief/check.css';
      const file = path.join(dir, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, ':root { --chrome-base: ' + value + '; }');
      assert.deepEqual(scan(dir, { FLEET_TEST_TENANT_COLOURS: '#1a2b3c' }), [relative]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
}

test('L-new-3 only the hash-pinned vendored comment is exempt', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vendor-'));
  try {
    const relative = 'packages/fleet-ui/fds/tokens.css';
    const file = path.join(dir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    const original = readFileSync(relative, 'utf8');
    const fixtures = { FLEET_TEST_TENANT_COLOURS: '#0b1f4d' };
    writeFileSync(file, original);
    assert.deepEqual(scan(dir, fixtures), []);
    for (const source of [
      original + '\n/* changed */',
      original + '\n:root { color: #0b1f4d; }',
      original + '\n/* Acme Test Co */',
    ]) {
      writeFileSync(file, source);
      assert.deepEqual(scan(dir, fixtures), [relative]);
    }
    rmSync(file);
    writeFileSync(path.join(path.dirname(file), 'other.css'), original);
    assert.deepEqual(scan(dir, fixtures), ['packages/fleet-ui/fds/other.css']);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('L-new-2 server renders an empty live region before any activation', () => {
  const props = { specifiedTheme: null, themeAction: '/api/theme', children: React.createElement(FleetThemeToggle) };
  const html = renderToStaticMarkup(React.createElement(ThemeProvider, props));
  assert.match(html, /aria-live="polite" aria-atomic="true"><\/span>/);
  assert.match(html, /title="Theme: auto"/);
});
