import fs from 'node:fs';
import path from 'node:path';
import { jobs } from '@documenso/lib/jobs/client';
import { rejectDocumentWithToken } from '@documenso/lib/server-only/document/reject-document-with-token';
import { prisma } from '@documenso/prisma';
import { BackgroundJobStatus, DocumentStatus, SigningStatus } from '@documenso/prisma/client';
import { seedCompletedDocument, seedPendingDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { nanoid } from 'nanoid';

import { mailTo } from './mailpit';

// Fleet review r3 [10]: a rejection recovered by the seal sweep must not email its sealed rejection record to anyone
// as "Signing Complete!". Everything runs for real: the jobs are dispatched to the running server's /api/jobs
// endpoint, which runs the real reject, seal, sweep and email handlers against the database and sends through the
// server's SMTP transport into the stack's mail sink.

const examplePdf = fs.readFileSync(path.join(__dirname, '../../../../../assets/example.pdf'));
const email = (who: string) => `r3-${who}-${nanoid(8)}@example.test`.toLowerCase();

/** Wait until every background job created since `since` has finished (completed or failed after its retries). */
const waitForJobsIdle = async (since: Date) => {
  let quiet = 0;

  for (let i = 0; i < 240 && quiet < 4; i++) {
    const busy = await prisma.backgroundJob.count({
      where: {
        submittedAt: { gte: since },
        status: { in: [BackgroundJobStatus.PENDING, BackgroundJobStatus.PROCESSING] },
      },
    });

    quiet = busy === 0 ? quiet + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  expect(quiet, 'background jobs settled').toBeGreaterThanOrEqual(4);
};

const completionMail = (mail: Awaited<ReturnType<typeof mailTo>>) =>
  mail.filter((m) => /Signing complete!/i.test(m.subject) || m.attachments.some((a) => /pdf/i.test(a)));

test('[10] a rejection recovered by the seal sweep sends no "Signing Complete!" email or PDF attachment', async () => {
  const { user, team } = await seedUser({ email: email('owner') });
  const [rejecter, other] = [email('rejecter'), email('other')];
  const envelope = await seedPendingDocument(user, team.id, [rejecter, other], { key: `r3-recovery-${nanoid(6)}` });
  const [item] = envelope.envelopeItems;
  const rejecterToken = envelope.recipients.find((r) => r.email === rejecter)!.token;

  // The initial seal job fails before it commits: here its input (`data`) is unreadable. A reseal starts from
  // `initialData` (the original upload), so the sweep's recovery seal succeeds.
  await prisma.documentData.update({
    where: { id: item.documentDataId },
    data: { data: Buffer.from('not a pdf').toString('base64') },
  });

  const rejectedAt = new Date();
  await rejectDocumentWithToken({ token: rejecterToken, id: { type: 'envelopeId', id: envelope.id }, reason: 'r3' });
  await waitForJobsIdle(rejectedAt);

  const stuck = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
  expect(stuck.status, 'the initial seal failed, the envelope is stuck PENDING').toBe(DocumentStatus.PENDING);

  // Upstream behaviour kept: the reject flow itself announced the rejection (rejecter + owner) and the cancellation.
  const atRejection = await mailTo([rejecter, other, user.email]);
  expect(atRejection.map((m) => m.subject).join('\n')).toMatch(/Rejection Confirmed/);
  expect(atRejection.map((m) => m.subject).join('\n')).toMatch(/Rejected by/);
  expect(completionMail(atRejection)).toEqual([]);

  // 15+ minutes later the sweep finds it (its window is 15 min .. 6 h since the last recipient action).
  await prisma.recipient.updateMany({
    where: { envelopeId: envelope.id },
    data: { signedAt: new Date(Date.now() - 30 * 60_000) },
  });

  const sweptAt = new Date();
  await jobs.triggerJob({ name: 'internal.seal-document-sweep', payload: {} });
  await waitForJobsIdle(sweptAt);

  const sealed = await prisma.envelope.findUniqueOrThrow({
    where: { id: envelope.id },
    include: { envelopeItems: { include: { documentData: true } } },
  });
  expect(sealed.status, 'the sweep sealed the rejection').toBe(DocumentStatus.REJECTED);
  expect(sealed.envelopeItems[0].documentData.data, 'the sealed rejection record is stored').not.toBe(
    Buffer.from('not a pdf').toString('base64'),
  );

  const afterSweep = await mailTo([rejecter, other, user.email]);
  expect(completionMail(afterSweep), 'no completion email / PDF attachment for a rejected envelope').toEqual([]);
});

test('[10] the completion-email worker refuses a REJECTED envelope; a COMPLETED one still gets its email', async () => {
  const { user, team } = await seedUser({ email: email('owner2') });

  // A completion job for a rejected, sealed envelope (e.g. queued by an older build): nothing is sent.
  const [rejecter, other] = [email('rejecter2'), email('other2')];
  const rejected = await seedPendingDocument(user, team.id, [rejecter, other], { key: `r3-worker-${nanoid(6)}` });
  const sealedPdf = Buffer.concat([examplePdf, Buffer.from('\n%fleet-r3 sealed rejection record\n')]).toString('base64');
  await prisma.documentData.update({ where: { id: rejected.envelopeItems[0].documentDataId }, data: { data: sealedPdf } });
  await prisma.recipient.updateMany({
    where: { envelopeId: rejected.id, email: rejecter },
    data: { signingStatus: SigningStatus.REJECTED, rejectionReason: 'r3' },
  });
  await prisma.envelope.update({ where: { id: rejected.id }, data: { status: DocumentStatus.REJECTED, completedAt: new Date() } });

  // Control: the same worker for a COMPLETED envelope sends "Signing Complete!" with the PDF attached.
  const control = await seedUser({ email: email('owner3') });
  const signer = email('signer2');
  const completed = await seedCompletedDocument(control.user, control.team.id, [signer], {
    key: `r3-control-${nanoid(6)}`,
  });

  const triggeredAt = new Date();
  await jobs.triggerJob({ name: 'send.document.completed.emails', payload: { envelopeId: rejected.id } });
  await jobs.triggerJob({ name: 'send.document.completed.emails', payload: { envelopeId: completed.id } });
  await waitForJobsIdle(triggeredAt);

  const rejectedMail = await mailTo([rejecter, other, user.email]);
  expect(completionMail(rejectedMail), 'rejected envelope: no completion email').toEqual([]);

  for (const to of [signer, control.user.email]) {
    const mail = await mailTo([to]);
    expect(mail.map((m) => m.subject), to).toEqual([expect.stringMatching(/Signing complete!/i)]);
    expect(mail[0].attachments, to).toEqual([expect.stringMatching(/\.pdf \(application\/pdf\)$/)]);
  }
});
