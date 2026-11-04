import type Stripe from 'stripe';
import { unsupported } from '../../unsupported';
export const createCustomer = async (_options: { name: string; email: string }): Promise<Stripe.Customer> => unsupported();
