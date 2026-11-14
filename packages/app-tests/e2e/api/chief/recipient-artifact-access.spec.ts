import fs from 'node:fs';
import path from 'node:path';
import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { createApiToken } from '@documenso/lib/server-only/public-api/create-api-token';
import { prisma } from '@documenso/prisma';
import { DocumentDataType, DocumentStatus, SigningStatus } from '@documenso/prisma/client';
import { seedPendingDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import { type APIRequestContext, type APIResponse, expect, test } from '@playwright/test';
import { nanoid } from 'nanoid';

// Fleet review r2 [1]/[9], r3 [11]: which stored bytes a recipient token, a QR token, a staff API token and a
// recipient page can reach, against the real database and the running server (staff and recipient listeners).
// Replaces the Prisma-stubbed route tests, whose lookups ignored their predicates.

const STAFF = NEXT_PUBLIC_WEBAPP_URL();
const RECIPIENT = process.env.CHIEF_E2E_RECIPIENT_URL ?? '';

const ORIGINAL = fs.readFileSync(path.join(__dirname, '../../../../../assets/example.pdf'));
const SEALED = Buffer.concat([ORIGINAL, Buffer.from('\n%fleet-r3 sealed artifact\n')]);
const ORIGINAL_64 = ORIGINAL.toString('base64');
const SEALED_64 = SEALED.toString('base64');

type State = 'PENDING' | 'CANCELLED' | 'REJECTED' | 'COMPLETED';
const STATES: State[] = ['PENDING', 'CANCELLED', 'REJECTED', 'COMPLETED'];

type Seeded = Awaited<ReturnType<typeof seedEnvelope>>;

/** A database-backed (BYTES_64) envelope as the seal job leaves it: COMPLETED and REJECTED carry sealed `data`. */
const seedEnvelope = async (state: State, storage: 'BYTES_64' | 'S3_PATH' = 'BYTES_64') => {
  const { user, team } = await seedUser();
  const title = `r3-${state.toLowerCase()}-${nanoid(8)}`;
  const envelope = await seedPendingDocument(user, team.id, [`a-${nanoid(6)}@example.test`, `b-${nanoid(6)}@example.test`], {
    key: title,
    createDocumentOptions: { title, qrToken: `qr_${nanoid(16)}` },
  });
  const [item] = envelope.envelopeItems;
  const [a, b] = envelope.recipients;
  const sealed = state === 'COMPLETED' || state === 'REJECTED';
  const keys = { data: `fleet-r3/${nanoid(6)}/sealed-key.pdf`, initialData: `fleet-r3/${nanoid(6)}/original-key.pdf` };

  await prisma.documentData.update({
    where: { id: item.documentDataId },
    data:
      storage === 'S3_PATH'
        ? { type: DocumentDataType.S3_PATH, data: sealed ? keys.data : keys.initialData, initialData: keys.initialData }
        : { data: sealed ? SEALED_64 : ORIGINAL_64, initialData: ORIGINAL_64 },
  });

  if (state === 'REJECTED') {
    await prisma.recipient.update({
      where: { id: a.id },
      data: { signingStatus: SigningStatus.REJECTED, rejectionReason: 'r3' },
    });
  }

  if (state === 'COMPLETED') {
    await prisma.recipient.updateMany({ where: { envelopeId: envelope.id }, data: { signingStatus: SigningStatus.SIGNED } });
  }

  await prisma.envelope.update({
    where: { id: envelope.id },
    data: { status: DocumentStatus[state], completedAt: sealed ? new Date() : null },
  });

  return {
    user,
    team,
    title,
    envelopeId: envelope.id,
    itemId: item.id,
    documentDataId: item.documentDataId,
    qrToken: envelope.qrToken!,
    rejecterToken: a.token,
    otherToken: b.token,
    keys,
  };
};

const bytes = async (res: APIResponse) => {
  if (res.status() !== 200) {
    const text = await res.text();
    const code = /"code":"([A-Z_]+)"/.exec(text)?.[1];
    return code ? `${res.status()} ${code}` : `${res.status()}`;
  }

  const body = await res.body();
  return body.equals(ORIGINAL) ? 'ORIGINAL' : body.equals(SEALED) ? 'SEALED' : `?${body.length}b`;
};

const filename = (res: APIResponse) => /filename="?([^";]+)/.exec(res.headers()['content-disposition'] ?? '')?.[1] ?? null;

const tokenPaths = (token: string, envelope: Pick<Seeded, 'envelopeId' | 'itemId' | 'documentDataId'>) => {
  const base = `/api/files/token/${token}`;
  const dataId = `${base}/envelope/${envelope.envelopeId}/envelopeItem/${envelope.itemId}/dataId/${envelope.documentDataId}`;

  return {
    preview: `${base}/envelopeItem/${envelope.itemId}`,
    current: `${dataId}/current/item.pdf`,
    initial: `${dataId}/initial/item.pdf`,
    dl: `${base}/envelopeItem/${envelope.itemId}/download`,
    signed: `${base}/envelopeItem/${envelope.itemId}/download/signed`,
    original: `${base}/envelopeItem/${envelope.itemId}/download/original`,
  };
};

const fetchAll = async (request: APIRequestContext, origin: string, paths: Record<string, string>) => {
  const got: Record<string, string> = {};

  for (const [name, p] of Object.entries(paths)) {
    got[name] = await bytes(await request.get(`${origin}${p}`));
  }

  return got;
};

const listeners = () => [STAFF, ...(RECIPIENT ? [RECIPIENT] : [])];

test('[1] recipient/QR tokens: the original until COMPLETED, never the sealed artifact (database storage)', async ({
  request,
}) => {
  expect(RECIPIENT, 'CHIEF_E2E_RECIPIENT_URL (the recipient listener) is set').not.toBe('');

  const before = { preview: 'ORIGINAL', current: 'ORIGINAL', initial: 'ORIGINAL', dl: '400 DOCUMENT_NOT_COMPLETE', signed: '400 DOCUMENT_NOT_COMPLETE', original: 'ORIGINAL' };
  const expected: Record<State, Record<string, string>> = {
    PENDING: before,
    CANCELLED: before,
    REJECTED: before,
    COMPLETED: { preview: 'SEALED', current: 'SEALED', initial: 'ORIGINAL', dl: 'SEALED', signed: 'SEALED', original: 'ORIGINAL' },
  };

  for (const state of STATES) {
    const envelope = await seedEnvelope(state);

    for (const origin of listeners()) {
      for (const token of [envelope.otherToken, envelope.qrToken]) {
        const got = await fetchAll(request, origin, tokenPaths(token, envelope));
        expect(got, `${state} ${token.startsWith('qr_') ? 'QR' : 'recipient'} token via ${origin}`).toEqual(expected[state]);
      }
    }
  }
});

test('[11] a token only reaches its own envelope: another envelope\'s item, data id or envelope id is 404', async ({
  request,
}) => {
  const mine = await seedEnvelope('PENDING');
  const theirs = await seedEnvelope('COMPLETED');
  const notFound = { preview: '404', current: '404', initial: '404', dl: '404', signed: '404', original: '404' };

  // Control: the victim's own tokens do reach its bytes, so a 404 below is the ownership rule, not a broken route.
  expect((await fetchAll(request, STAFF, tokenPaths(theirs.otherToken, theirs))).signed).toBe('SEALED');

  for (const origin of listeners()) {
    for (const token of [mine.otherToken, mine.rejecterToken, mine.qrToken]) {
      const label = `${token.startsWith('qr_') ? 'QR' : 'recipient'} token of another envelope via ${origin}`;
      // Every id is the victim's.
      expect(await fetchAll(request, origin, tokenPaths(token, theirs)), label).toEqual(notFound);
      // Own envelope id, the victim's item and data ids.
      expect(
        await fetchAll(request, origin, tokenPaths(token, { ...theirs, envelopeId: mine.envelopeId })),
        `${label} (own envelope id)`,
      ).toEqual(notFound);
    }
  }
});

test('[1] staff API downloads: owner bytes as upstream, named signed only for COMPLETED; other teams get nothing', async ({
  request,
}) => {
  // Upstream keeps the sealed rejection record available to the owner; it is named rejected, not signed.
  const plain = /(?<!_signed|_rejected|_pending)\.pdf$/;
  const expected: Record<State, { signed: [string, RegExp]; original: [string, RegExp] }> = {
    PENDING: { signed: ['ORIGINAL', plain], original: ['ORIGINAL', plain] },
    CANCELLED: { signed: ['ORIGINAL', plain], original: ['ORIGINAL', plain] },
    REJECTED: { signed: ['SEALED', /_rejected\.pdf$/], original: ['ORIGINAL', plain] },
    COMPLETED: { signed: ['SEALED', /_signed\.pdf$/], original: ['ORIGINAL', plain] },
  };
  const outsider = await seedUser();
  const { token: outsiderToken } = await createApiToken({
    userId: outsider.user.id,
    teamId: outsider.team.id,
    tokenName: 'r3-outsider',
    expiresIn: null,
  });

  for (const state of STATES) {
    const envelope = await seedEnvelope(state);
    const { token } = await createApiToken({
      userId: envelope.user.id,
      teamId: envelope.team.id,
      tokenName: 'r3',
      expiresIn: null,
    });

    for (const version of ['signed', 'original'] as const) {
      const url = `${STAFF}/api/v2/envelope/item/${envelope.itemId}/download?version=${version}`;
      const res = await request.get(url, { headers: { authorization: `Bearer ${token}` } });
      const [want, name] = expected[state][version];
      expect(await bytes(res), `${state} ${version}`).toBe(want);
      expect(filename(res), `${state} ${version}`).toMatch(name);

      const foreign = await request.get(url, { headers: { authorization: `Bearer ${outsiderToken}` } });
      expect(foreign.status(), `${state} ${version}: another team's API token`).not.toBe(200);
      expect((await foreign.body()).includes(ORIGINAL.subarray(0, 512)), 'no bytes for another team').toBe(false);
    }
  }
});

test('[9] recipient page loaders of a rejected database-backed document carry no PDF bytes, documentData or keys', async ({
  request,
}) => {
  const leaks = (envelope: Seeded) => [
    // SEALED is ORIGINAL plus a trailer, so its own tail is what tells the two apart.
    ['sealed bytes', SEALED_64.slice(-40)],
    ['original bytes', ORIGINAL_64.slice(ORIGINAL_64.length / 2, ORIGINAL_64.length / 2 + 64)],
    ['sealed storage key', envelope.keys.data],
    ['original storage key', envelope.keys.initialData],
    ['initialData field', 'initialData'],
  ];

  for (const storage of ['BYTES_64', 'S3_PATH'] as const) {
    const envelope = await seedEnvelope('REJECTED', storage);

    for (const origin of listeners()) {
      // The other recipient of a rejected V1 envelope gets the signing page itself (the leak path of r2 [9]); every
      // recipient gets the completion page. `.data` is the loader's serialized response, the HTML embeds the same.
      for (const page of [`/sign/${envelope.otherToken}`, `/sign/${envelope.otherToken}/complete`, `/sign/${envelope.rejecterToken}/complete`]) {
        for (const url of [page, `${page}.data`]) {
          const res = await request.get(`${origin}${url}`, { maxRedirects: 0 });
          const body = await res.text();
          const label = `${storage} ${url} via ${origin}`;
          expect(res.status(), label).toBe(200);
          // Control: this is the loader's answer for THIS envelope, not an error page.
          expect(body, label).toContain(envelope.title);

          for (const [what, needle] of leaks(envelope)) {
            expect(body.includes(needle), `${label}: ${what}`).toBe(false);
          }
        }
      }
    }
  }
});
