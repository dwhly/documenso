import { attributionSettings } from '../../../../packages/fleet-ui/fleet-attribution';
import { createPublicEnv } from '@documenso/lib/utils/env';
import { isRecipientPublicOrigin } from '../../server/chief/public-origin';
import { getTenantBrand } from './tenant-brand.server';

export const DEPRECATED_SEND_URL_KEY = 'NEXT_PUBLIC_AMFORGE_SEND_URL';

let warned = false;

/**
 * Pages served on the recipient origin (CHIEF_RECIPIENT_URL, e.g. :9445) must fetch from that origin: the
 * staff origin rejects them (CORS / CSRF), which is what broke the recipient PDF. The public origin honours
 * X-Forwarded-Proto/Host, since the proxy talks plain HTTP to the container.
 */
export const createChiefPublicEnv = (request: Request, authenticated = false) => {
  const environment: Record<string, string | undefined> = createPublicEnv();
  const recipient = isRecipientPublicOrigin(request);
  const pathname = new URL(request.url).pathname;
  const staffPage =
    authenticated &&
    /^\/(?:t|o|dashboard|inbox|settings|admin|p)(?:\/|$)/.test(pathname) &&
    !/^\/t\/[^/]+\/(?:documents|templates)\/[^/]+\/edit\/?$/.test(pathname) &&
    !/^\/o\/[^/]+\/signin\/?$/.test(pathname);
  environment.NEXT_PUBLIC_FLEET_SEND_URL ||= environment[DEPRECATED_SEND_URL_KEY];
  delete environment[DEPRECATED_SEND_URL_KEY];
  if (recipient || !staffPage) {
    delete environment.NEXT_PUBLIC_FLEET_SEND_URL;
  } else if (!environment.NEXT_PUBLIC_FLEET_SEND_URL && !warned) {
    warned = true;
    console.warn('NEXT_PUBLIC_FLEET_SEND_URL is unset; hiding the Rooms tab');
  }
  const configured = process.env.CHIEF_RECIPIENT_URL;
  if (configured && recipient) {
    environment.NEXT_PUBLIC_WEBAPP_URL = configured;
  }
  environment.FLEET_TENANT_BRAND = JSON.stringify({ ...getTenantBrand().brand, attribution: attributionSettings(process.env) });
  return environment;
};
