import assert from 'node:assert/strict';
import test from 'node:test';

import { ZGetEditorEnvelopeResponseSchema } from '../../packages/trpc/server/envelope-router/get-editor-envelope.types';
import { ZGetEnvelopeResponseSchema } from '../../packages/trpc/server/envelope-router/get-envelope.types';

// EDD §4.3 r1b requires these persisted settings to survive the authenticated editor read-back schema.
test('C1b release can read back both reminder and expiration settings', () => {
  const settings = {
    reminderSettings: { sendAfter: { disabled: true }, repeatEvery: { disabled: true } },
    envelopeExpirationPeriod: { unit: 'day', amount: 30 },
  };
  const result = ZGetEditorEnvelopeResponseSchema.shape.documentMeta.partial().parse(settings);
  assert.deepEqual(result, settings);
});


test('native GET drops reminders and cannot be used for release read-back', () => {
  const settings = {
    reminderSettings: { sendAfter: { disabled: true }, repeatEvery: { disabled: true } },
    envelopeExpirationPeriod: { unit: 'day', amount: 30 },
  };
  assert.deepEqual(ZGetEnvelopeResponseSchema.shape.documentMeta.partial().parse(settings),
    { envelopeExpirationPeriod: settings.envelopeExpirationPeriod });
});

test('Gate 3 auth arrays are nested in authOptions and post-release mail flags survive native GET', () => {
  const authOptions = { globalAccessAuth: [], globalActionAuth: [] };
  const editor = ZGetEditorEnvelopeResponseSchema.pick({ authOptions: true }).parse({ authOptions });
  assert.deepEqual(editor, { authOptions });
  const flags = Object.fromEntries(['recipientSigningRequest', 'recipientRemoved', 'recipientSigned',
    'documentPending', 'documentCompleted', 'documentDeleted', 'ownerDocumentCompleted',
    'ownerRecipientExpired', 'ownerDocumentCreated'].map((name) => [name, false]));
  const meta = { distributionMethod: 'NONE', emailSettings: flags };
  assert.deepEqual(ZGetEnvelopeResponseSchema.shape.documentMeta.partial().parse(meta), meta);
});
