import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { jobs } from '@documenso/lib/jobs/client';
import { createWebhook } from '@documenso/lib/server-only/webhooks/create-webhook';
import { mapSecondaryIdToDocumentId } from '@documenso/lib/utils/envelope';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, PrismaClient, SigningStatus, WebhookTriggerEvents } from '@documenso/prisma/client';
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
// Review r5 [18]: the team also has a registered DOCUMENT_COMPLETED webhook pointing at a local HTTP sink in this
// process (test.env lets the server deliver to 127.0.0.1), and the payload the server actually delivered must say
// COMPLETED with completedAt set, not the replica's PENDING/null.

type Delivery = { event: string; payload: { envelopeId: string; status: string; completedAt: string | null } };

/** A loopback HTTP sink that records every webhook delivery (JSON body) it receives. */
const startWebhookSink = async () => {
  const deliveries: Delivery[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      deliveries.push(JSON.parse(body) as Delivery);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/documenso`,
    deliveries,
    close: async () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

const REPLICA_URL = process.env.CHIEF_E2E_REPLICA_URL ?? '';

test.skip(!REPLICA_URL, 'replica phase only (chief/inventory/e2e/run.sh --phase replica)');

test('[13][r5 18] the completion email and webhook are right even while the read replica still says PENDING', async () => {
  const replica = new PrismaClient({ datasourceUrl: REPLICA_URL });
  const sink = await startWebhookSink();
  const email = (who: string) => testEmail('r4-lag', who);
  const signer = email('signer');
  const { user, team } = await seedUser({ email: email('owner') });
  const envelope = await seedPendingDocument(user, team.id, [signer], { key: `r4-lag-${nanoid(6)}` });
  await prisma.recipient.updateMany({
    where: { envelopeId: envelope.id },
    data: { signingStatus: SigningStatus.SIGNED, signedAt: new Date() },
  });

  const webhook = await createWebhook({
    webhookUrl: sink.url,
    eventTriggers: [WebhookTriggerEvents.DOCUMENT_COMPLETED],
    secret: null,
    enabled: true,
    userId: user.id,
    teamId: team.id,
  });

  try {
    // The replica has caught up with the signed, still PENDING envelope and the registered webhook...
    await until('the replica has the signed envelope and the webhook', async () => {
      const r = await replica.recipient.findMany({ where: { envelopeId: envelope.id } });
      const hook = await replica.webhook.findUnique({ where: { id: webhook.id } });

      return r.length === 1 && r[0].signingStatus === SigningStatus.SIGNED && hook !== null;
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
    expect(
      scheduled.map((j) => j.status),
      'the completion-email job ran',
    ).toEqual(['COMPLETED']);

    for (const to of [signer, user.email]) {
      const mail = await mailTo([to]);
      expect(
        mail.map((m) => m.subject),
        to,
      ).toEqual([expect.stringMatching(/Signing complete!/i)]);
      expect(mail[0].attachments, to).toEqual([expect.stringMatching(/\.pdf \(application\/pdf\)$/)]);
    }

    // [18] The DOCUMENT_COMPLETED webhook the server delivered describes the committed state, not the replica's.
    expect(
      sink.deliveries.map((d) => ({
        event: d.event,
        envelopeId: d.payload.envelopeId,
        status: d.payload.status,
        completedAt: d.payload.completedAt === null ? null : 'set',
      })),
      'webhook deliveries',
    ).toEqual([
      {
        event: WebhookTriggerEvents.DOCUMENT_COMPLETED,
        envelopeId: envelope.id,
        status: 'COMPLETED',
        completedAt: 'set',
      },
    ]);
    expect(new Date(sink.deliveries[0].payload.completedAt ?? 0).getTime()).toBe(primary.completedAt?.getTime());
  } finally {
    await replica.$executeRawUnsafe('ALTER SUBSCRIPTION chief_e2e ENABLE');
    await replica.$disconnect();
    await sink.close();
  }
});
