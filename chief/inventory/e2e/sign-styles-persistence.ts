import assert from 'node:assert/strict';

export const createSigningFixture = async () => {
  assert.equal(
    process.env.NEXT_PRIVATE_DATABASE_URL,
    'postgresql://postgres:sign_styles_test@127.0.0.1:55497/sign_styles_test',
  );
  assert.equal(process.env.NEXT_PRIVATE_DATABASE_REPLICA_URLS || '', '');
  const { prisma } = await import('../../../packages/prisma');
  const { seedUser } = await import('../../../packages/prisma/seed/users');
  const { seedPendingDocumentWithFullFields } = await import('../../../packages/prisma/seed/documents');
  const { signEnvelopeFieldRoute } = await import('../../../packages/trpc/server/envelope-router/sign-envelope-field');
  const { router } = await import('../../../packages/trpc/server/trpc');
  const { logger } = await import('../../../packages/lib/utils/logger');
  const { user, team } = await seedUser({ name: 'Signature test sender', email: `sender-${Date.now()}@example.test` });
  const { recipients } = await seedPendingDocumentWithFullFields({
    owner: user,
    teamId: team.id,
    recipients: ['grace@example.test'],
    fields: ['SIGNATURE'],
    updateDocumentOptions: { internalVersion: 2 },
  });
  const recipient = recipients[0];
  const fieldId = recipient.fields[0].id;
  const signing = router({ sign: signEnvelopeFieldRoute });
  return {
    token: recipient.token,
    fieldId,
    submit: (input: { token: string; value: string }) =>
      signing
        .createCaller({
          user: null,
          session: null,
          teamId: undefined,
          req: new Request('http://127.0.0.1/sign'),
          res: new Response(),
          logger,
          metadata: {
            source: 'app',
            auth: null,
            requestMetadata: { ipAddress: '127.0.0.1', userAgent: 'Sign styles Playwright' },
          },
        })
        .sign({ token: input.token, fieldId, fieldValue: { type: 'SIGNATURE', value: input.value } }),
    read: () => prisma.signature.findUniqueOrThrow({ where: { fieldId } }),
    close: () => prisma.$disconnect(),
  };
};
