import { timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { isRecipientRequest } from './policy';

type Fetch = (request: Request, ...args: any[]) => Response | Promise<Response>;
const SIGNED_OUT_SESSION = { json: { isAuthenticated: false, session: null, user: null } };

export const TOKEN_ONLY_PROCEDURES = [
  'envelope.recipient.report', 'envelope.field.sign', 'envelope.signingStatus',
  'document.getDocumentByToken', 'field.signFieldWithToken', 'field.removeSignedFieldWithToken',
  'recipient.completeDocumentWithToken', 'recipient.rejectDocumentWithToken',
];
export const DUAL_MODE_PROCEDURES = ['envelope.item.getManyByToken', 'envelope.attachment.find'];

const readProxyKey = () => {
  try {
    return readFileSync(process.env.FLEET_PROXY_KEY_FILE ?? '', 'utf8').trim();
  } catch {
    return '';
  }
};

export const recipientFetch = (fetch: Fetch, keyProvider = readProxyKey): Fetch =>
  (request, ...args) => {
    const key = keyProvider()?.trim();
    if (!key) {
      return Response.json({ error: 'Signing is temporarily unavailable' }, { status: 503 });
    }
    const supplied = request.headers.get('x-fleet-proxy-key') ?? '';
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(hash(key), hash(supplied))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.delete('x-fleet-proxy-key');
    headers.set('x-chief-recipient-listener', '1');
    const clean = new Request(request, { headers });
    const { pathname } = new URL(clean.url);
    if (clean.method === 'GET' && pathname === '/api/auth/session-json') {
      return Response.json(SIGNED_OUT_SESSION, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!isRecipientRequest(clean.method, pathname)) {
      return Response.json({ error: 'Recipient route required' }, { status: 404 });
    }
    return fetch(clean, ...args);
  };

const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parsedInput = async (request: Request, url: URL) => {
  const raw = request.method === 'GET' ? url.searchParams.get('input') : await request.clone().text();
  if (!raw || raw.length > 1024 * 1024) {
    throw new Error('Invalid input');
  }
  return JSON.parse(raw);
};

// EDD §4.2 (a)–(e): token authority is accepted only through Send's private listener.
export const staffFetch = (fetch: Fetch): Fetch => async (request, ...args) => {
  const deny = () => Response.json({ error: 'Open the link in your Fleet Dealroom email' }, { status: 404 });
  const url = new URL(request.url);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).replace(/\/$/, '').replace(/\.data$/, '');
    if (path.includes('\\') || path.includes('//') || path.includes('%')) {
      return deny();
    }
    if (/^\/sign\/[^/]+(?:\/(complete|expired|rejected|waiting))?$/.test(path) ||
        path.startsWith('/api/files/token/')) {
      return deny();
    }
    if (path.startsWith('/api/trpc/')) {
      const names = path.slice('/api/trpc/'.length).split(',');
      if (names.some((name) => TOKEN_ONLY_PROCEDURES.includes(name))) {
        return deny();
      }
      if (names.some((name) => DUAL_MODE_PROCEDURES.includes(name))) {
        const input = await parsedInput(request, url);
        for (const [index, name] of names.entries()) {
          if (!DUAL_MODE_PROCEDURES.includes(name)) {
            continue;
          }
          const member = url.searchParams.get('batch') === '1' ? input?.[String(index)] : input;
          const value = member?.json;
          if (!object(value) || 'token' in value || value.access?.type === 'recipient') {
            return deny();
          }
          if (name === 'envelope.item.getManyByToken' && value.access?.type !== 'user') {
            return deny();
          }
        }
      }
    }
    if (/^\/api\/v2(?:-beta)?\/envelope\/attachment$/.test(path)) {
      const value = request.method === 'GET'
        ? Object.fromEntries(url.searchParams)
        : JSON.parse(await request.clone().text());
      if (!object(value) || 'token' in value) {
        return deny();
      }
    }
  } catch {
    return deny();
  }
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name === 'forwarded' || name.startsWith('x-forwarded-') ||
        ['x-real-ip', 'x-client-ip', 'cf-connecting-ip', 'true-client-ip', 'x-fleet-proxy-key',
          'x-chief-recipient-listener'].includes(name)) {
      headers.delete(name);
    }
  }
  const publicUrl = process.env.NEXT_PUBLIC_WEBAPP_URL;
  if (publicUrl) {
    const staffOrigin = new URL(publicUrl);
    headers.set('x-forwarded-host', staffOrigin.host);
    headers.set('x-forwarded-proto', staffOrigin.protocol.replace(':', ''));
  }
  return fetch(new Request(request, { headers }), ...args);
};
