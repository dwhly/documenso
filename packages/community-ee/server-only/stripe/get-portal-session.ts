import type Stripe from 'stripe';
import { unsupported } from '../../unsupported';
export const getPortalSession = async (_options: { customerId: string; returnUrl?: string }): Promise<Stripe.BillingPortal.Session> => unsupported();
