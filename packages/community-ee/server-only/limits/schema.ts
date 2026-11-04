export type TLimitsSchema = { documents: number; recipients: number; directTemplates: number };
export type TLimitsResponseSchema = { quota: TLimitsSchema; remaining: TLimitsSchema; maximumEnvelopeItemCount: number };
