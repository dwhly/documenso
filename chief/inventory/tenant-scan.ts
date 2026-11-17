import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

const colourForms = (value: string) => {
  const hex = normalizeColours(value.trim());
  if (!/^#[a-f0-9]{6}$/.test(hex)) {
    return [hex];
  }
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const light = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
  const hue = !delta
    ? 0
    : max === r
      ? ((g - b) / delta + 6) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return [
    hex,
    `rgb(${rgb.join(' ')})`,
    ...[4, 0].map((precision) => {
      const [h, s, l] = [hue * 60, saturation * 100, light * 100].map((v) => Number(v.toFixed(precision)));
      return `${h} ${s}% ${l}%`;
    }),
  ];
};
const normalizeSource = (source: string) =>
  normalizeColours(source)
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ');

export const scan = (root: string, environment: Record<string, string | undefined> = process.env) => {
  const needles = [
    'Acme Test Co',
    ...(environment.FLEET_TEST_TENANT_COLOURS ?? '').split(',').flatMap(colourForms),
    ...[environment.FLEET_TEST_TENANT_NAMES, environment.FLEET_TEST_TENANT_DOMAINS].flatMap((v) =>
      (v ?? '').split(','),
    ),
  ]
    .map((v) => normalizeSource(v.trim()))
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
      if (path.relative(root, file) === 'apps/remix/app/chief/public-env.server.ts') {
        source = source.replace(/^export const DEPRECATED_SEND_URL_KEY = 'NEXT_PUBLIC_AMFORGE_SEND_URL';$/m, '');
      }
      // Remove only the example comment from the exact locked upstream file.
      if (
        path.relative(root, file) === 'packages/fleet-ui/fds/tokens.css' &&
        createHash('sha256').update(source).digest('hex') ===
          'b1e227b8139ccbb4da4cc9cc8a294df86348023038dea305cd0ead54a98cbb16'
      ) {
        source = source.replace(/\/\* Org title-bar colour [\s\S]*?\*\//, '');
      }
      source = normalizeSource(source);
      if (needles.some((n) => source.includes(n))) {
        hits.push(path.relative(root, file));
      }
    }
  }
  return hits;
};
