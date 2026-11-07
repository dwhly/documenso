import { cn } from '@documenso/ui/lib/utils';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';

export type FleetCrumb = { label: ReactNode; to?: string };

export type FleetPageHeadProps = {
  /** Omit on top-level pages (shell spec §3). */
  breadcrumbs?: FleetCrumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  /** At most one primary (ink) + one secondary (outline), right-aligned on the H1 row. */
  actions?: ReactNode;
  className?: string;
};

/** Page head (shell spec §3): breadcrumb → H1 24px/600 → one-line muted subtitle; actions on the H1 row. */
export const FleetPageHead = ({ breadcrumbs, title, subtitle, actions, className }: FleetPageHeadProps) => (
  <div className={cn('fleet-page-head', className)}>
    {breadcrumbs && breadcrumbs.length > 0 && (
      <nav aria-label="Breadcrumb" className="fleet-page-head__crumbs">
        {breadcrumbs.map((crumb, index) => (
          <Fragment key={index}>
            {index > 0 && <span aria-hidden="true">/</span>}
            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          </Fragment>
        ))}
      </nav>
    )}

    <div className="fleet-page-head__row">
      <div className="min-w-0">
        <h1 className="fleet-page-head__title">{title}</h1>
        {subtitle && <div className="fleet-page-head__subtitle">{subtitle}</div>}
      </div>

      {actions && <div className="fleet-page-head__actions">{actions}</div>}
    </div>
  </div>
);

/** Empty state (shell spec §3): a dashed-outline card with one line and one primary action. */
export const FleetEmptyState = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="fleet-empty">
    <p>{children}</p>
    {action}
  </div>
);
