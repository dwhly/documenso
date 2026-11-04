import type Stripe from 'stripe';
import { unsupported } from '../../unsupported';
export const getInvoices = async (_options: { customerId: string }): Promise<Stripe.Invoice[]> => unsupported();
