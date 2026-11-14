import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

import { initTRPC, TRPCError } from '@trpc/server';
import { transformSync } from 'esbuild';
import { z } from 'zod';

import { isRecipientRequest, routeDecision } from '../../apps/remix/server/chief/policy';
import * as appErrors from '../../packages/lib/errors/app-error';

const read = (file: string) => readFileSync(file, 'utf8');
const share = { slug: 'existing-share', email: 'signer@example.test' };

// Execute the actual modules with isolated I/O fixtures; no database, fonts, image renderer or network.
const load = (file: string, dependencies: Record<string, unknown> = {}) => {
  const url = pathToFileURL(resolve(file));
  const require = createRequire(url);
  const { code } = transformSync(read(file), {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'automatic',
    define: { 'import.meta.url': JSON.stringify(url.href) },
  });
  const module = { exports: {} as Record<string, any> };
  runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      Response,
      URL,
      fetch: async () => new Response(new Uint8Array()),
      require: (name: string) => {
        if (Object.hasOwn(dependencies, name)) {
          return dependencies[name];
        }
        if (['react/jsx-runtime', 'react-router', 'ts-pattern'].includes(name)) {
          return require(name);
        }
        throw new Error(`Unexpected dependency: ${name}`);
      },
    },
    { filename: file },
  );
  return module.exports;
};

for (const suffix of ['', '.opengraph']) {
  test(`C0: share${suffix} loader returns 404 even for existing signature and QR slugs`, async () => {
    const { loader } = load(`apps/remix/app/routes/_share+/share.$slug${suffix}.tsx`, {
      '@documenso/lib/constants/app': { NEXT_PUBLIC_WEBAPP_URL: () => 'https://sign.example.test' },
      '@documenso/lib/server-only/document/get-document-by-access-token': {
        getDocumentByAccessToken: async () => ({ id: 1, title: 'Existing document' }),
      },
      '@documenso/lib/server-only/document/get-recipient-or-sender-by-share-link-slug': {
        getRecipientOrSenderByShareLinkSlug: async ({ slug }: { slug: string }) => {
          assert.equal(slug, share.slug);
          return { name: 'Signer', email: share.email, signature: 'data:image/png;base64,c2lnbmF0dXJl' };
        },
      },
      '~/components/general/document/document-certificate-qr-view': {},
      satori: async () => '<svg>signature</svg>',
      '@documenso/lib/utils/images/svg-to-png': { svgToPng: async () => new Uint8Array([1, 2, 3]) },
    });
    for (const slug of [share.slug, 'qr_existing-document', 'missing']) {
      for (const userAgent of ['Twitterbot', 'Mozilla/5.0']) {
        const result = await loader({
          params: { slug },
          request: new Request(`https://sign.example.test/share/${slug}`, { headers: { 'User-Agent': userAgent } }),
        }).catch((error: unknown) => error);
        assert.ok(result instanceof Response, `${slug}: expected a 404 Response`);
        assert.equal(result.status, 404, `${slug}/${userAgent}`);
        assert.doesNotMatch(await result.text(), /signature|data:image|<svg/i);
      }
    }
  });
}

test('C0: the share procedure refuses recipient tokens, signed-in users and anonymous callers', async () => {
  const trpc = initTRPC.context<{ user: { id: number } | null; logger: { info: () => void } }>().create();
  const schemas = load('packages/trpc/server/document-router/share-document.types.ts', {
    zod: { z },
    '@documenso/prisma/generated/zod/modelSchema/DocumentShareLinkSchema': z.object({
      slug: z.string(),
      email: z.string(),
    }),
  });
  const { shareDocumentRoute } = load('packages/trpc/server/document-router/share-document.ts', {
    '../trpc': { procedure: trpc.procedure },
    './share-document.types': schemas,
    '@documenso/lib/errors/app-error': appErrors,
    '@documenso/lib/server-only/share/create-or-get-share-link': { createOrGetShareLink: async () => share },
  });
  const router = trpc.router({ share: shareDocumentRoute });
  for (const user of [null, { id: 1 }]) {
    for (const token of ['valid-recipient-token', undefined]) {
      const caller = router.createCaller({ user, logger: { info: () => {} } });
      await assert.rejects(
        caller.share({ documentId: 1, token }),
        (error: unknown) =>
          error instanceof TRPCError &&
          error.cause instanceof appErrors.AppError &&
          error.cause.code === 'FORBIDDEN' &&
          error.cause.message === 'Document sharing is disabled.',
      );
    }
  }
});

test('C0: direct share-link creation and retrieval refuse before accessing storage', async () => {
  const { createOrGetShareLink } = load('packages/lib/server-only/share/create-or-get-share-link.ts', {
    '../../errors/app-error': appErrors,
    '@documenso/prisma': { prisma: new Proxy({}, { get: () => assert.fail('Sharing accessed storage') }) },
    '@prisma/client': { EnvelopeType: { DOCUMENT: 'DOCUMENT' } },
    '../../universal/id': {},
    '../../utils/envelope': {},
    '../envelope/get-envelope-by-id': {},
  });
  for (const options of [{ token: 'valid-recipient-token' }, { userId: 1 }]) {
    await assert.rejects(createOrGetShareLink({ documentId: 1, ...options }), {
      code: 'FORBIDDEN',
      message: 'Document sharing is disabled.',
    });
  }
});

for (const file of [
  'apps/remix/app/routes/_recipient+/sign.$token+/complete.tsx',
  'apps/remix/app/components/general/document/document-page-view-dropdown.tsx',
  'apps/remix/app/components/tables/documents-table-action-dropdown.tsx',
]) {
  test(`C0: static source check: no sharing imports or label; Download remains in ${file}`, () => {
    const source = read(file);
    assert.doesNotMatch(source, /DocumentShareButton|useCopyShareLink|<Trans>Share(?: Signing Card)?<\/Trans>/);
    assert.match(source, /<EnvelopeDownloadDialog\b/);
    assert.match(source, /<Trans>Download<\/Trans>/);
  });
}

for (const file of [
  'packages/lib/server-only/pdf/generate-certificate-pdf.ts',
  'apps/remix/app/routes/_internal+/[__htmltopdf]+/certificate.tsx',
]) {
  test(`C0: static source check: certificate has no share URL or non-null QR token in ${file}`, () => {
    const source = read(file);
    assert.doesNotMatch(source, /\/share\/\$\{/);
    for (const [, value] of source.matchAll(/\bqrToken\s*:\s*([^,\n}]+)/g)) {
      assert.equal(value.trim(), 'null', `${file}: qrToken must be null`);
    }
  });
}

test('C0: certificate renderer receives no QR token even when the envelope has one', async () => {
  let renderedQrToken: unknown;
  const { generateCertificatePdf } = load('packages/lib/server-only/pdf/generate-certificate-pdf.ts', {
    '@libpdf/core': { PDF: { merge: async () => new Uint8Array() } },
    '@lingui/core': { i18n: { loadAndActivate: () => {} } },
    '@lingui/core/macro': {},
    '@prisma/client': {},
    remeda: {},
    '../../constants/i18n': { ZSupportedLanguageCodeSchema: z.string() },
    '../../utils/document-auth': {},
    '../../utils/i18n': { getTranslations: async () => ({}) },
    '../document/get-document-certificate-audit-logs': { getDocumentCertificateAuditLogs: async () => ({}) },
    '../organisation/get-organisation-claims': {
      getOrganisationClaimByTeamId: async () => ({ flags: { hidePoweredBy: false } }),
    },
    './render-certificate': {
      renderCertificate: ({ qrToken }: { qrToken: string | null }) => {
        renderedQrToken = qrToken;
        return Promise.resolve([]);
      },
    },
  });

  await generateCertificatePdf({
    envelope: { id: 'envelope_certificate', teamId: 1, qrToken: 'qr_existing-document' },
    envelopeOwner: { name: 'Owner', email: 'owner@example.test' },
    recipients: [],
    fields: [],
    language: 'en',
    pageWidth: 612,
    pageHeight: 792,
  });

  assert.equal(renderedQrToken, null);
});

test('C0: inventory policy denies sharing on staff, bearer and recipient surfaces', () => {
  for (const path of ['/share/existing-share', '/share/existing-share/opengraph', '/share/qr_existing-document']) {
    for (const suffix of ['', '.data']) {
      assert.equal(routeDecision('GET', path + suffix), 'denied');
      assert.equal(isRecipientRequest('GET', path + suffix), false);
    }
  }
  for (const path of [
    '/api/trpc/document.share',
    '/api/trpc/envelope.find,document.share',
    '/api/deal/document/share',
  ]) {
    for (const hasBearer of [false, true]) {
      assert.equal(routeDecision('POST', path, hasBearer), 'denied');
      assert.equal(isRecipientRequest('POST', path), false);
    }
  }
  const inventory = JSON.parse(read('chief/inventory/remix.json'));
  for (const suffix of ['', '.opengraph']) {
    const route = inventory.find((entry: { id: string }) => entry.id === `routes/_share+/share.$slug${suffix}`);
    assert.equal(route.classification, 'denied');
    assert.deepEqual(route.nativeServices, []);
  }
});
