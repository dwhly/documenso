import React, { type CSSProperties } from 'react';

import { DEFAULT_TENANT, type TenantBrand } from './tenant-brand';

const TenantContext = React.createContext<TenantBrand>(DEFAULT_TENANT);
export const TenantBrandProvider = TenantContext.Provider;
export const useTenantBrand = () => React.useContext(TenantContext);

export const TenantIdentity = ({ brand }: { brand: TenantBrand }) => {
  const [failedUrl, setFailedUrl] = React.useState('');
  return brand.logoUrl && brand.logoUrl !== failedUrl ? (
    <img
      className="fleet-tenant-logo"
      src={brand.logoUrl}
      alt={brand.name}
      onError={() => setFailedUrl(brand.logoUrl)}
      style={{ '--tenant-logo-baseline': brand.logoBaseline } as CSSProperties}
    />
  ) : (
    <>
      <FleetMark className="fds-lockup__mark" />
      <span className="fds-lockup__family">{brand.name}</span>
    </>
  );
};

export const FleetMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5 16.2 10.4 12 8.6 7.8 10.4Z" />
    <path d="M6 10.5 10.2 18.4 6 16.6 1.8 18.4Z" opacity=".8" />
    <path d="M18 10.5 22.2 18.4 18 16.6 13.8 18.4Z" opacity=".8" />
  </svg>
);
