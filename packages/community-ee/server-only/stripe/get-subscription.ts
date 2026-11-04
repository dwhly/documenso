import type { Subscription } from '@prisma/client';
import type Stripe from 'stripe';
import { unsupported } from '../../unsupported';
export const getSubscription = async (_options: { userId: number; organisationId: string }): Promise<{ organisationSubscription: Subscription; stripeSubscription: Stripe.Subscription }> => unsupported();
