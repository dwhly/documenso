import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { jobs } from '@documenso/lib/jobs/client';
import { cancelDocument } from '@documenso/lib/server-only/document/cancel-document';
import { rejectDocumentWithToken } from '@documenso/lib/server-only/document/reject-document-with-token';
import { createApiToken } from '@documenso/lib/server-only/public-api/create-api-token';
import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { mapSecondaryIdToDocumentId } from '@documenso/lib/utils/envelope';
import { prisma } from '@documenso/prisma';
import {
  DocumentStatus,
  PrismaClient,
  ReadStatus,
  RecipientRole,
  SendStatus,
  SigningStatus,
} from '@documenso/prisma/client';
import { seedPendingDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { nanoid } from 'nanoid';

import { testEmail, until, waitForJobsIdle } from './jobs';
import { mailTo } from './mailpit';

// Fleet review r4 [12]: terminal status transitions are conditional and atomic. Each race is driven for real against
// the throwaway database: the seal and email jobs run in the server (dispatched to its /api/jobs endpoint, mail read
// back from the stack's sink); cancellation and rejection run in this process. The interleaving is forced, never
// simulated: either this process's cancel/reject is held right before its write transaction (it has already read
// PENDING), or a row lock this test holds parks the server's seal right after it read PENDING.

const email = (who: string) => testEmail('r4', who);
const META: ApiRequestMetadata = { requestMetadata: {}, source: 'app', auth: 'session' };

const completionMail = (mail: Awaited<ReturnType<typeof mailTo>>) =>
  mail.filter((m) => /Signing complete!/i.test(m.subject) || m.attachments.some((a) => /pdf/i.test(a)));
const cancellationMail = (mail: Awaited<ReturnType<typeof mailTo>>) => mail.filter((m) => /Cancell?ed/i.test(m.subject));
const rejectionMail = (mail: Awaited<ReturnType<typeof mailTo>>) =>
  mail.filter((m) => /Rejection Confirmed|Rejected by/i.test(m.subject));

/**
 * Hold the NEXT `prisma.$transaction` call of this process (one call only) until `release()`. `reached` resolves
 * once the caller is parked there, i.e. it finished every read that came before its write transaction.
 */
const holdNextTransaction = () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const client = prisma as unknown as { $transaction: (...args: unknown[]) => Promise<unknown> };
  const original = client.$transaction;
  let reached!: () => void;
  let release!: () => void;
  const reachedP = new Promise<void>((resolve) => (reached = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));

  client.$transaction = async (...args: unknown[]) => {
    client.$transaction = original;
    reached();
    await released;

    return original.apply(prisma, args);
  };

  return { reached: reachedP, release, restore: () => (client.$transaction = original) };
};

/** Seed a PENDING envelope whose signers have all signed, i.e. ready for the seal job. */
const seedSignedPending = async (key: string, signers: string[]) => {
  const { user, team } = await seedUser({ email: email(`${key}-owner`) });
  const envelope = await seedPendingDocument(user, team.id, signers, { key: `r4-${key}-${nanoid(6)}` });
  await prisma.recipient.updateMany({
    where: { envelopeId: envelope.id },
    data: { signingStatus: SigningStatus.SIGNED, signedAt: new Date() },
  });

  return { user, team, envelope, documentId: mapSecondaryIdToDocumentId(envelope.secondaryId) };
};

const statusOf = async (id: string) => (await prisma.envelope.findUniqueOrThrow({ where: { id } })).status;

test('[12] a cancellation that read PENDING cannot overwrite the COMPLETED a seal committed meanwhile', async () => {
  const signer = email('signer');
  const { user, team, envelope, documentId } = await seedSignedPending('cancel', [signer]);
  const start = new Date();

  // 1. Cancellation reads PENDING, passes its visibility/permission/status checks, and is held before its write.
  const hold = holdNextTransaction();
  const cancelling = cancelDocument({
    id: { type: 'envelopeId', id: envelope.id },
    userId: user.id,
    teamId: team.id,
    reason: 'r4 race',
    requestMetadata: META,
  }).then(
    () => 'cancelled' as const,
    (error: unknown) => error,
  );
  await Promise.race([
    hold.reached,
    cancelling.then((outcome) => {
      throw new Error(`cancel finished before its write transaction: ${String(outcome)}`);
    }),
  ]);

  // 2. Meanwhile the real seal job commits COMPLETED and the completion email goes out.
  await jobs.triggerJob({ name: 'internal.seal-document', payload: { documentId } });
  await waitForJobsIdle(start);
  expect(await statusOf(envelope.id), 'the seal committed').toBe(DocumentStatus.COMPLETED);
  expect(completionMail(await mailTo([signer])), 'completion email sent').toHaveLength(1);

  // 3. The stale cancellation resumes.
  hold.release();
  const outcome = await cancelling;
  await waitForJobsIdle(start);

  const mail = await mailTo([signer, user.email]);
  const observed = {
    cancel: outcome instanceof AppError ? `AppError ${outcome.code}` : outcome,
    status: await statusOf(envelope.id),
    completionEmails: completionMail(mail).length,
    cancellationEmails: cancellationMail(mail).map((m) => m.subject),
    cancellationAuditEntries: await prisma.documentAuditLog.count({
      where: { envelopeId: envelope.id, type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_CANCELLED },
    }),
  };

  // The stale cancellation fails; the envelope stays COMPLETED; only the completion emails (signer + owner) went out.
  expect(observed).toEqual({
    cancel: `AppError ${AppErrorCode.INVALID_REQUEST}`,
    status: DocumentStatus.COMPLETED,
    completionEmails: 2,
    cancellationEmails: [],
    cancellationAuditEntries: 0,
  });
});

test('[12] a seal that read PENDING cannot turn a cancellation committed meanwhile into COMPLETED', async () => {
  const signer = email('signer2');
  const ccEmail = email('cc2');
  const { user, team, envelope, documentId } = await seedSignedPending('seal', [signer]);
  const cc = await prisma.recipient.create({
    data: {
      email: ccEmail,
      name: 'cc',
      token: nanoid(),
      role: RecipientRole.CC,
      readStatus: ReadStatus.OPENED,
      sendStatus: SendStatus.SENT,
      signingStatus: SigningStatus.NOT_SIGNED,
      envelopeId: envelope.id,
    },
  });
  const originalDataId = envelope.envelopeItems[0].documentDataId;

  // 1. Lock the CC recipient row. The seal reads the envelope (PENDING) and then marks CC recipients signed, so it
  //    parks on this lock right after its read. Nothing in the cancellation path writes that row.
  const locker = new PrismaClient({ datasourceUrl: process.env.NEXT_PRIVATE_DATABASE_URL });
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let holderPid = 0;
  let locked!: () => void;
  const lockedP = new Promise<void>((resolve) => (locked = resolve));
  const holding = locker.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      holderPid = row.pid;
      await tx.$queryRaw`SELECT "id" FROM "Recipient" WHERE "id" = ${cc.id} FOR UPDATE`;
      locked();
      await released;
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
  await lockedP;

  try {
    const start = new Date();
    await jobs.triggerJob({ name: 'internal.seal-document', payload: { documentId } });
    await until('the seal job is parked on the CC row lock', async () => {
      const [row] = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${holderPid}::int = ANY(pg_blocking_pids(pid))`;

      return row.n > 0;
    });

    // 2. The cancellation commits while the seal is in flight.
    await cancelDocument({
      id: { type: 'envelopeId', id: envelope.id },
      userId: user.id,
      teamId: team.id,
      reason: 'r4 cancel during seal',
      requestMetadata: META,
    });
    expect(await statusOf(envelope.id)).toBe(DocumentStatus.CANCELLED);

    // 3. The seal resumes with its stale PENDING read.
    release();
    await holding;
    await waitForJobsIdle(start);
  } finally {
    release();
    await holding.catch(() => undefined);
    await locker.$disconnect();
  }

  const after = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id }, include: { envelopeItems: true } });
  const mail = await mailTo([signer, ccEmail, user.email]);

  // The cancellation stands, the superseded seal stored no artifact, nobody got a completion email or the PDF.
  expect({
    status: after.status,
    sealedArtifactStored: after.envelopeItems[0].documentDataId !== originalDataId,
    completionEmails: completionMail(mail).map((m) => `${m.to.join(',')}: ${m.subject} [${m.attachments.join(', ')}]`),
    cancellationEmails: cancellationMail(mail).length,
  }).toEqual({
    status: DocumentStatus.CANCELLED,
    sealedArtifactStored: false,
    completionEmails: [],
    cancellationEmails: 1,
  });
});

test('[12] a rejection that read PENDING fails once a cancellation committed (no reseal, no rejection emails)', async () => {
  const [rejecter, other] = [email('rejecter3'), email('other3')];
  const { user, team } = await seedUser({ email: email('owner3') });
  const envelope = await seedPendingDocument(user, team.id, [rejecter, other], { key: `r4-reject-${nanoid(6)}` });
  const token = envelope.recipients.find((r) => r.email === rejecter)!.token;
  const start = new Date();

  // 1. The rejection reads PENDING / NOT_SIGNED and is held before its write.
  const hold = holdNextTransaction();
  const rejecting = rejectDocumentWithToken({ token, id: { type: 'envelopeId', id: envelope.id }, reason: 'r4' }).then(
    () => 'rejected' as const,
    (error: unknown) => error,
  );
  await Promise.race([
    hold.reached,
    rejecting.then((outcome) => {
      throw new Error(`reject finished before its write transaction: ${String(outcome)}`);
    }),
  ]);

  // 2. The owner cancels meanwhile.
  await cancelDocument({
    id: { type: 'envelopeId', id: envelope.id },
    userId: user.id,
    teamId: team.id,
    reason: 'r4 cancel during reject',
    requestMetadata: META,
  });

  // 3. The stale rejection resumes.
  hold.release();
  const outcome = await rejecting;
  await waitForJobsIdle(start);

  const after = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id }, include: { recipients: true } });

  // The stale rejection fails: the cancellation stands, the recipient is untouched, no rejection emails.
  expect({
    reject: outcome instanceof AppError ? `AppError ${outcome.code}` : outcome,
    status: after.status,
    rejecter: after.recipients.find((r) => r.email === rejecter)?.signingStatus,
    rejectionEmails: rejectionMail(await mailTo([rejecter, other, user.email])).map((m) => m.subject),
  }).toEqual({
    reject: `AppError ${AppErrorCode.INVALID_REQUEST}`,
    status: DocumentStatus.CANCELLED,
    rejecter: SigningStatus.NOT_SIGNED,
    rejectionEmails: [],
  });
});

test('[12] upstream normal cancel (API v2) still cancels a pending document and notifies its recipients', async ({
  request,
}) => {
  const signer = email('signer4');
  const { user, team } = await seedUser({ email: email('owner4') });
  const envelope = await seedPendingDocument(user, team.id, [signer], { key: `r4-normal-${nanoid(6)}` });
  const { token } = await createApiToken({ userId: user.id, teamId: team.id, tokenName: 'r4', expiresIn: null });
  const start = new Date();

  const cancel = async () =>
    request.post(`${NEXT_PUBLIC_WEBAPP_URL()}/api/v2-beta/envelope/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { envelopeId: envelope.id },
    });

  const res = await cancel();
  expect(res.status(), await res.text()).toBe(200);
  await waitForJobsIdle(start);

  expect(await statusOf(envelope.id)).toBe(DocumentStatus.CANCELLED);
  expect(cancellationMail(await mailTo([signer])), 'the cancellation email went out').toHaveLength(1);

  // A second cancellation is refused (the document is no longer pending) and sends nothing more.
  const again = await cancel();
  expect(again.ok()).toBeFalsy();
  await waitForJobsIdle(start);
  expect(cancellationMail(await mailTo([signer]))).toHaveLength(1);
});
