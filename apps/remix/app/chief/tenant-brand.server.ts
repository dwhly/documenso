import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { extname } from 'node:path';

import { DEFAULT_TENANT, type TenantBrand } from './tenant-brand';

const KEYS = ['NAME', 'LOGO', 'LOGO_BASELINE', 'CHROME', 'CHROME_RULE', 'SURFACE', 'POWERED_BY'] as const;
const MAX_LOGO_BYTES = 200 * 1024;
const warnings = new WeakMap<(message: string) => void, Set<string>>();
const defaultWarn = (message: string) => console.warn(message);
type TenantConfiguration = { brand: TenantBrand; logo?: { bytes: Buffer; mime: string; hash: string } };

const warnOnce = (key: string, warn: (message: string) => void) => {
  const warned = warnings.get(warn) ?? new Set<string>();
  if (!warned.has(key)) {
    warned.add(key);
    warnings.set(warn, warned);
    warn(`Invalid FLEET_TENANT_${key}; using default`);
  }
};

const hsl = (hex: string) => {
  const digits = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16) / 255);
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
  return `${Number((hue * 60).toFixed(4))} ${Number((saturation * 100).toFixed(4))}% ${Number((light * 100).toFixed(4))}%`;
};

const crc32 = (bytes: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const readLogo = (file: string) => {
  const extension = extname(file).toLowerCase();
  if (extension !== '.png') {
    throw new Error('logo_type');
  }
  const fd = openSync(file, 'r');
  let bytes: Buffer;
  try {
    if (!fstatSync(fd).isFile()) {
      throw new Error('logo_type');
    }
    const buffer = Buffer.alloc(MAX_LOGO_BYTES);
    const length = readSync(fd, buffer, 0, buffer.length, 0);
    if (!length || length >= MAX_LOGO_BYTES) {
      throw new Error('logo_size');
    }
    bytes = buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    !bytes.readUInt32BE(16) ||
    !bytes.readUInt32BE(20) ||
    !bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))
  ) {
    throw new Error('logo_png');
  }
  let offset = 8;
  let hasData = false;
  while (offset < bytes.length) {
    const end = offset + 12 + bytes.readUInt32BE(offset);
    if (end > bytes.length || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) {
      throw new Error('logo_png');
    }
    hasData ||= bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT';
    offset = end;
  }
  if (!hasData) {
    throw new Error('logo_png');
  }
  return { bytes, mime: 'image/png', hash: createHash('sha256').update(bytes).digest('hex') };
};

export const parseTenantBrand = (
  environment: Record<string, string | undefined>,
  warn: (message: string) => void = defaultWarn,
): TenantConfiguration => {
  const config: TenantConfiguration = { brand: { ...DEFAULT_TENANT } };
  for (const key of KEYS) {
    const value = environment[`FLEET_TENANT_${key}`] ?? '';
    if (value === '') {
      continue;
    }
    try {
      switch (key) {
        case 'NAME':
          if (!value.trim() || [...value].length > 120 || /\p{Cc}/u.test(value)) {
            throw new Error('name');
          }
          config.brand.name = value.trim();
          break;
        case 'LOGO_BASELINE': {
          if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value)) {
            throw new Error('baseline');
          }
          const number = Number(value);
          if (!value.trim() || !Number.isFinite(number) || number < 0 || number > 1) {
            throw new Error('baseline');
          }
          config.brand.logoBaseline = number;
          break;
        }
        case 'CHROME':
        case 'CHROME_RULE': {
          if (!/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) {
            throw new Error('hex');
          }
          const field = key === 'CHROME' ? 'chrome' : 'chromeRule';
          config.brand[field] = value;
          config.brand[`${field}Hsl`] = hsl(value);
          break;
        }
        case 'SURFACE':
          if (value !== 'warm') {
            throw new Error('surface');
          }
          config.brand.surface = value;
          break;
        case 'POWERED_BY':
          if (value !== '1') {
            throw new Error('powered_by');
          }
          config.brand.poweredBy = true;
          break;
        case 'LOGO':
          config.logo = readLogo(value);
          config.brand.logoUrl = `/chief/tenant-logo?v=${config.logo.hash}`;
          break;
      }
    } catch {
      warnOnce(key, warn);
    }
  }
  return config;
};

let cached: { key: string; config: TenantConfiguration } | undefined;
export const getTenantBrand = (): TenantConfiguration => {
  const key = JSON.stringify(KEYS.map((name) => process.env[`FLEET_TENANT_${name}`] ?? ''));
  if (cached?.key !== key) {
    cached = { key, config: parseTenantBrand(process.env) };
  }
  return cached.config;
};

export const tenantLogoResponse = (request: Request, config = getTenantBrand()) => {
  const { logo } = config;
  if (!logo || new URL(request.url).searchParams.get('v') !== logo.hash) {
    return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      'Content-Type': logo.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${logo.hash}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
};
