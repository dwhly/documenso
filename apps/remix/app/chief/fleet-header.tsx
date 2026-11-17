import { renderAttribution } from '../../../../packages/fleet-ui/fleet-attribution';
import { cn } from '@documenso/ui/lib/utils';
// biome-ignore lint/style/useImportType: The inventory runner uses the classic JSX transform.
import React from 'react';
import { Link, useRouteLoaderData } from 'react-router';
import { fleetSendUrl } from './fleet-send-url';
import { FleetThemeToggle } from './fleet-theme-toggle';
import { TenantIdentity, useTenantBrand } from './tenant-identity';

/** Fleet Dealroom product tabs. Rooms lives in Send; Signatures is this app. */
const DEALROOM_TABS = [
  { id: 'rooms', label: 'Rooms', envKey: 'NEXT_PUBLIC_FLEET_SEND_URL' },
  { id: 'signatures', label: 'Signatures', envKey: null },
] as const;

export { FleetMark } from './tenant-identity';

/** `.fds-lockup` (vendored components.css, v0.5.1 optically centred): mark + "Fleet" + rule + product. */
export const FleetLockup = ({ product = 'Dealroom', to = '/' }: { product?: string; to?: string }) => {
  const brand = useTenantBrand();
  return (
    <Link
      to={to}
      aria-label={`${brand.name} ${product}`}
      className="fds-lockup flex-shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TenantIdentity brand={brand} />
      <span className="fds-lockup__rule" aria-hidden="true" />
      <span className="fds-lockup__product">{product}</span>
    </Link>
  );
};

/**
 * Rooms | Signatures: pill tabs, the current tab = the neutral selected pill (fds v0.8.1 baseline, DESIGN.md §10).
 * The wrapper carries the responsive display: `.fds-nav` sets its own and would beat `hidden`.
 */
export const FleetDealroomTabs = ({ className }: { className?: string }) => {
  const root = useRouteLoaderData<{ publicEnv?: Record<string, string | undefined> }>('root');
  const sendUrl = fleetSendUrl(root?.publicEnv);
  return (
    <nav aria-label="Fleet Dealroom" className={cn('self-stretch', className)}>
      <div className="fds-nav fleet-tabs">
        {DEALROOM_TABS.map((tab) =>
          tab.envKey === null ? (
            <Link key={tab.id} to="/" aria-current="page">
              {tab.label}
            </Link>
          ) : sendUrl ? (
            <a key={tab.id} href={sendUrl}>
              {tab.label}
            </a>
          ) : null,
        )}
      </div>
    </nav>
  );
};

export type FleetHeaderProps = React.HTMLAttributes<HTMLElement> & {
  /** Staff header: show the Rooms | Signatures tabs. */
  tabs?: boolean;
  /** Right-aligned slot before the Theme button (the account menu). */
  account?: React.ReactNode;
  homeHref?: string;
};

/**
 * Staff header (shell spec §1, same as Send's FleetChrome): 56px, background surface, 1px bottom border,
 * 24px side padding, full width. Lockup → 24px → tabs → space → account menu → Theme (last).
 */
export const FleetHeader = ({ tabs = false, account, homeHref, className, children, ...props }: FleetHeaderProps) => (
  <header className={cn('fds-header fleet-header sticky top-0 z-[60] w-full', className)} {...props}>
    <FleetLockup to={homeHref} />

    {tabs && <FleetDealroomTabs className="hidden md:flex" />}

    {children}

    <div className="fds-header__utils">
      {account}
      <FleetThemeToggle />
    </div>
  </header>
);

/**
 * Visitor header (shell spec §4): the same 56px header with its content in the 960px visitor container.
 * Lockup left, Theme right, nothing else, so the lockup doesn't jump between Send room pages and Sign.
 * The app is "Sign" while signing and "Dealroom" once you're in the room (owner, 15 Nov 2026).
 */
export const FleetVisitorHeader = ({ className }: { className?: string }) => (
  <header className={cn('fds-header fleet-header fleet-header--visitor w-full', className)}>
    <div className="fleet-visitor-container flex w-full items-center">
      <FleetLockup product="Sign" />

      <div className="fds-header__utils">
        <FleetThemeToggle />
      </div>
    </div>
  </header>
);

/** Visitor footer (shell §7, same line as Send's room pages). */
export const FleetVisitorFooter = () => {
  const brand = useTenantBrand();
  return (
    <footer className="fleet-visitor-footer">
      {brand.name} Dealroom · Every copy is watermarked to the person it was issued to
      <div dangerouslySetInnerHTML={{ __html: renderAttribution('page', brand.attribution ?? {}) }} />
    </footer>
  );
};
