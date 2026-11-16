import type { CSSProperties } from 'react';

export type TenantBrand = {
  name: string;
  logoUrl: string;
  logoBaseline: number;
  chrome: string;
  chromeHsl: string;
  chromeRule: string;
  chromeRuleHsl: string;
  surface: string;
  poweredBy: boolean;
};

export const DEFAULT_TENANT: TenantBrand = {
  name: 'Fleet',
  logoUrl: '',
  logoBaseline: 0.8,
  chrome: '',
  chromeHsl: '',
  chromeRule: '',
  chromeRuleHsl: '',
  surface: '',
  poweredBy: false,
};

type TenantAttributes = {
  'data-chrome'?: string;
  'data-chrome-rule'?: string;
  'data-surface'?: string;
  style?: CSSProperties & { '--chrome-base'?: string; '--chrome-rule'?: string };
};

export const tenantHtmlAttributes = (brand: TenantBrand): TenantAttributes => {
  const attributes: TenantAttributes = {};
  if (brand.chrome) {
    attributes['data-chrome'] = 'dark';
    attributes.style = { '--chrome-base': brand.chromeHsl };
  }
  if (brand.chromeRule) {
    attributes['data-chrome-rule'] = '';
    attributes.style = { ...attributes.style, '--chrome-rule': brand.chromeRuleHsl };
  }
  if (brand.surface) {
    attributes['data-surface'] = brand.surface;
  }
  return attributes;
};

export const tenantFromEnvironment = (environment?: Record<string, string | undefined>): TenantBrand => {
  try {
    return environment?.FLEET_TENANT_BRAND ? JSON.parse(environment.FLEET_TENANT_BRAND) : DEFAULT_TENANT;
  } catch {
    return DEFAULT_TENANT;
  }
};

export const tenantPageTitle = (
  title: string,
  matches: ({ id: string; data?: unknown } | undefined)[],
  product = 'Sign',
) => {
  const root = matches.find((match) => match?.id === 'root')?.data as
    | { publicEnv?: Record<string, string | undefined> }
    | undefined;
  return `${title} · ${tenantFromEnvironment(root?.publicEnv).name} ${product}`;
};

export const serializePublicEnvironment = (environment: unknown) =>
  JSON.stringify(environment)?.replace(/</g, '\\u003c');
