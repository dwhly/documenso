import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { transformAsync } from '@babel/core';
import { build } from 'esbuild';
import { type Browser, chromium, type Page } from 'playwright';
import { expect } from 'playwright/test';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

import { createSigningFixture } from './sign-styles-persistence';

const root = process.cwd();
const output = path.join(root, 'docs/implementation/sign-styles');
let browser: Browser;
let server: http.Server;
let origin: string;
let fontDelay = 0;
let failFonts = false;
const requests: string[] = [];
const styles = ['Caveat', 'Allura', 'Sacramento', 'Patrick Hand'];
const ui = path.join(root, 'packages/ui');
let signing: Awaited<ReturnType<typeof createSigningFixture>> | undefined;

before(async () => {
  assert.equal(process.env.CI, 'true', 'Run Playwright with CI=true');
  mkdirSync(output, { recursive: true });
  const compiled = await build({
    entryPoints: ['chief/inventory/e2e/sign-styles-fixture.tsx'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.po': 'text' },
    define: { 'process.env.NODE_ENV': '"test"' },
    alias: {
      '@documenso/fleet-ui': path.join(root, 'packages/fleet-ui'),
      '@documenso/ui': ui,
      '@documenso/lib': path.join(root, 'packages/lib'),
    },
    plugins: [
      {
        name: 'local-lingui',
        setup(builder) {
          builder.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
            if (args.path.includes('node_modules')) {
              return;
            }
            let source = readFileSync(args.path, 'utf8');
            // biome-ignore lint/nursery/noUndeclaredEnvVars: Standalone node:test baseline build, outside Turborepo.
            if (process.env.SIGN_STYLES_BASELINE && args.path.startsWith(`${ui}/primitives/signature-pad/`)) {
              source = execFileSync('git', ['show', `HEAD:${path.relative(root, args.path)}`], { encoding: 'utf8' });
            }
            const result = await transformAsync(source, {
              filename: args.path,
              babelrc: false,
              configFile: false,
              presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
              plugins: ['@lingui/babel-plugin-lingui-macro'],
            });
            return { contents: result?.code ?? source, loader: 'tsx' };
          });
        },
      },
    ],
  });
  const tailwind = await postcss([
    tailwindcss({
      presets: [require('../../../packages/tailwind-config')],
      content: ['packages/ui/primitives/**/*.{ts,tsx}', 'chief/inventory/e2e/sign-styles-fixture.tsx'],
    }),
  ]).process(readFileSync('packages/ui/styles/theme.css', 'utf8'), { from: undefined });
  const css = `@layer sign.base, fds.tokens, fds.brand, fds.components;
    @layer sign.base { ${tailwind.css} }
    ${readFileSync('packages/fleet-ui/fds/tokens.css', 'utf8')}
    ${readFileSync('packages/fleet-ui/fds/components.css', 'utf8')}
    ${readFileSync('apps/remix/app/chief/fleet-documenso.css', 'utf8')}
    @font-face { font-family: Caveat; src: url('/fonts/caveat-variablefont_wght.ttf'); }
    @font-face { font-family: Inter; src: url('/chief/fds/fonts/inter-latin-wght-normal.woff2'); font-weight: 100 900; }`;
  server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    requests.push(pathname);
    if (pathname === '/sign' && req.method === 'POST' && signing) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      try {
        await signing.submit(JSON.parse(Buffer.concat(chunks).toString()));
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
      return;
    }
    if (pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="documenso-branded"><div id="app"></div><script src="/fixture.js"></script></body></html>',
      );
      return;
    }
    if (pathname === '/app.css' || pathname === '/fixture.js') {
      res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'application/javascript');
      res.end(pathname.endsWith('.css') ? css : compiled.outputFiles[0].text);
      return;
    }
    if (/^\/(chief\/signature-fonts|chief\/fds\/fonts|fonts)\/[\w.,-]+\.(ttf|woff2)$/.test(pathname)) {
      if (pathname.includes('/signature-fonts/')) {
        await new Promise((resolve) => setTimeout(resolve, fontDelay));
        if (failFonts) {
          res.writeHead(503).end();
          return;
        }
      }
      res.setHeader('Content-Type', pathname.endsWith('.ttf') ? 'font/ttf' : 'font/woff2');
      const file = pathname.startsWith('/chief/fds/')
        ? path.join(root, 'packages/fleet-ui', pathname.slice('/chief'.length))
        : path.join(root, 'apps/remix/public', pathname);
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  origin = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(origin)).status, 200);
  browser = await chromium.launch({
    headless: true,
    executablePath: existsSync(chromium.executablePath())
      ? chromium.executablePath()
      : '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    args: ['--no-proxy-server'],
  });
});

after(async () => {
  await browser?.close();
  await signing?.close();
  server?.close();
});

test('the unchanged signing route stores alternate styles in the image field', async () => {
  signing = await createSigningFixture();
  const page = await browser.newPage();
  await page.goto(origin);
  for (const style of styles) {
    await openDialog(page, 'Type');
    await page.getByRole('radio', { name: style, exact: true }).check();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const value = await page.getByTestId('signature-result').textContent();
    assert.ok(value);
    const response = await page.request.post(`${origin}/sign`, { data: { token: signing.token, value } });
    assert.equal(response.status(), 204);
    const stored = await signing.read();
    assert.equal(stored.typedSignature, style === 'Caveat' ? value : null);
    assert.equal(stored.signatureImageAsBase64, style === 'Caveat' ? null : value);
    const denied = await page.request.post(`${origin}/sign`, {
      data: { token: 'wrong-recipient', value: 'Wrong signer' },
    });
    assert.equal(denied.status(), 400);
    assert.deepEqual(await signing.read(), stored);
  }
  await page.close();
});

const openDialog = async (page: Page, tab: 'Type' | 'Upload') => {
  await page.getByTestId('signature-pad-dialog-button').click();
  await page.getByRole('tab', { name: tab, exact: true }).click();
};

const pngMetrics = async (page: Page, value: string) =>
  page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    let colored = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 0) {
        opaque++;
        colored += pixels[i] + pixels[i + 1] + pixels[i + 2];
        const x = (i / 4) % canvas.width;
        const y = Math.floor(i / 4 / canvas.width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return { width: image.width, height: image.height, opaque, colored, minX, minY, maxX, maxY };
  }, value);

test('four styles render real fonts, preserve device choice and produce trimmed transparent PNGs', async () => {
  const signatures = new Set<string>();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(origin);
    await openDialog(page, 'Type');
    await expect(page.getByRole('radio')).toHaveCount(4);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, `type-${viewport.width}x${viewport.height}.png`) });
    for (const style of styles) {
      await page.getByRole('radio', { name: style, exact: true }).check();
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
      assert.equal(await page.getByTestId('signature-pad-type-input').inputValue(), 'Grace Hopper');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      const signature = await page.getByTestId('signature-result').textContent();
      assert.ok(signature);
      if (style === 'Caveat') {
        assert.equal(signature, 'Grace Hopper');
      } else {
        assert.match(signature, /^data:image\/png;base64,iVBORw0KGgo/);
        const metrics = await pngMetrics(page, signature);
        assert.ok(metrics);
        assert.ok(metrics.width <= 1025 && metrics.height <= 449, JSON.stringify(metrics));
        assert.ok(metrics.opaque > 100 && metrics.opaque < (metrics.width * metrics.height) / 2);
        assert.equal(metrics.colored, 0, 'Use the existing black signature ink');
        assert.ok(metrics.minX >= 1 && metrics.minY >= 1, 'No clipped ink');
        assert.ok(metrics.minX < 8 && metrics.minY < 8, 'Trim blank margins');
        assert.ok(metrics.width - metrics.maxX < 8 && metrics.height - metrics.maxY < 8);
        signatures.add(signature);
      }
      await openDialog(page, 'Type');
    }
    await page.getByTestId('signature-pad-type-input').fill('Ada Lovelace');
    await page.getByRole('tab', { name: 'Upload', exact: true }).click();
    await page.getByRole('tab', { name: 'Type', exact: true }).click();
    await expect(page.getByTestId('signature-pad-type-input')).toHaveValue('Ada Lovelace');
    await page.getByRole('radio', { name: 'Caveat', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Allura', exact: true })).toBeChecked();
    await page.reload();
    await openDialog(page, 'Type');
    await expect(page.getByRole('radio', { name: 'Allura', exact: true })).toBeChecked();
    assert.equal(await page.evaluate(() => localStorage.getItem('sign.signature-style')), 'Allura');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
    await page.close();
  }
  assert.equal(signatures.size, 3, 'Each alternate font must produce distinct, viewport-independent ink');
  for (const filename of ['Allura-Regular.ttf', 'Sacramento-Regular.ttf', 'PatrickHand-Regular.ttf']) {
    assert.ok(requests.includes(`/chief/signature-fonts/${filename}`));
  }
});

test('font latency, failure, blank input and tab switches cannot submit stale or fallback ink', async () => {
  fontDelay = 1200;
  const page = await browser.newPage();
  await page.goto(origin);
  await openDialog(page, 'Type');
  await page.getByRole('radio', { name: 'Allura', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByTestId('signature-pad-type-input').fill('Latest Name');
  await page.getByRole('tab', { name: 'Upload', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await page.getByTestId('signature-pad-type-input').fill('   ');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.close();
  fontDelay = 0;
  failFonts = true;
  const failed = await browser.newPage();
  await failed.goto(origin);
  await openDialog(failed, 'Type');
  await failed.getByRole('radio', { name: 'Allura', exact: true }).check();
  await expect(failed.getByRole('alert')).toContainText('This style could not load');
  await expect(failed.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await failed.getByRole('radio', { name: 'Caveat', exact: true }).check();
  await expect(failed.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await failed.close();
  failFonts = false;
});

const drop = async (page: Page, file: { name: string; mimeType: string; buffer: Buffer }, screenshot?: string) => {
  const dataTransfer = await page.evaluateHandle(
    ({ name, mimeType, base64 }) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], name, { type: mimeType }));
      return transfer;
    },
    { name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64') },
  );
  const target = page.getByTestId('signature-pad-upload').locator('..');
  await target.dispatchEvent('dragover', { dataTransfer });
  await expect(target).toHaveAttribute('data-signature-drag-over', 'true');
  if (screenshot) {
    await page.screenshot({ path: path.join(output, screenshot) });
  }
  await target.dispatchEvent('drop', { dataTransfer });
  await expect(target).not.toHaveAttribute('data-signature-drag-over');
  await dataTransfer.dispose();
};

test('drop and click/Enter/Space share image handling and validation', async () => {
  const image = {
    name: 'signature.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="140"><path d="M30 100 Q100 5 150 100 T290 40" stroke="black" stroke-width="8" fill="none"/></svg>',
    ),
  };
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const values = [];
    for (const activation of ['drop', 'click', 'Enter', 'Space']) {
      const page = await browser.newPage({ viewport });
      await page.goto(origin);
      await openDialog(page, 'Upload');
      if (activation === 'drop') {
        await drop(page, image, `upload-drag-${viewport.width}x${viewport.height}.png`);
      } else {
        const chooser = page.waitForEvent('filechooser');
        const button = page.getByRole('button', { name: /Upload Signature/ });
        if (activation === 'click') {
          await button.click();
        } else {
          await button.focus();
          await page.keyboard.press(activation);
        }
        await (await chooser).setFiles(image);
      }
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      values.push(await page.getByTestId('signature-result').textContent());
      await page.close();
    }
    assert.equal(new Set(values).size, 1, 'Every activation must export identical pixels');
    assert.match(values[0] ?? '', /^data:image\/png;base64,/);
  }
  for (const file of [
    {
      name: 'text.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('bad'),
      error: 'Please upload a valid image file.',
    },
    {
      name: 'large.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
      error: 'The image must be smaller than 5MB.',
    },
    {
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('bad'),
      error: 'The image could not be loaded. Please try again.',
    },
  ]) {
    for (const activation of ['drop', 'click']) {
      const page = await browser.newPage();
      await page.goto(origin);
      await openDialog(page, 'Upload');
      if (activation === 'drop') {
        await drop(page, file);
      } else {
        await page.locator('input[type=file]').setInputFiles(file);
      }
      await expect(page.getByText(file.error, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      await page.close();
    }
  }
});
