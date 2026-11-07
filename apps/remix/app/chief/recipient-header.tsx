import { Link } from 'react-router';

import { BrandingLogo } from '~/components/general/branding-logo';

import { FleetThemeToggle } from './fleet-theme-toggle';

/**
 * Header for signed-out recipients outside the signing view (complete, expired, rejected...). Same fds
 * header spec, but the tenant brand (AmForge) takes the mark slot instead of the Fleet lockup.
 */
export const RecipientHeader = () => (
  <header className="fds-header w-full">
    <Link to="/" className="flex-shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <BrandingLogo className="h-6 w-auto text-foreground" />
    </Link>

    <div className="fds-header__utils">
      <FleetThemeToggle />
    </div>
  </header>
);
