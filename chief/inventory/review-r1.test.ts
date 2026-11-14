// Review r1 (cross-family, fds v0.9 adoption) regressions. Each test failed on the reviewed commit 3ba2d900c.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const read = (p: string) => fs.readFileSync(p, 'utf8');
const STATUSES = ['DRAFT', 'PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED'];

// [1] A cancelled/rejected document must never be offered or served as a signed PDF.
test('review r1 [1]: token download refuses the signed PDF unless the envelope is COMPLETED', async () => {
  const { tokenDownloadRefusal } = await import('../../apps/remix/server/chief/token-download');
  for (const status of STATUSES.filter((s) => s !== 'COMPLETED')) {
    assert.equal(tokenDownloadRefusal(status, 'signed')?.code, 'DOCUMENT_NOT_COMPLETE', status);
  }
  assert.equal(tokenDownloadRefusal('COMPLETED', 'signed'), null);
  for (const status of STATUSES) {
    assert.equal(tokenDownloadRefusal(status, 'original'), null, `original stays available (${status})`);
  }
});
test('review r1 [1]: the recipient-token download route checks status before serving bytes, for this envelope only', () => {
  const source = read('apps/remix/server/api/files/files.ts');
  const route = source.slice(source.indexOf("'/token/:token/envelopeItem/:envelopeItemId/download/:version?'"));
  const serve = route.indexOf('handleEnvelopeItemFileRequest(');
  const guard = route.indexOf('tokenDownloadRefusal(envelopeItem.envelope.status, version)');
  assert.ok(serve > 0, 'route found');
  assert.ok(guard > 0 && guard < serve, 'refusal runs before the file is served');
  // The lookup is scoped to a recipient token (or the QR token) of the envelope that owns the item.
  assert.match(route.slice(0, serve), /envelope: \{\s*recipients: \{\s*some: \{\s*token,/);
  assert.match(route.slice(0, serve), /envelope: \{\s*qrToken: token,/);
});
test('review r1 [1]: the completion page offers Download only for a real COMPLETED', async () => {
  const { isSignedDownloadReady } = await import('../../apps/remix/app/chief/completion-download');
  for (const status of ['REJECTED', 'CANCELLED', 'PENDING', 'DRAFT']) {
    assert.equal(isSignedDownloadReady('PENDING', status), false, status);
    assert.equal(isSignedDownloadReady(status, status), false, status);
  }
  assert.equal(isSignedDownloadReady('PROCESSING', 'PENDING'), false);
  assert.equal(isSignedDownloadReady('COMPLETED', 'PENDING'), true, 'live poll promotes the last signer');
  assert.equal(isSignedDownloadReady(undefined, 'COMPLETED'), true);
  const page = read('apps/remix/app/routes/_recipient+/sign.$token+/complete.tsx');
  assert.doesNotMatch(page, /isDocumentCompleted/);
  assert.match(page, /isSignedDownloadReady\(signingStatus, document\.status\)/);
});

// [2] The Theme choice persists: JSON to POST /api/theme on both listeners, middleware still strict.
const callMiddleware = async (rawPath: string, init: { method?: string; type?: string; body?: string; recipient?: boolean }) => {
  const { Hono } = await import('hono');
  const { appMiddleware } = await import('../../apps/remix/server/middleware');
  let reached = false;
  const app = new Hono();
  app.use('*', appMiddleware);
  app.all('*', (c) => {
    reached = true;
    return c.json({ ok: true });
  });
  const headers: Record<string, string> = {};
  if (init.type) headers['content-type'] = init.type;
  if (init.recipient) headers['x-chief-recipient-listener'] = '1';
  const res = await app.request(
    rawPath,
    { method: init.method ?? 'POST', headers, body: init.body },
    { incoming: { socket: { remoteAddress: '100.64.0.7', remotePort: 40000, remoteFamily: 'IPv4' } } },
  );
  return { status: res.status, reached };
};
const dark = JSON.stringify({ theme: 'dark' });
test('review r1 [2]: middleware stays strict: a non-JSON POST /api/theme is still 415', async () => {
  for (const recipient of [false, true]) {
    const r = await callMiddleware('/api/theme', { type: 'text/plain;charset=UTF-8', body: dark, recipient });
    assert.deepEqual(r, { status: 415, reached: false }, `recipient=${recipient}`);
    const malformed = await callMiddleware('/api/theme', { type: 'application/json', body: '{theme:', recipient });
    assert.deepEqual(malformed, { status: 400, reached: false }, `malformed recipient=${recipient}`);
  }
});
test('review r1 [2]: a JSON POST /api/theme reaches the theme action on the staff and recipient listeners', async () => {
  assert.deepEqual(await callMiddleware('/api/theme', { type: 'application/json', body: dark }), { status: 200, reached: true });
  assert.deepEqual(await callMiddleware('/api/theme', { type: 'application/json', body: dark, recipient: true }), {
    status: 200,
    reached: true,
  });
});
test('review r1 [2]: the recipient allowance is exactly POST /api/theme', async () => {
  for (const [method, rawPath] of [
    ['POST', '/api/theme.data'],
    ['POST', '/api/theme/'],
    ['POST', '/api/locale'],
    ['POST', '/api/preferred-team'],
    ['PUT', '/api/theme'],
  ]) {
    const r = await callMiddleware(rawPath, { method, type: 'application/json', body: dark, recipient: true });
    assert.deepEqual(r, { status: 404, reached: false }, `${method} ${rawPath}`);
  }
  const { recipientFetch } = await import('../../apps/remix/server/chief/recipient-listener');
  const app = recipientFetch(() => new Response('app'));
  const post = (p: string) =>
    app(new Request(`https://sign.example:9445${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: dark }));
  assert.equal(await (await post('/api/theme')).text(), 'app');
  assert.equal((await post('/api/theme.data')).status, 404);
  assert.equal((await post('/api/locale')).status, 404);
});
test('review r1 [2]: the recipient-origin CSRF allowance covers /api/theme only from the recipient origin', async () => {
  const { isRecipientOrigin } = await import('../../apps/remix/server/chief/recipient-origin');
  const saved = process.env.CHIEF_RECIPIENT_URL;
  process.env.CHIEF_RECIPIENT_URL = 'http://127.0.0.1:8798';
  try {
    const req = (origin: string) =>
      new Request('http://127.0.0.1:8798/api/theme', { method: 'POST', headers: { Origin: origin } });
    assert.equal(isRecipientOrigin(req('http://127.0.0.1:8798')), true);
    assert.equal(isRecipientOrigin(req('https://attacker.example')), false);
  } finally {
    if (saved === undefined) delete process.env.CHIEF_RECIPIENT_URL;
    else process.env.CHIEF_RECIPIENT_URL = saved;
  }
});
test('review r1 [2]: remix-themes posts the theme as application/json (tracked patch, applied to the installed copy)', () => {
  const patch = read('patches/remix-themes+2.0.4.patch');
  assert.equal(patch.match(/^\+ {10}headers: \{ "Content-Type": "application\/json" \},$/gm)?.length, 4);
  const pkg = 'node_modules/remix-themes'; // the copy the app build bundles (package.json is not exported)
  assert.equal(JSON.parse(read(`${pkg}/package.json`)).version, '2.0.4', 'patch matches the locked version');
  for (const file of ['index.js', 'index.cjs']) {
    const dist = read(`${pkg}/dist/${file}`);
    const posts = dist.split('fetch(`${themeAction}`').slice(1).map((rest) => rest.slice(0, rest.indexOf('});')));
    assert.equal(posts.length, 2, file);
    for (const post of posts) assert.match(post, /headers: \{ "Content-Type": "application\/json" \}/, file);
  }
});

// [5] Label shows the resolved scheme in auto; one colour-scheme meta with the single chosen scheme.
test('review r1 [5]: Theme label and colour-scheme meta follow the fds contract', async () => {
  const { themeLabel, colorSchemeContent, FLEET_THEME_BOOT } = await import('../../apps/remix/app/chief/fleet-theme-contract');
  assert.equal(themeLabel('light', 'SYSTEM'), 'Theme: auto (light)');
  assert.equal(themeLabel('dark', 'SYSTEM'), 'Theme: auto (dark)');
  assert.equal(themeLabel(null, 'SYSTEM'), 'Theme: auto', 'server render without a cookie');
  assert.equal(themeLabel('dark', 'USER'), 'Theme: dark');
  assert.equal(themeLabel('light', 'USER'), 'Theme: light');
  assert.equal(colorSchemeContent('dark', 'SYSTEM'), 'light dark');
  assert.equal(colorSchemeContent(null, 'SYSTEM'), 'light dark');
  assert.equal(colorSchemeContent('dark', 'USER'), 'dark');
  assert.equal(colorSchemeContent('light', 'USER'), 'light');
  // Boot: fills an empty data-theme from the OS, keeps a server-rendered choice, never touches the meta.
  for (const [initial, prefersLight, expected] of [['', true, 'light'], ['', false, 'dark'], ['dark', true, 'dark']] as const) {
    let value: string = initial;
    const documentElement = { getAttribute: () => value, setAttribute: (_: string, v: string) => (value = v) };
    new Function('document', 'window', FLEET_THEME_BOOT)(
      { documentElement, querySelector: () => assert.fail('boot must not touch the meta') },
      { matchMedia: () => ({ matches: prefersLight }) },
    );
    assert.equal(value, expected, `${initial || 'empty'} prefersLight=${prefersLight}`);
  }
  const root = read('apps/remix/app/root.tsx');
  assert.doesNotMatch(root, /<PreventFlashOnWrongTheme/);
  assert.match(root, /<FleetThemeHead ssrTheme=\{Boolean\(data\.theme\)\}/);
  assert.match(read('apps/remix/app/chief/fleet-theme-toggle.tsx'), /themeLabel\(/);
});

// [3] No fill/text pair resolves to the same colour (status palettes collapse many shades onto one role).
test('review r1 [3]: no element pairs a fill and a text colour that resolve to the same colour, light or dark', () => {
  const resolveConfig = require('tailwindcss/resolveConfig');
  const flatten = require('tailwindcss/lib/util/flattenColorPalette').default;
  const colors: Record<string, string> = flatten(resolveConfig(require('../../packages/tailwind-config/index.cjs')).theme.colors);
  const norm = (v: unknown) => (typeof v === 'string' ? v.replace(/\s*\/\s*<alpha-value>/, '').replace(/\s+/g, '') : null);
  const token = /(?<![\w:/-])((?:[a-z-]+:)*)(bg|text)-([a-z]+(?:-[a-z]+)*(?:-\d{2,3})?)(\/\d+)?(?![\w/-])/g;
  // Class strings: single-line '...' / "..." (so an apostrophe in JSX text can't swallow lines), or `...`.
  const literal = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g;
  type Tok = { variant: string; prop: 'bg' | 'text'; color: string; alpha: boolean; cls: string };
  const parse = (s: string): Tok[] =>
    [...s.matchAll(token)]
      .filter((m) => norm(colors[m[3]]))
      .map((m) => ({ variant: m[1], prop: m[2] as 'bg' | 'text', color: norm(colors[m[3]])!, alpha: !!m[4], cls: m[0] }));
  const pick = (toks: Tok[], prop: 'bg' | 'text', mode: 'light' | 'dark', state: '' | 'hover') => {
    const order = ['', ...(state ? [`${state}:`] : []), ...(mode === 'dark' ? ['dark:', ...(state ? [`dark:${state}:`] : [])] : [])];
    let found: Tok | undefined;
    for (const v of order) found = toks.filter((t) => t.prop === prop && t.variant === v).pop() ?? found;
    return found;
  };
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  ['apps/remix/app', 'packages/ui'].forEach(walk);
  const collisions: string[] = [];
  for (const file of files) {
    const src = read(file);
    const strings = [...src.matchAll(literal)].map((m) => ({
      line: src.slice(0, m.index).split('\n').length,
      toks: parse(m[1] ?? m[2] ?? m[3]),
      // `<span className="..." />` has no children to inherit a text colour.
      selfClosing: /^\s*\/>/.test(src.slice(m.index! + m[0].length)),
    }));
    strings.forEach((s, i) => {
      if (!s.toks.some((t) => t.prop === 'bg')) return;
      // Text colour from the same class string, else inherited from the next class string within 2 lines (a child).
      const child = s.selfClosing
        ? undefined
        : strings.slice(i + 1).find((n) => n.line - s.line <= 2 && n.toks.some((t) => t.prop === 'text'));
      for (const mode of ['light', 'dark'] as const) {
        for (const state of ['', 'hover'] as const) {
          const bg = pick(s.toks, 'bg', mode, state);
          const text = pick(s.toks, 'text', mode, state) ?? (child && pick(child.toks, 'text', mode, state));
          if (bg && text && !bg.alpha && !text.alpha && bg.color === text.color) {
            collisions.push(`${file}:${s.line} ${mode}${state ? ' ' + state : ''}: ${bg.cls} + ${text.cls} -> ${bg.color}`);
          }
        }
      }
    });
  }
  assert.deepEqual(collisions, []);
});
