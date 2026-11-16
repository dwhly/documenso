import { env } from '@documenso/lib/utils/env';

/** @deprecated Configure NEXT_PUBLIC_FLEET_SEND_URL; retained for existing deployments. */
export const DEPRECATED_SEND_URL_KEY = 'NEXT_PUBLIC_AMFORGE_SEND_URL';

let warned = false;
export const fleetSendUrl = () => {
  const url = env('NEXT_PUBLIC_FLEET_SEND_URL') || env(DEPRECATED_SEND_URL_KEY);
  if (!url && typeof window === 'undefined' && !warned) {
    warned = true;
    console.warn('NEXT_PUBLIC_FLEET_SEND_URL is unset; hiding the Rooms tab');
  }
  return url;
};
