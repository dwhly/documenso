import { cn } from '@documenso/ui/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

import { env } from '@documenso/lib/utils/env';

import { FleetThemeToggle } from './fleet-theme-toggle';

/** Fleet Dealroom product tabs. Rooms lives in Send; Signatures is this app. */
const DEALROOM_TABS = [
  { id: 'rooms', label: 'Rooms', envKey: 'NEXT_PUBLIC_AMFORGE_SEND_URL' },
  { id: 'signatures', label: 'Signatures', envKey: null },
] as const;

/** `.fds-lockup` from the vendored components.css: Fleet mark + "Fleet" + rule + product word. */
export const FleetLockup = ({ product = 'Dealroom', to = '/' }: { product?: string; to?: string }) => (
  <Link to={to} className="fds-lockup flex-shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <svg className="fds-lockup__mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5 16.2 10.4 12 8.6 7.8 10.4Z" />
      <path d="M6 10.5 10.2 18.4 6 16.6 1.8 18.4Z" opacity=".8" />
      <path d="M18 10.5 22.2 18.4 18 16.6 13.8 18.4Z" opacity=".8" />
    </svg>
    <span className="fds-lockup__family">Fleet</span>
    <span className="fds-lockup__rule" aria-hidden="true" />
    <span className="fds-lockup__product">{product}</span>
  </Link>
);

/** Rooms | Signatures as fds nav tabs: selected = foreground text + foreground underline. */
export const FleetDealroomTabs = ({ className }: { className?: string }) => (
  <nav aria-label="Fleet Dealroom" className={cn('fds-nav', className)}>
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
  </nav>
);

export type FleetHeaderProps = HTMLAttributes<HTMLElement> & {
  /** Product utilities, rendered right-aligned before the Theme toggle. */
  utilities?: ReactNode;
  /** Extra content between the tabs and the utilities (e.g. in-app nav and search). */
  children?: ReactNode;
  homeHref?: string;
};

/**
 * The one fds app header (DESIGN.md §6): background surface, 1px bottom border, lockup left, nav tabs,
 * utilities right with the labelled Theme toggle last.
 */
export const FleetHeader = ({ utilities, children, homeHref, className, ...props }: FleetHeaderProps) => (
  <header className={cn('fds-header sticky top-0 z-[60] w-full', className)} {...props}>
    <FleetLockup to={homeHref} />

    {/* Wrapper carries the responsive display: `.fds-nav` sets its own and would beat `hidden`. */}
    <div className="hidden self-stretch md:flex">
      <FleetDealroomTabs />
    </div>

    {children}

    <div className="fds-header__utils">
      {utilities}
      <FleetThemeToggle />
    </div>
  </header>
);
