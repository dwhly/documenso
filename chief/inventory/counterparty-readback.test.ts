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
