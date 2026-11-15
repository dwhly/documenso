import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import { transformSync } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const forbidden = /documenso|documen\.so|amforge|sslip\.io/i;
const certificate = 'packages/lib/server-only/pdf/render-certificate.ts';
const audit = 'packages/lib/server-only/pdf/render-audit-logs.ts';
const fleetLogo = Buffer.from('mounted Fleet logo');

// Execute production modules with isolated rendering/signing I/O; never load fonts, keys or services.
const load = <T = Record<string, unknown>>(file: string, dependencies: Record<string, unknown>, extra = ''): T => {
  const require = createRequire(path.join(root, file));
  const { code } = transformSync(read(file) + extra, { loader: 'tsx', format: 'cjs' });
  const module = { exports: {} as T };
  runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      process: { cwd: () => '/app/apps/remix' },
      require: (name: string) => {
        if (Object.hasOwn(dependencies, name)) {
          return dependencies[name];
        }
        if (name.endsWith('/chief/branding')) {
          const resolved = path.relative(root, path.resolve(root, path.dirname(file), `${name}.ts`));
          return load(resolved, {});
        }
        if (['node:path', 'ts-pattern'].includes(name)) {
          return require(name);
        }
        throw new Error(`Unexpected dependency: ${name}`);
      },
    },
    { filename: file },
  );
  return module.exports;
};

type RenderNode = {
  attrs: Record<string, unknown> & { text?: string; image?: { bytes: Buffer } };
  children: RenderNode[];
  add: (child: RenderNode) => void;
  width: () => number;
};

function DrawingNode(attrs: RenderNode['attrs'] = {}): RenderNode {
  const children: RenderNode[] = [];
  return {
    attrs,
    children,
    add: (child) => {
      children.push(child);
    },
    width: () => 180,
  };
}

const renderBranding = async (file: string) => {
  const paths: string[] = [];
  const { renderBranding } = load<{ renderBranding: (options: unknown) => Promise<RenderNode> }>(
    file,
    {
      '../konva/skia-backend': {},
      'node:fs': {
        readFileSync: (file: string) => {
          paths.push(file);
          return file === '/app/apps/remix/build/client/static/logo.png' ? fleetLogo : Buffer.from('old logo');
        },
      },
      '@documenso/skia-canvas': {
        Image: function Image(bytes: Buffer) {
          return { bytes, width: 176, height: 24 };
        },
      },
      '@lingui/core/macro': { msg: (strings: TemplateStringsArray) => strings.join('') },
      '@prisma/client': {},
      konva: { Group: DrawingNode, Text: DrawingNode, Image: DrawingNode },
      luxon: { DateTime: { DATETIME_SHORT: {} } },
      'ua-parser-js': {
        UAParser: function UAParser() {
          return {};
        },
      },
      uqr: { renderSVG: () => assert.fail('Certificate attempted to generate a QR code') },
      '../../constants/app': {},
      '../../constants/document': {},
      '../../constants/i18n': {},
      '../../constants/pdf': {},
      '../../constants/recipient-roles': {},
      '../../types/document-audit-logs': {},
      '../../utils/document-audit-logs': {},
      '../../utils/images/svg-to-png': {},
      './helpers': {},
    },
    '\nexport { renderBranding };',
  );
  const tree: RenderNode = await renderBranding({ qrToken: null, i18n: { _: (value: string) => value } });
  const flatten = (node: RenderNode): RenderNode[] => [node, ...node.children.flatMap(flatten)];
  return { nodes: flatten(tree), paths };
};

test('C1a: certificate renderer emits Fleet attribution (behavioral; drawing I/O stubs)', async () => {
  const { nodes } = await renderBranding(certificate);
  const text = nodes
    .map((node) => node.attrs.text ?? '')
    .join(' ')
    .trim();
  assert.equal(text, 'Signing record by');
  assert.doesNotMatch(text, forbidden);
  const source = read(certificate);
  assert.doesNotMatch(source.slice(source.indexOf('export async function renderCertificate')), /\bhidePoweredBy\b/);
});

for (const file of [certificate, audit]) {
  test(`C1a: ${file} draws the mounted client logo (behavioral; file/image I/O stubs)`, async () => {
    const { nodes, paths } = await renderBranding(file);
    assert.deepEqual(paths, ['/app/apps/remix/build/client/static/logo.png']);
    const images = nodes.filter((node) => node.attrs.image);
    assert.equal(images.length, 1);
    assert.deepEqual(images[0].attrs.image?.bytes, fleetLogo);
  });
}

test('C1a: HTML certificate uses Fleet attribution and the inline logo (static)', () => {
  const source = read('apps/remix/app/routes/_internal+/[__htmltopdf]+/certificate.tsx');
  const branding = source.slice(source.lastIndexOf('<p className="flex-shrink-0'));
  assert.match(branding, /msg`Signing record by`/);
  assert.match(branding, /<BrandingLogo className="max-h-6 print:max-h-4" \/>/);
  assert.doesNotMatch(source, /\/static\/logo\.png/);
  assert.doesNotMatch(branding, forbidden);
  assert.doesNotMatch(branding, /qrToken|\/share\//);
  assert.doesNotMatch(source.slice(source.indexOf('export default function SigningCertificate')), /\bhidePoweredBy\b/);
});

test('C1a: seal passes Fleet metadata to pdf.sign despite legacy settings (behavioral; signer/PDF I/O stubs)', async () => {
  const { signPdf } = load<{ signPdf: (options: unknown) => Promise<Uint8Array> }>('packages/signing/index.ts', {
    '@documenso/lib/constants/app': {
      NEXT_PRIVATE_SIGNING_REASON: () => 'Signed by Documenso',
      NEXT_PUBLIC_SIGNING_CONTACT_INFO: () => 'AmForge',
      NEXT_PUBLIC_WEBAPP_URL: () => 'https://sign.sslip.io',
      NEXT_PRIVATE_SIGNING_TRANSPORT: () => 'local',
      NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER: () => false,
    },
    './helpers/tsa': { getTimestampAuthority: () => undefined },
    './transports/local': { createLocalSigner: () => Promise.resolve({}) },
    './transports/google-cloud': { createGoogleCloudSigner: () => assert.fail('Unexpected HSM access') },
  });
  let metadata: Record<string, unknown> | undefined;
  await signPdf({
    pdf: {
      sign: (options: Record<string, unknown>) => {
        metadata = options;
        return Promise.resolve({ bytes: new Uint8Array([1, 2, 3]) });
      },
    },
  });
  assert.ok(metadata);
  assert.equal(metadata.reason, 'Signed by Fleet | Dealroom');
  assert.equal(metadata.contactInfo, 'Fleet | Dealroom');
  assert.equal(metadata.location, 'Fleet | Dealroom');
  assert.doesNotMatch(JSON.stringify([metadata.reason, metadata.contactInfo, metadata.location]), forbidden);
});
