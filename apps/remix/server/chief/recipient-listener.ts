import { isRecipientRequest } from './policy';

export const recipientFetch = (fetch: (request: Request, ...args: any[]) => Response | Promise<Response>) =>
  (request: Request, ...args: any[]) => {
    if (!isRecipientRequest(request.method, new URL(request.url).pathname)) {
      return Response.json({ error: 'Recipient route required' }, { status: 404 });
    }
    return fetch(request, ...args);
  };
