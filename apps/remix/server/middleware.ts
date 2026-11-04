import { bodyLimit } from 'hono/body-limit';
import { timingSafeEqual } from 'node:crypto';
import { PREFERRED_TEAM_URL_COOKIE } from '@documenso/lib/constants/cookies';
import { AppDebugger } from '@documenso/lib/utils/debugger';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, Next } from 'hono';
import { setCookie } from 'hono/cookie';

import { containsExcludedFeature, isRecipientRequest, routeDecision } from './chief/policy';
import { handleRedirects } from './redirects';

const limitBody = bodyLimit({ maxSize: 25 * 1024 * 1024 });

const debug = new AppDebugger('Middleware');

/**
 * Middleware for initial page loads.
 *
 * You won't be able to easily handle sequential page loads because they will be
 * called under `path.data`
 *
 * Example an initial page load would be `/documents` then if the user click templates
 * the path here would be `/templates.data`.
 */
export const appMiddleware = async (c: Context, next: Next) => {
  const { req } = c;
  const { path } = req;

  if (req.header('x-chief-recipient-listener') === '1' && !isRecipientRequest(req.method, path)) {
    return c.json({ error: 'Recipient route required' }, 404);
  }

  const decision = routeDecision(req.method, path, Boolean(req.header('authorization')), getConnInfo(c).remote.address);
  if (
    decision === 'denied' ||
    (decision === 'operator' &&
      !operatorKeyMatches(req.header('x-chief-operator-key'), process.env.CHIEF_OPERATOR_KEY))
  ) {
    return c.json({ error: 'This route is not enabled in Chief Sign' }, 404);
  }

  const limited = await limitBody(c, async () => {});
  if (limited) {
    return limited;
  }
  if (req.method === 'POST' && path.startsWith('/api/')) {
    const contentType = (req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const payloads: unknown[] = [];
    try {
      if (contentType === 'application/json') {
        payloads.push(await req.raw.clone().json());
      } else if (contentType === 'multipart/form-data') {
        const form = await req.raw.clone().formData();
        for (const [key, value] of form.entries()) {
          if (typeof value === 'string') {
            const name = key.replace(/\[\]$/, '');
            const parsed = JSON.parse(value);
            payloads.push({ [name]: parsed }, parsed);
          }
        }
      } else {
        return c.json({ error: 'JSON or multipart body required' }, 415);
      }
    } catch {
      return c.json({ error: 'Malformed request body' }, 400);
    }
    if (payloads.some(containsExcludedFeature)) {
      return c.json({ error: 'Document action reauthentication and qualified signatures are not enabled' }, 403);
    }
  }

  // Paths to ignore.
  if (nonPagePathRegex.test(path)) {
    return next();
  }

  // AmForge layout prototype: `?layout=sidebar|topbar` persists the shell preference.
  const layoutParam = req.query('layout');
  const applyLayoutCookie = () => {
    if (layoutParam === 'sidebar' || layoutParam === 'topbar') {
      setCookie(c, 'amforge_layout', layoutParam, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
    }
  };

  // PRE-HANDLER CODE: Place code here to execute BEFORE the route handler runs.
  const redirectPath = handleRedirects(c);

  if (redirectPath) {
    debug.log('Redirecting from', path);
    debug.log('Redirecting to', redirectPath);

    applyLayoutCookie();

    return c.redirect(redirectPath);
  }

  await next();

  applyLayoutCookie();

  // POST-HANDLER CODE: Place code here to execute AFTER the route handler completes.
  // This is useful for:
  // - Setting cookies
  // - Any operations that should happen after all route handlers but before sending the response

  debug.log('Path', path);

  const pathname = path.replace('.data', '');

  // Set the preferred team url cookie if user accesses a team page.
  if (pathname.startsWith('/t/')) {
    debug.log('Setting preferred team url cookie');

    setCookie(c, PREFERRED_TEAM_URL_COOKIE, pathname.split('/')[2], {
      sameSite: 'lax',
    });

    return;
  }
};

// This regex matches any path that:
// 1. Starts with /api/, /ingest/, /__manifest/, or /assets/
// 2. Starts with /apple- (like /apple-touch-icon.png)
// 3. Starts with /favicon (like /favicon.ico)
// The ^ ensures matching from the beginning of the string
// The | acts as OR operator between different patterns
const nonPagePathRegex = /^(\/api\/|\/ingest\/|\/__manifest|\/assets\/|\/apple-.*|\/favicon.*)/;

export const operatorKeyMatches = (provided?: string, expected?: string) => {
  if (!provided || !expected) {
    return false;
  }
  const actual = Buffer.from(provided);
  const secret = Buffer.from(expected);
  return actual.length === secret.length && timingSafeEqual(actual, secret);
};
