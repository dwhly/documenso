import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { createApiToken } from '@documenso/lib/server-only/public-api/create-api-token';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, RecipientRole, SendStatus, SigningStatus } from '@documenso/prisma/client';
import { seedBlankDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { nanoid } from 'nanoid';

import { testEmail, waitForJobsIdle } from './jobs';

// Fleet review r5 [16] (regression guard): upstream's "sendDocument: should complete document immediately when all
// recipients are CC" (packages/app-tests/e2e/api/v1/document-sending.spec.ts:446) run through the chief harness.
// Chief Sign does not serve /api/v1, so this sends through the enabled v2 route (/api/v2/envelope/distribute), which
// calls the same sendDocument(). A CC-only draft is sealed straight away, without ever being PENDING, and must still
// end up COMPLETED.

test('[r5 16] a draft whose recipients are all CC completes immediately when sent', async ({ request }) => {
  const email = (who: string) => testEmail('r5-cc', who);
  const { user, team } = await seedUser({ email: email('owner') });
  const document = await seedBlankDocument(user, team.id);

  // Two CC recipients without fields, created pre-signed as production does.
  for (const who of ['cc1', 'cc2']) {
    await prisma.recipient.create({
      data: {
        email: email(who),
        name: 'Test CC',
        role: RecipientRole.CC,
        signingStatus: SigningStatus.SIGNED,
        sendStatus: SendStatus.SENT,
        token: nanoid(),
        envelopeId: document.id,
      },
    });
  }

  const { token } = await createApiToken({ userId: user.id, teamId: team.id, tokenName: 'r5', expiresIn: null });
  const start = new Date();

  const res = await request.post(`${NEXT_PUBLIC_WEBAPP_URL()}/api/v2/envelope/distribute`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { envelopeId: document.id },
  });
  expect(res.status(), await res.text()).toBe(200);

  // The document seals asynchronously and completes without anyone signing.
  await expect
    .poll(async () => (await prisma.envelope.findUniqueOrThrow({ where: { id: document.id } })).status, {
      timeout: 30_000,
    })
    .toBe(DocumentStatus.COMPLETED);
  await waitForJobsIdle(start);

  const after = await prisma.envelope.findUniqueOrThrow({ where: { id: document.id } });
  expect({ status: after.status, completed: after.completedAt !== null }).toEqual({
    status: DocumentStatus.COMPLETED,
    completed: true,
  });
});
