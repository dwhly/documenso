import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';

import { isRecipientPublicOrigin } from './public-origin';

/**
 * Fleet (review r2 [2]): the Theme preference POST (/api/theme, a React Router resource route) is a cookie-writing
 * mutation that none of the Hono CSRF mounts cover, and React Router does not origin-check resource-route actions.
 * So the check runs INSIDE the action, which covers every path that reaches it (/api/theme, a trailing slash, an
 * encoded path, the .data form): the browser's Origin must be the staff app origin (NEXT_PUBLIC_WEBAPP_URL), or the
 * recipient origin (CHIEF_RECIPIENT_URL) for a request that really arrived through the recipient listener's public
 * origin. Browsers send Origin on every POST, same-origin included, so a missing Origin is refused too.
 */
export const isThemeOriginAllowed = (request: Request) => {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  if (origin === new URL(NEXT_PUBLIC_WEBAPP_URL()).origin) {
    return true;
  }

  const recipient = process.env.CHIEF_RECIPIENT_URL;

  return Boolean(recipient) && origin === new URL(recipient!).origin && isRecipientPublicOrigin(request);
};

export const THEME_ORIGIN_FORBIDDEN = { message: 'Forbidden', statusCode: 403 } as const;

/** Wraps a theme action: refuse (403, no Set-Cookie) unless the request comes from the staff or recipient origin. */
export const withThemeOriginCheck =
  <A extends { request: Request }, R>(action: (args: A) => R) =>
  async (args: A) => {
    if (!isThemeOriginAllowed(args.request)) {
      return Response.json(THEME_ORIGIN_FORBIDDEN, { status: 403 });
    }

    return await action(args);
  };
