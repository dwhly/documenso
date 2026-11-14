import { jobs } from '@documenso/lib/jobs/client';
import { mapSecondaryIdToDocumentId } from '@documenso/lib/utils/envelope';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, PrismaClient, SigningStatus } from '@documenso/prisma/client';
import { seedPendingDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { nanoid } from 'nanoid';

import { testEmail, until, waitForJobsIdle } from './jobs';
import { mailTo } from './mailpit';

// Fleet review r4 [13]: replication lag must not discard a valid completion email. run.sh's `replica` phase gives the
// throwaway Postgres a real logical replica (documenso_replica, subscribed to documenso_test) and restarts the server
// with NEXT_PRIVATE_DATABASE_REPLICA_URLS pointing at it. This spec pauses the subscription, so the replica keeps
// saying PENDING while the real seal job commits COMPLETED on the primary, then checks the mail the server sent.

const REPLICA_URL = process.env.CHIEF_E2E_REPLICA_URL ?? '';

test.skip(!REPLICA_URL, 'replica phase only (chief/inventory/e2e/run.sh --phase replica)');

test('[13] a completion email is sent even while the read replica still says PENDING', async () => {
  const replica = new PrismaClient({ datasourceUrl: REPLICA_URL });
  const email = (who: string) => testEmail('r4-lag', who);
  const signer = email('signer');
  const { user, team } = await seedUser({ email: email('owner') });
  const envelope = await seedPendingDocument(user, team.id, [signer], { key: `r4-lag-${nanoid(6)}` });
  await prisma.recipient.updateMany({
    where: { envelopeId: envelope.id },
    data: { signingStatus: SigningStatus.SIGNED, signedAt: new Date() },
  });

  try {
    // The replica has caught up with the signed, still PENDING envelope...
    await until('the replica has the signed envelope', async () => {
      const r = await replica.recipient.findMany({ where: { envelopeId: envelope.id } });

      return r.length === 1 && r[0].signingStatus === SigningStatus.SIGNED;
    });

    // ...and then stops applying changes (replication lag).
    await replica.$executeRawUnsafe('ALTER SUBSCRIPTION chief_e2e DISABLE');
    await until('the subscription worker stopped', async () => {
      const [row] = await replica.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM pg_stat_subscription WHERE subname = 'chief_e2e' AND pid IS NOT NULL`;

      return row.n === 0;
    });

    const start = new Date();
    await jobs.triggerJob({
      name: 'internal.seal-document',
      payload: { documentId: mapSecondaryIdToDocumentId(envelope.secondaryId) },
    });
    await waitForJobsIdle(start);

    const primary = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
    const lagging = await replica.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
    expect(primary.status, 'primary: the seal committed').toBe(DocumentStatus.COMPLETED);
    expect(lagging.status, 'replica: still lagging').toBe(DocumentStatus.PENDING);

    const scheduled = await prisma.backgroundJob.findMany({
      where: { jobId: 'send.document.completed.emails', payload: { path: ['envelopeId'], equals: envelope.id } },
    });
    expect(scheduled.map((j) => j.status), 'the completion-email job ran').toEqual(['COMPLETED']);

    for (const to of [signer, user.email]) {
      const mail = await mailTo([to]);
      expect(mail.map((m) => m.subject), to).toEqual([expect.stringMatching(/Signing complete!/i)]);
      expect(mail[0].attachments, to).toEqual([expect.stringMatching(/\.pdf \(application\/pdf\)$/)]);
    }
  } finally {
    await replica.$executeRawUnsafe('ALTER SUBSCRIPTION chief_e2e ENABLE');
    await replica.$disconnect();
  }
});
