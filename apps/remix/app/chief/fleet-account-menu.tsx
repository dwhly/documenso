import { authClient } from '@documenso/auth/client';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { isAdmin } from '@documenso/lib/utils/is-admin';
import { extractInitials } from '@documenso/lib/utils/recipient-formatter';
import { cn } from '@documenso/ui/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@documenso/ui/primitives/dropdown-menu';
import { Trans } from '@lingui/react/macro';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Link } from 'react-router';

import { useOptionalCurrentTeam } from '~/providers/team';

/** 28px neutral initials avatar (shell spec §1). Identity is the person, never a team or role. */
export const FleetAvatar = ({ name, className }: { name: string; className?: string }) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted font-semibold text-[length:var(--text-xs)] text-muted-foreground',
      className,
    )}
  >
    {extractInitials(name) || name.slice(0, 1).toUpperCase()}
  </span>
);

/**
 * Account menu = the person (shell spec §1): avatar + display name + chevron. The menu holds the email,
 * team switching (Sign only), Settings and Sign out. Replaces Documenso's org/team switcher in the header.
 */
export const FleetAccountMenu = () => {
  const { user, organisations } = useSession();
  const currentTeam = useOptionalCurrentTeam();

  const displayName = user.name?.trim() || user.email;
  const teams = organisations.flatMap((org) =>
    org.teams.map((team) => ({ ...team, orgName: org.name, showOrg: organisations.length > 1 })),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="fleet-account-menu"
          className="inline-flex h-8 max-w-[240px] items-center gap-2 rounded-control px-1.5 font-medium text-foreground text-[length:var(--text-md)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FleetAvatar name={displayName} />
          <span className="truncate">{displayName}</span>
          <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="z-[70] w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium text-foreground text-sm">{displayName}</div>
          <div className="truncate text-muted-foreground text-xs">{user.email}</div>
        </DropdownMenuLabel>

        {teams.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-medium text-muted-foreground text-xs">
              <Trans>Switch team</Trans>
            </DropdownMenuLabel>
            {teams.map((team) => (
              <DropdownMenuItem key={team.id} asChild>
                <Link to={`/t/${team.url}/documents`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {team.name}
                    {team.showOrg && <span className="ml-1 text-muted-foreground text-xs">· {team.orgName}</span>}
                  </span>
                  {currentTeam?.id === team.id && <CheckIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link to="/settings/profile">
            <Trans>Settings</Trans>
          </Link>
        </DropdownMenuItem>

        {isAdmin(user) && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <Trans>Admin panel</Trans>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onSelect={async () => authClient.signOut()}>
          <Trans>Sign out</Trans>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
