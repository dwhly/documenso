import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { buildSync } from 'esbuild';
import { type Browser, chromium, type Page } from 'playwright';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const root = path.resolve('.');
// biome-ignore lint/nursery/noUndeclaredEnvVars: Inventory artifacts are written by node:test, outside Turborepo.
const output = process.env.C4_BROWSER_OUTPUT;
const panelSelector = '.embed--DocumentViewer .pointer-events-none.fixed.bottom-0';
let browser: Browser;
let script: string;
let styles: string;

before(async () => {
  script = buildSync({
    entryPoints: ['chief/inventory/c4-r5-signing-fixture.tsx'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
  }).outputFiles[0].text;
  const result = await postcss([
    tailwindcss({
      presets: [require('../../packages/tailwind-config')],
      content: ['chief/inventory/c4-r5-signing-fixture.tsx'],
    }),
  ]).process(readFileSync('packages/ui/styles/theme.css', 'utf8'), { from: undefined });
  styles = `@layer sign.base, fds.tokens, fds.brand, fds.components;
    @import url('/chief/fds/fonts.css');
    @import url('/chief/fds/tokens.css');
    @import url('/chief/fds/components.css');
    @layer sign.base { ${result.css} }
    ${readFileSync('apps/remix/app/chief/fleet-documenso.css', 'utf8')}`;
  browser = await chromium.launch({ headless: true });
  if (output) {
    mkdirSync(output, { recursive: true });
  }
});

after(async () => {
  await browser?.close();
});

const openFixture = async (width: number) => {
  const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
  await page.route('https://preview.test/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"></head><body class="documenso-branded"><div id="app"></div><script src="/fixture.js"></script></body></html>',
      });
    }
    if (pathname === '/preview.css') {
      return route.fulfill({ contentType: 'text/css', body: styles });
    }
    if (pathname === '/fixture.js') {
      return route.fulfill({ contentType: 'application/javascript', body: script });
    }
    return route.fulfill({ path: path.join(root, 'packages/fleet-ui', pathname.replace('/chief/', '')) });
  });
  await page.goto('https://preview.test/');
  await page.locator('.fleet-visitor-footer').waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
};

const measure = async (page: Page) => {
  await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  return page.evaluate((selector) => {
    const footer = document.querySelector<HTMLElement>('.fleet-visitor-footer');
    const source = footer && [...footer.querySelectorAll('a')].find((link) => link.textContent === 'Source');
    const attributionElement = footer?.lastElementChild;
    const container = footer?.parentElement;
    if (!footer || !source || !attributionElement || !container) {
      return null;
    }
    const panel = document.querySelector(selector)?.getBoundingClientRect();
    const link = source.getBoundingClientRect();
    const attribution = attributionElement.getBoundingClientRect();
    const hit = document.elementFromPoint(link.x + link.width / 2, link.y + link.height / 2);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      footerScrollWidth: footer.scrollWidth,
      footerClientWidth: footer.clientWidth,
      padding: Number.parseFloat(getComputedStyle(container).paddingBottom),
      panelHeight: panel?.height ?? 0,
      panelTop: panel?.height ? panel.top : innerHeight,
      attribution: attribution.toJSON(),
      source: link.toJSON(),
      sourceHit: hit === source || source.contains(hit),
      sourceUrl: source.href,
    };
  }, panelSelector);
};

const assertAccessible = async (page: Page, label: string) => {
  const metrics = await measure(page);
  assert.ok(metrics, 'The fixture must render the attribution and its Source link');
  if (output) {
    writeFileSync(path.join(output, `c4-r5-${label}.json`), JSON.stringify(metrics, null, 2));
    await page.screenshot({ path: path.join(output, `c4-r5-${label}.png`) });
  }
  assert.ok(metrics.scrollWidth <= metrics.clientWidth, JSON.stringify(metrics));
  assert.ok(metrics.footerScrollWidth <= metrics.footerClientWidth, JSON.stringify(metrics));
  assert.ok(metrics.padding >= metrics.panelHeight, `Missing panel clearance: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.attribution.top >= 0 && metrics.attribution.bottom <= metrics.panelTop, JSON.stringify(metrics));
  assert.ok(metrics.source.left >= 0 && metrics.source.right <= metrics.clientWidth, JSON.stringify(metrics));
  assert.ok(metrics.sourceHit, `Source is covered: ${JSON.stringify(metrics)}`);
  await page.getByRole('link', { name: 'Source', exact: true }).tap({ trial: true });
  assert.equal(metrics.sourceUrl, 'https://source.example.test/tree/0123456789abcdef');
  return metrics;
};

test('signing layout opts into panel clearance only for signing routes', () => {
  const layout = readFileSync('apps/remix/app/routes/_recipient+/_layout.tsx', 'utf8');
  assert.match(layout, /<div className="min-h-screen" data-fleet-signing=\{hideHeader \|\| undefined\}>/);
  const errorBoundary = layout.slice(layout.indexOf('export function ErrorBoundary'));
  assert.doesNotMatch(errorBoundary, /data-fleet-signing/);
});

for (const width of [390, 1280]) {
  test(`signing attribution wraps and Source is tappable above the panel at ${width}px`, async () => {
    const page = await openFixture(width);
    try {
      assert.equal(await page.locator(panelSelector).isVisible(), width < 1024);
      await assertAccessible(page, `signing-${width}`);
      await page.route('https://source.example.test/**', (route) => route.fulfill({ body: 'Source offer' }));
      await Promise.all([
        page.waitForURL('https://source.example.test/tree/0123456789abcdef'),
        page.getByRole('link', { name: 'Source', exact: true }).tap(),
      ]);
    } finally {
      await page.close();
    }
  });
}

test('a long tenant attribution stays within the phone viewport', async () => {
  const page = await openFixture(390);
  try {
    await page.getByRole('button', { name: 'Long tenant', exact: true }).click();
    await assertAccessible(page, 'long-tenant-390');
  } finally {
    await page.close();
  }
});

test('completed and error fixtures retain the original footer spacing', async () => {
  for (const width of [390, 1280]) {
    const page = await openFixture(width);
    try {
      for (const view of ['Completed', 'Error']) {
        await page.getByRole('button', { name: view, exact: true }).click();
        const spacing = await page.locator('.fleet-visitor-footer').evaluate((footer) => {
          const style = getComputedStyle(footer);
          return {
            page: footer.parentElement && getComputedStyle(footer.parentElement).paddingBottom,
            footer: style.padding,
          };
        });
        assert.deepEqual(spacing, { page: '0px', footer: '32px 0px' });
        await assertAccessible(page, `${view.toLowerCase()}-${width}`);
      }
    } finally {
      await page.close();
    }
  }
});

test('clearance follows panel expansion, replacement and viewport changes, and resets on completion/error', async () => {
  const page = await openFixture(390);
  try {
    await page.getByRole('button', { name: 'Expand', exact: true }).click();
    const expanded = await assertAccessible(page, 'expanded-390');
    await page.getByRole('button', { name: 'Collapse', exact: true }).click();
    const collapsed = await assertAccessible(page, 'collapsed-390');
    assert.ok(expanded.padding > collapsed.padding);
    await page.getByRole('button', { name: 'Toggle panel', exact: true }).click();
    assert.equal((await assertAccessible(page, 'removed-390')).padding, 0);
    await page.getByRole('button', { name: 'Toggle panel', exact: true }).click();
    await assertAccessible(page, 'replaced-390');
    await page.setViewportSize({ width: 1280, height: 844 });
    assert.equal((await assertAccessible(page, 'resized-1280')).padding, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Long tenant', exact: true }).click();
    await assertAccessible(page, 'long-tenant-390');
    for (const view of ['Completed', 'Error']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      assert.equal(await page.locator('[data-fleet-signing]').count(), 0);
      assert.equal(await page.locator(panelSelector).count(), 0);
      assert.equal(
        await page
          .locator('.fleet-visitor-footer')
          .evaluate((footer) => footer.parentElement && getComputedStyle(footer.parentElement).paddingBottom),
        '0px',
      );
    }
  } finally {
    await page.close();
  }
});
