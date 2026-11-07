import { env } from '@documenso/lib/utils/env';
import { cn } from '@documenso/ui/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

import { FleetThemeToggle } from './fleet-theme-toggle';

/** Fleet Dealroom product tabs. Rooms lives in Send; Signatures is this app. */
const DEALROOM_TABS = [
  { id: 'rooms', label: 'Rooms', envKey: 'NEXT_PUBLIC_AMFORGE_SEND_URL' },
  { id: 'signatures', label: 'Signatures', envKey: null },
] as const;

/** The Fleet mark (fleet-design-system marks/fleet.svg). */
export const FleetMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5 16.2 10.4 12 8.6 7.8 10.4Z" />
    <path d="M6 10.5 10.2 18.4 6 16.6 1.8 18.4Z" opacity=".8" />
    <path d="M18 10.5 22.2 18.4 18 16.6 13.8 18.4Z" opacity=".8" />
  </svg>
);

/** `.fds-lockup` (vendored components.css, v0.5.1 optically centred): mark + "Fleet" + rule + product. */
export const FleetLockup = ({ product = 'Dealroom', to = '/' }: { product?: string; to?: string }) => (
  <Link
    to={to}
    aria-label={`Fleet ${product}`}
    className="fds-lockup flex-shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <FleetMark className="fds-lockup__mark" />
    <span className="fds-lockup__family">Fleet</span>
    <span className="fds-lockup__rule" aria-hidden="true" />
    <span className="fds-lockup__product">{product}</span>
  </Link>
);

/**
 * Rooms | Signatures: plain tabs, selected = foreground text + 2px foreground underline (shell spec §1).
 * The wrapper carries the responsive display: `.fds-nav` sets its own and would beat `hidden`.
 */
export const FleetDealroomTabs = ({ className }: { className?: string }) => (
  <nav aria-label="Fleet Dealroom" data-tabs="underline" className={cn('self-stretch', className)}>
    <div className="fds-nav fleet-tabs">
      {DEALROOM_TABS.map((tab) =>
        tab.envKey === null ? (
          <Link key={tab.id} to="/" aria-current="page">
            {tab.label}
          </Link>
        ) : (
          <a key={tab.id} href={env(tab.envKey) || '/'}>
            {tab.label}
          </a>
        ),
      )}
    </div>
  </nav>
);

export type FleetHeaderProps = HTMLAttributes<HTMLElement> & {
  /** Staff header: show the Rooms | Signatures tabs. */
  tabs?: boolean;
  /** Right-aligned slot before the Theme button (the account menu). */
  account?: ReactNode;
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
 */
export const FleetVisitorHeader = ({ className }: { className?: string }) => (
  <header className={cn('fds-header fleet-header fleet-header--visitor w-full', className)}>
    <div className="fleet-visitor-container flex w-full items-center">
      <FleetLockup />

      <div className="fds-header__utils">
        <FleetThemeToggle />
      </div>
    </div>
  </header>
);
