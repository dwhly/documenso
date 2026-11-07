import { useSession } from '@documenso/lib/client-only/providers/session';
import { Trans } from '@lingui/react/macro';
import { Link, useLocation } from 'react-router';

import { useOptionalCurrentTeam } from '~/providers/team';

/**
 * Signatures sub-navigation (shell spec §2): a 44px row under the header, in the content container,
 * plain tabs (selected = foreground + underline) and a bottom hairline. Documents · Templates · Inbox.
 * Sign's header inbox icon became the Inbox tab.
 */
export const FleetSubNav = () => {
  const { pathname } = useLocation();
  const { organisations } = useSession();
  const currentTeam = useOptionalCurrentTeam();

  // Off-team pages (inbox, settings) keep the tabs pointing at the person's first team.
  const teamUrl = currentTeam?.url ?? organisations.flatMap((org) => org.teams)[0]?.url ?? null;

  const tabs = [
    ...(teamUrl
      ? [
          { href: `/t/${teamUrl}/documents`, match: '/documents', label: <Trans>Documents</Trans> },
          { href: `/t/${teamUrl}/templates`, match: '/templates', label: <Trans>Templates</Trans> },
        ]
      : []),
    { href: '/inbox', match: '/inbox', label: <Trans>Inbox</Trans> },
  ];

  const isActive = (match: string) =>
    match === '/inbox' ? pathname.startsWith('/inbox') : pathname.startsWith('/t/') && pathname.includes(match);

  return (
    <div className="fleet-subnav">
      <nav aria-label="Signatures" data-tabs="underline" className="fleet-container fleet-subnav__inner">
        <div className="fds-nav fleet-tabs">
          {tabs.map((tab) => (
            <Link key={tab.href} to={tab.href} aria-current={isActive(tab.match) ? 'page' : undefined}>
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
};
