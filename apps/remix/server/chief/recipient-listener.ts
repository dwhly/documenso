import { isRecipientRequest } from './policy';

/**
 * The recipient origin is a visitor surface: it never exposes a staff session. Documenso's client still
 * polls GET /api/auth/session-json on every navigation, so answer it here with the signed-out shape
 * (superjson-serialised, as the auth route would) instead of a 404 that surfaces as an AppError.
 */
const SIGNED_OUT_SESSION = { json: { isAuthenticated: false, session: null, user: null } };

export const recipientFetch = (fetch: (request: Request, ...args: any[]) => Response | Promise<Response>) =>
  (request: Request, ...args: any[]) => {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname.replace(/\/$/, '').endsWith('/api/auth/session-json')) {
      return Response.json(SIGNED_OUT_SESSION, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!isRecipientRequest(request.method, pathname)) {
      return Response.json({ error: 'Recipient route required' }, { status: 404 });
    }
    return fetch(request, ...args);
  };
