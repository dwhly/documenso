import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from 'playwright';

const sendRoot = process.env.SEND_REPO,
  signRoot = fileURLToPath(new URL('../..', import.meta.url));
const output = process.env.C4_BROWSER_OUTPUT;
const script = buildSync({
  stdin: {
    contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from 'remix-themes';
import {FleetThemeToggle} from './fleet-theme-toggle';
import {TenantIdentity} from './tenant-identity';
import {DEFAULT_TENANT} from './tenant-brand';
const brand={...DEFAULT_TENANT,name:'Acme Test Co',logoUrl:'/missing.png'};
createRoot(document.getElementById('app')).render(<ThemeProvider specifiedTheme={null} themeAction='/api/theme'>
<header className='fds-header'><span className='fds-lockup'><TenantIdentity brand={brand}/><span className='fds-lockup__product'>Sign</span></span><FleetThemeToggle/></header>
<p>Theme and failed-logo browser regression fixture</p>
</ThemeProvider>);`,
    loader: 'tsx',
    resolveDir: signRoot + '/apps/remix/app/chief',
  },
  bundle: true,
  format: 'iife',
  write: false,
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"test"' },
}).outputFiles[0].text;
const cssShim =
  '.sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%)} [data-fds-theme-toggle]{position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:transparent;color:inherit;border:0} [data-fds-theme-toggle] svg{width:18px;height:18px}';
const html = (app: string) =>
  `<!doctype html><html><head><meta name="color-scheme" content="light dark"><link rel="stylesheet" href="/fds/tokens.css"><link rel="stylesheet" href="/fds/components.css"><link rel="stylesheet" href="/app.css"><style>${cssShim}</style></head><body class="fds-body documenso-branded">${app === 'send' ? '<header class="fds-header"><span class="fds-lockup"><img class="fleet-tenant-logo" src="/missing.png" alt="Acme Test Co"><span class="fds-lockup__product">Sign</span></span><button type="button" class="fds-btn" data-fds-theme-toggle>Theme</button></header><script src="/shell.js"></script><script src="/theme.js"></script>' : '<div id="app"></div><script src="/sign.js"></script>'}</body></html>`;
let currentApp = 'send';
const server = http.createServer((req, res) => {
  const p = new URL(req.url || '/', 'http://localhost').pathname;
  if (p === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(html(currentApp));
    return;
  }
  if (p === '/sign.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(script);
    return;
  }
  if (p === '/api/theme' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    res.end('{}');
    return;
  }
  const map: Record<string, string> = {
    '/shell.js': sendRoot + '/frontend/public/dealroom/shell.js',
    '/theme.js': sendRoot + '/frontend/public/fds/theme.js',
    '/app.css':
      currentApp === 'send'
        ? sendRoot + '/frontend/public/dealroom/shell.css'
        : signRoot + '/apps/remix/app/chief/fleet-documenso.css',
  };
  let file = map[p];
  if (p.startsWith('/fds/')) {
    file = signRoot + '/packages/fleet-ui' + p;
  }
  if (p.startsWith('/icons/')) {
    file = sendRoot + '/frontend/public/dealroom' + p;
  }
  if (file && fs.existsSync(file)) {
    res.setHeader(
      'Content-Type',
      file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/javascript',
    );
    res.end(fs.readFileSync(file));
    return;
  }
  res.statusCode = 404;
  res.end();
});
(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const app of sendRoot ? ['send', 'sign'] : ['sign']) {
      currentApp = app;
      const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 390, height: 720 } });
      const page = await context.newPage();
      await page.goto(url);
      const toggle = page.locator('[data-fds-theme-toggle]');
      await page.waitForFunction(
        () => document.querySelector<HTMLButtonElement>('[data-fds-theme-toggle]')?.title === 'Theme: auto (light)',
      );
      await page.waitForFunction(() => !document.querySelector('.fleet-tenant-logo'));
      assert.equal(await page.locator('.fds-lockup__family').textContent(), 'Acme Test Co');
      assert.equal(
        await page.locator('[aria-live="polite"]').textContent(),
        '',
        app + ' initial status must be silent',
      );
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForFunction(
        () => document.querySelector<HTMLButtonElement>('[data-fds-theme-toggle]')?.title === 'Theme: auto (dark)',
      );
      assert.equal(await page.locator('[aria-live="polite"]').textContent(), '', app + ' OS change must be silent');
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForFunction(
        () => document.querySelector<HTMLButtonElement>('[data-fds-theme-toggle]')?.title === 'Theme: auto (light)',
      );
      for (const label of ['Theme: light', 'Theme: dark', 'Theme: auto (light)']) {
        await toggle.click();
        await page.waitForFunction(
          (l) => document.querySelector<HTMLButtonElement>('[data-fds-theme-toggle]')?.title === l,
          label,
        );
        assert.equal(await toggle.getAttribute('aria-label'), label + ' (click to change)');
        assert.equal(await page.locator('[aria-live="polite"]').textContent(), label);
      }
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForFunction(
        () => document.querySelector<HTMLButtonElement>('[data-fds-theme-toggle]')?.title === 'Theme: auto (dark)',
      );
      assert.equal(
        await page.locator('[aria-live="polite"]').textContent(),
        'Theme: auto (light)',
        'OS changes after activation must also stay silent',
      );
      await toggle.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[aria-live="polite"]')?.textContent === 'Theme: light');
      await page.emulateMedia({ forcedColors: 'active' });
      const metrics = await toggle.evaluate((el, app) => {
        const style = getComputedStyle(el, app === 'send' ? '::before' : null);
        const svg = el.querySelector('svg');
        return {
          icon: app === 'send' ? style.backgroundColor : svg ? getComputedStyle(svg).stroke : null,
          canvas: getComputedStyle(document.body).backgroundColor,
          adjust: style.forcedColorAdjust,
          title: el.getAttribute('title'),
        };
      }, app);
      assert.ok(metrics.icon);
      assert.notEqual(metrics.icon, metrics.canvas);
      if (app === 'send') {
        assert.equal(metrics.adjust, 'none');
      }
      if (output) {
        await page.screenshot({ path: output + '-' + app + '-forced-colours.png', fullPage: true });
      }
      evidence.push({ app, ...metrics, themeCycles: 3, liveStatus: true, failedLogoFallback: true });
      await context.close();
    }
    if (output) {
      fs.writeFileSync(output + '-browser.json', JSON.stringify(evidence, null, 2));
    }
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
