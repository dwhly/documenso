import type Stripe from 'stripe';
import { unsupported } from '../../unsupported';
export const syncStripeCustomerSubscription = async (_options: { customerId: string; bypassClaimUpdate?: boolean }): Promise<void> => unsupported();
