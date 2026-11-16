import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = [
  'apps/remix/app',
  'apps/remix/server',
  'apps/remix/public/chief',
  'packages/fleet-ui',
  'packages/email',
  'packages/ui',
  'packages/lib',
  'chief/branding.ts',
];
const suffixes = /\.(ts|tsx|css|js|json|svg|html|mjs|cjs|txt)$/;

const normalizeColours = (value: string) =>
  value
    .toLowerCase()
    .replace(/#[a-f0-9]{6}(?![a-f0-9])|#[a-f0-9]{3}(?![a-f0-9])/g, (hex) =>
      hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex,
    );

export const scan = (root: string, environment: Record<string, string | undefined> = process.env) => {
  const needles = [
    'Acme Test Co',
    ...[
      environment.FLEET_TEST_TENANT_NAMES,
      environment.FLEET_TEST_TENANT_COLOURS,
      environment.FLEET_TEST_TENANT_DOMAINS,
    ].flatMap((v) => (v ?? '').split(',')),
  ]
    .map((v) => normalizeColours(v.trim()))
    .filter(Boolean);
  const hits: string[] = [];
  for (const relative of roots) {
    const target = path.join(root, relative);
    if (!existsSync(target)) {
      continue;
    }
    const files = statSync(target).isFile()
      ? [target]
      : readdirSync(target, { recursive: true }).map((p) => path.join(target, String(p)));
    for (const file of files) {
      if (
        !statSync(file).isFile() ||
        !suffixes.test(file) ||
        /(?:^|\/)(?:fixtures|__tests__)(?:\/|$)|\.test\./.test(file)
      ) {
        continue;
      }
      let source = readFileSync(file, 'utf8');
      // One exact declaration at one path. Extra literals, duplicate declarations and other files still fail.
      if (path.relative(root, file) === 'apps/remix/app/chief/fleet-send-url.ts') {
        source = source.replace(/^export const DEPRECATED_SEND_URL_KEY = 'NEXT_PUBLIC_AMFORGE_SEND_URL';$/m, '');
      }
      source = normalizeColours(source);
      if (needles.some((n) => source.includes(n))) {
        hits.push(path.relative(root, file));
      }
    }
  }
  return hits;
};
