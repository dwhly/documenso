import type Stripe from 'stripe';
import type { INTERNAL_CLAIM_ID, InternalClaim } from '@documenso/lib/types/subscription';
import { unsupported } from '../../unsupported';
type ClaimPrice = Stripe.Price & { product: Stripe.Product; isVisibleInApp: boolean; friendlyPrice: string };
export type InternalClaimPlans = Record<INTERNAL_CLAIM_ID, InternalClaim & { monthlyPrice?: ClaimPrice; yearlyPrice?: ClaimPrice }>;
export const getInternalClaimPlans = async (): Promise<InternalClaimPlans> => unsupported();
