import { Hono } from 'hono';
export const csc = new Hono().all('*', (context) => context.json({ error: 'NOT_SUPPORTED' }, 501));
