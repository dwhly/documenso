import procedures from './procedures.json';
import pages from './pages.json';
import hono from './hono.json';

export const procedureInventory = procedures;
export const procedurePolicy = new Map(procedures.map((entry) => [entry.name, entry]));
export const publicProcedures = new Set(
  procedures.filter((entry) => entry.classification === 'recipient').map((entry) => entry.name),
);
export const widensAccess = (name: string) => procedurePolicy.get(name)?.widensAccess ?? true;

const matches = (pattern: string, path: string) => {
  const expression = pattern
    .split('/')
    .map((part, index) => {
      const slash = index > 0 ? '/' : '';
      if (part.startsWith(':') && part.endsWith('?')) {
        return `(?:${slash}[^/]+)?`;
      }
      const segment =
        part.startsWith(':') || part.startsWith('{')
          ? '[^/]+'
          : part === '*'
            ? '.*'
            : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return slash + segment;
    })
    .join('');
  return new RegExp(`^${expression}/?$`).test(path);
};

export const routeDecision = (method: string, rawPath: string, hasBearer = false, remoteAddress?: string) => {
  let path: string;
  try {
    path = decodeURIComponent(rawPath).replace(/\.data$/, '');
    if (path === '/_root') {
      path = '/';
    }
  } catch {
    return 'denied';
  }
  if (path.includes('\\') || path.includes('//')) {
    return 'denied';
  }
  if (path.startsWith('/api/jobs/')) {
    return method === 'POST' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress ?? '')
      ? 'internal'
      : 'denied';
  }
  if (/^\/api\/(v1|csc|ai)(\/|$)/.test(path)) {
    return 'denied';
  }
  if (path.startsWith('/api/trpc/')) {
    const names = path.slice('/api/trpc/'.length).split(',');
    if (!names.length || names.some((name) => !procedurePolicy.has(name))) {
      return 'denied';
    }
    const entries = names.map((name) => procedurePolicy.get(name)!);
    if (
      entries.some(
        (entry) =>
          entry.classification === 'denied' ||
          (hasBearer && ['human', 'operator', 'plumbing'].includes(entry.classification)),
      )
    ) {
      return 'denied';
    }
    if (entries.some((entry) => entry.classification === 'operator')) {
      return 'operator';
    }
    return 'allowed';
  }
  if (path.startsWith('/api/deal/')) {
    if (path === '/api/deal/openapi.json') {
      return 'allowed';
    }
    const name = path.slice('/api/deal/'.length).replaceAll('/', '.');
    const entry = procedurePolicy.get(name);
    return entry?.classification === 'deal' && !entry.openapi && method === 'POST' ? 'allowed' : 'denied';
  }
  if (/^\/api\/v2(?:-beta)?\//.test(path)) {
    const localPath = path.replace(/^\/api\/v2(?:-beta)?/, '');
    if (localPath === '/openapi.json' && method === 'GET') {
      return 'allowed';
    }
    const entry = procedures.find(
      (entry) => entry.openapi && entry.openapi.method === method && matches(entry.openapi.path, localPath),
    );
    return entry && ['deal', 'recipient'].includes(entry.classification) ? 'allowed' : 'denied';
  }
  if (path.startsWith('/api/auth/') || path.startsWith('/api/files/')) {
    const entries = hono.filter((entry) => entry.method === method && matches(entry.path, path));
    return entries.length && entries.every((entry) => entry.classification !== 'denied') ? 'allowed' : 'denied';
  }
  if (path.startsWith('/api/')) {
    const safePages = [
      '/api/avatar/:id',
      '/api/branding/logo/organisation/:orgId',
      '/api/branding/logo/team/:teamId',
      '/api/health',
      '/api/certificate-status',
      '/api/limits',
      '/api/locale',
      '/api/preferred-team',
      '/api/theme',
    ];
    return safePages.some((pattern) => matches(pattern, path)) ? 'allowed' : 'denied';
  }
  if (/^\/(assets|fonts|static|chief)\//.test(path) || /^\/(favicon|apple-)/.test(path) || path === '/__manifest') {
    return 'allowed';
  }
  const entry = pages.find((entry) => matches(entry.path, path));
  return entry && entry.classification !== 'denied' ? 'allowed' : 'denied';
};

export const containsExcludedFeature = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.entries(value).some(([key, item]) => {
    if (['actionAuth', 'globalActionAuth', 'authOptions'].includes(key) && item) {
      const options = Array.isArray(item) ? item : [item];
      if (
        options.some((option) =>
          typeof option === 'string'
            ? option !== 'EXPLICIT_NONE'
            : typeof option === 'object' && option && Object.keys(option).length > 0 && option.type !== 'EXPLICIT_NONE',
        )
      ) {
        return true;
      }
    }
    if (key === 'signatureLevel' && item !== 'SES') {
      return true;
    }
    return containsExcludedFeature(item);
  });
};

export const isRecipientRequest = (method: string, rawPath: string) => {
  let path: string;
  try {
    path = decodeURIComponent(rawPath).replace(/\.data$/, '');
  } catch {
    return false;
  }
  if (path.startsWith('/api/trpc/')) {
    return path
      .slice('/api/trpc/'.length)
      .split(',')
      .every((name) => {
        const entry = procedurePolicy.get(name);
        return entry?.classification === 'recipient' && method === (entry.type === 'query' ? 'GET' : 'POST');
      });
  }
  if (method !== 'GET') {
    return false;
  }
  if (/^\/sign\/[^/]+(?:\/(complete|expired|rejected|waiting))?$/.test(path)) {
    return true;
  }
  if (
    /^\/(assets|fonts|static|chief)\//.test(path) ||
    path === '/__manifest' ||
    path === '/articles/signature-disclosure'
  ) {
    return true;
  }
  if (/^\/api\/branding\/logo\/(team|organisation)\/[^/]+$/.test(path)) {
    return true;
  }
  return hono.some(
    (entry) => entry.classification === 'recipient' && entry.method === 'GET' && matches(entry.path, path),
  );
};
