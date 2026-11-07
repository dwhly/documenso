/**
 * The origin the browser used, behind a TLS-terminating proxy. tailscale serve (and the nginx in front of
 * Send) speak plain HTTP to the container, so `request.url` is `http://<host>`; they report the real scheme
 * and host in X-Forwarded-Proto / X-Forwarded-Host (tailscale serve overwrites any client-sent values).
 * Only the first value of a comma-joined header counts (the hop closest to the browser).
 */
const firstValue = (value: string | null) => value?.split(',')[0]?.trim() || null;

export const requestPublicOrigin = (request: Request) => {
  const url = new URL(request.url);
  const proto = firstValue(request.headers.get('x-forwarded-proto'))?.replace(/:$/, '') || url.protocol.replace(/:$/, '');
  const host = firstValue(request.headers.get('x-forwarded-host')) || request.headers.get('host') || url.host;

  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return url.origin;
  }
};

/** True when the request reached us through the configured recipient origin (CHIEF_RECIPIENT_URL). */
export const isRecipientPublicOrigin = (request: Request) => {
  const configured = process.env.CHIEF_RECIPIENT_URL;

  if (!configured) {
    return false;
  }

  return requestPublicOrigin(request) === new URL(configured).origin;
};
