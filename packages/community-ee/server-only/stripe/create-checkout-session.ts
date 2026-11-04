import type Stripe from 'stripe';
import { unsupported } from '../../unsupported';
export const createCheckoutSession = async (_options: { customerId: string; priceId: string; returnUrl: string }): Promise<Stripe.Checkout.Session> => unsupported();
