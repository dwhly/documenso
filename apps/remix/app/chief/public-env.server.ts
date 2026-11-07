import { createPublicEnv } from '@documenso/lib/utils/env';
import { isRecipientPublicOrigin } from '../../server/chief/public-origin';

/**
 * Pages served on the recipient origin (CHIEF_RECIPIENT_URL, e.g. :9445) must fetch from that origin: the
 * staff origin rejects them (CORS / CSRF), which is what broke the recipient PDF. The public origin honours
 * X-Forwarded-Proto/Host, since the proxy talks plain HTTP to the container.
 */
export const createChiefPublicEnv = (request: Request) => {
  const environment: Record<string, string | undefined> = createPublicEnv();
  const configured = process.env.CHIEF_RECIPIENT_URL;
  if (configured && isRecipientPublicOrigin(request)) {
    environment.NEXT_PUBLIC_WEBAPP_URL = configured;
  }
  return environment;
};
