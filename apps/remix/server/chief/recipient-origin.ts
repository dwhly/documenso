import { isRecipientRequest } from './policy';

export const isRecipientOrigin = (request: Request) => {
  const configured = process.env.CHIEF_RECIPIENT_URL;
  if (!configured) {
    return false;
  }
  const url = new URL(request.url);
  const origin = new URL(configured).origin;
  return url.origin === origin && request.headers.get('origin') === origin && isRecipientRequest(request.method, url.pathname);
};
