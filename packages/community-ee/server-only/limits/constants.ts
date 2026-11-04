import type { TLimitsSchema, TLimitsResponseSchema } from './schema';

// Finite JSON-safe equivalents avoid Infinity becoming null over HTTP.
export const DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT = 2147483647;
export const DEFAULT_RECIPIENT_COUNT = 2147483647;
export const SELFHOSTED_PLAN_LIMITS: TLimitsSchema = Object.freeze({ documents: Number.MAX_SAFE_INTEGER, recipients: DEFAULT_RECIPIENT_COUNT, directTemplates: Number.MAX_SAFE_INTEGER });
export const PAID_PLAN_LIMITS = SELFHOSTED_PLAN_LIMITS;
export const FREE_PLAN_LIMITS = SELFHOSTED_PLAN_LIMITS;
export const INACTIVE_PLAN_LIMITS = SELFHOSTED_PLAN_LIMITS;
export const communityLimits: TLimitsResponseSchema = Object.freeze({ quota: SELFHOSTED_PLAN_LIMITS, remaining: SELFHOSTED_PLAN_LIMITS, maximumEnvelopeItemCount: DEFAULT_MINIMUM_ENVELOPE_ITEM_COUNT });
