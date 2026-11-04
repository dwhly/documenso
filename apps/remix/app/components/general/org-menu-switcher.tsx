import { authClient } from '@documenso/auth/client';
import { useOptionalCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { IS_BILLING_ENABLED } from '@documenso/lib/constants/app';
import { EXTENDED_ORGANISATION_MEMBER_ROLE_MAP } from '@documenso/lib/constants/organisations-translations';
import { EXTENDED_TEAM_MEMBER_ROLE_MAP } from '@documenso/lib/constants/teams-translations';
import { formatAvatarUrl } from '@documenso/lib/utils/avatars';
import { isAdmin } from '@documenso/lib/utils/is-admin';
import {
  canAccessOrganisationAnalytics,
  canExecuteOrganisationAction,
  formatOrganisationAnalyticsPath,
} from '@documenso/lib/utils/organisations';
import { extractInitials } from '@documenso/lib/utils/recipient-formatter';
import { canExecuteTeamAction, formatAnalyticsPath } from '@documenso/lib/utils/teams';
import { AnimateGenericFadeInOut } from '@documenso/ui/components/animate/animate-generic-fade-in-out';
import { LanguageSwitcherDialog } from '@documenso/ui/components/common/language-switcher-dialog';
import { cn } from '@documenso/ui/lib/utils';
import { Avatar, AvatarFallback, AvatarImage, AvatarWithText } from '@documenso/ui/primitives/avatar';
import { Button } from '@documenso/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@documenso/ui/primitives/dropdown-menu';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { Building2Icon, ChevronsUpDown, Plus, Settings2Icon, SettingsIcon, UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useRouteLoaderData } from 'react-router';

import { useOptionalCurrentTeam } from '~/providers/team';
import { type AmforgeLayout, switchAmforgeLayout } from '~/utils/amforge-layout';

export type OrgMenuSwitcherProps = {
  /** `sidebar`: Send's NavUser treatment, for the sidebar footer (AmForge layout prototype). */
  variant?: 'header' | 'sidebar';
  isCollapsed?: boolean;
};

export const OrgMenuSwitcher = ({ variant = 'header', isCollapsed = false }: OrgMenuSwitcherProps = {}) => {
  const { _ } = useLingui();

  const { user, organisations } = useSession();

  const { pathname } = useLocation();

  const layoutData = useRouteLoaderData('routes/_authenticated+/_layout') as { layout?: AmforgeLayout } | undefined;
  const currentLayout: AmforgeLayout = layoutData?.layout ?? 'topbar';

  const [isOpen, setIsOpen] = useState(false);
  const [languageSwitcherOpen, setLanguageSwitcherOpen] = useState(false);
  const [hoveredOrgId, setHoveredOrgId] = useState<string | null>(null);

  const isUserAdmin = isAdmin(user);

  const isPathOrgUrl = (orgUrl: string) => {
    if (!pathname || !pathname.startsWith(`/o/`)) {
      return false;
    }

    return pathname.split('/')[2] === orgUrl;
  };

  const selectedOrg = organisations.find((org) => isPathOrgUrl(org.url));
  const hoveredOrg = organisations.find((org) => org.id === hoveredOrgId || organisations.length === 1);

  const currentOrganisation = useOptionalCurrentOrganisation();
  const currentTeam = useOptionalCurrentTeam();

  const canAccessOrganisationSettings =
    currentOrganisation &&
    canExecuteOrganisationAction('MANAGE_ORGANISATION', currentOrganisation.currentOrganisationRole);

  const canAccessTeamSettings = currentTeam && canExecuteTeamAction('MANAGE_TEAM', currentTeam.currentTeamRole);

  // Team analytics take precedence when in a team context, the team page links to organisation analytics.
  const analyticsPath = canAccessTeamSettings
    ? formatAnalyticsPath(currentTeam.url)
    : currentOrganisation && canAccessOrganisationAnalytics(currentOrganisation.currentOrganisationRole)
      ? formatOrganisationAnalyticsPath(currentOrganisation.url)
      : null;

  // Use hovered org for teams display if available,
  // otherwise use current team's org if in a team,
  // finally fallback to selected org
  const displayedOrg = hoveredOrg || currentOrganisation || selectedOrg;

  const formatAvatarFallback = (name?: string) => {
    if (name !== undefined) {
      return name.slice(0, 1).toUpperCase();
    }

    return user.name ? extractInitials(user.name) : user.email.slice(0, 1).toUpperCase();
  };

  const dropdownMenuAvatarText = useMemo(() => {
    if (currentTeam) {
      return {
        avatarSrc: formatAvatarUrl(currentTeam.avatarImageId),
        avatarFallback: formatAvatarFallback(currentTeam.name),
        primaryText: currentTeam.name,
        secondaryText: _(EXTENDED_TEAM_MEMBER_ROLE_MAP[currentTeam.currentTeamRole]),
      };
    }

    if (currentOrganisation) {
      return {
        avatarSrc: formatAvatarUrl(currentOrganisation.avatarImageId),
        avatarFallback: formatAvatarFallback(currentOrganisation.name),
        primaryText: currentOrganisation.name,
        secondaryText: _(EXTENDED_ORGANISATION_MEMBER_ROLE_MAP[currentOrganisation.currentOrganisationRole]),
      };
    }

    return {
      avatarSrc: formatAvatarUrl(user.avatarImageId),
      avatarFallback: formatAvatarFallback(user.name ?? user.email),
      primaryText: user.name,
      secondaryText: _(msg`Personal Account`),
    };
  }, [currentTeam, currentOrganisation, user]);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setHoveredOrgId(currentOrganisation?.id || null);
    }

    setIsOpen(open);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        {variant === 'sidebar' ? (
          <Button
            data-testid="menu-switcher"
            variant="ghost"
            className={cn('w-full justify-start gap-2', isCollapsed ? 'h-10 w-10 justify-center p-0' : 'px-3')}
          >
            <Avatar className="h-8 w-8">
              {dropdownMenuAvatarText.avatarSrc && <AvatarImage src={dropdownMenuAvatarText.avatarSrc} />}
              <AvatarFallback className="text-xs">{dropdownMenuAvatarText.avatarFallback}</AvatarFallback>
            </Avatar>
            <div className={cn('grid flex-1 text-left', isCollapsed && 'hidden')}>
              <span className="truncate font-semibold text-sm">{dropdownMenuAvatarText.primaryText}</span>
              <span className="truncate text-gray-500 text-xs">{dropdownMenuAvatarText.secondaryText}</span>
            </div>
            <ChevronsUpDown className={cn('ml-auto h-4 w-4', isCollapsed && 'hidden')} />
          </Button>
        ) : (
          <Button
            data-testid="menu-switcher"
            variant="none"
            className="relative flex h-12 flex-row items-center px-0 py-2 ring-0 focus:outline-none focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-transparent md:px-2"
          >
            <AvatarWithText
              avatarSrc={dropdownMenuAvatarText.avatarSrc}
              avatarFallback={dropdownMenuAvatarText.avatarFallback}
              primaryText={dropdownMenuAvatarText.primaryText}
              secondaryText={dropdownMenuAvatarText.secondaryText}
              rightSideComponent={<ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground" />}
              textSectionClassName="hidden lg:flex"
            />
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={cn('z-[60] ml-6 flex w-full divide-x divide-border p-0 md:ml-0 md:min-w-[40rem]')}
        side={variant === 'sidebar' ? 'top' : undefined}
        align={variant === 'sidebar' ? 'start' : 'end'}
        forceMount
      >
        <div className="flex h-[400px] w-full divide-x">
          {/* Organisations column */}
          <div className="flex w-full flex-col md:w-1/3">
            <div className="flex h-12 items-center border-b p-2">
              <h3 className="flex items-center px-2 font-medium text-muted-foreground text-sm">
                <Building2Icon className="mr-2 h-3.5 w-3.5" />
                <Trans>Organisations</Trans>
              </h3>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
              {organisations.map((org) => (
                <div className="group relative" key={org.id} onMouseEnter={() => setHoveredOrgId(org.id)}>
                  <DropdownMenuItem
                    className={cn(
                      'w-full px-4 py-2 text-muted-foreground',
                      org.id === currentOrganisation?.id && !hoveredOrgId && 'bg-accent',
                      org.id === hoveredOrgId && 'bg-accent',
                    )}
                    asChild
                  >
                    <Link to={`/o/${org.url}`} className="flex items-center space-x-2 pr-8">
                      <span
                        className={cn('min-w-0 flex-1 truncate', {
                          'font-semibold': org.id === selectedOrg?.id,
                        })}
                      >
                        {org.name}
                      </span>
                    </Link>
                  </DropdownMenuItem>

                  {canExecuteOrganisationAction('MANAGE_ORGANISATION', org.currentOrganisationRole) && (
                    <div className="absolute top-0 right-0 bottom-0 flex items-center justify-center">
                      <Link
                        to={`/o/${org.url}/settings/general`}
                        className="mr-2 rounded-sm border p-1 text-muted-foreground transition-opacity duration-200 group-hover:opacity-100 md:opacity-0"
                      >
                        <Settings2Icon className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              ))}

              <Button variant="ghost" className="w-full justify-start" asChild>
                <Link to="/settings/organisations?action=add-organisation">
                  <Plus className="mr-2 h-4 w-4" />
                  <Trans>Create Organisation</Trans>
                </Link>
              </Button>
            </div>
          </div>

          {/* Teams column */}
          <div className="hidden w-1/3 flex-col md:flex">
            <div className="flex h-12 items-center border-b p-2">
              <h3 className="flex items-center px-2 font-medium text-muted-foreground text-sm">
                <UsersIcon className="mr-2 h-3.5 w-3.5" />
                <Trans>Teams</Trans>
              </h3>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
              <AnimateGenericFadeInOut key={displayedOrg ? 'displayed-org' : 'no-org'}>
                {hoveredOrg ? (
                  hoveredOrg.teams.map((team) => (
                    <div className="group relative" key={team.id}>
                      <DropdownMenuItem
                        className={cn(
                          'w-full px-4 py-2 text-muted-foreground',
                          team.id === currentTeam?.id && 'bg-accent',
                        )}
                        asChild
                      >
                        <Link to={`/t/${team.url}`} className="flex items-center space-x-2 pr-8">
                          <span
                            className={cn('min-w-0 flex-1 truncate', {
                              'font-semibold': team.id === currentTeam?.id,
                            })}
                          >
                            {team.name}
                          </span>
                        </Link>
                      </DropdownMenuItem>

                      {canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole) && (
                        <div className="absolute top-0 right-0 bottom-0 flex items-center justify-center">
                          <Link
                            to={`/t/${team.url}/settings/general`}
                            className="mr-2 rounded-sm border p-1 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                          >
                            <Settings2Icon className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="my-12 flex items-center justify-center px-2 text-center text-muted-foreground text-sm">
                    <Trans>Select an organisation to view teams</Trans>
                  </div>
                )}

                {displayedOrg && (
                  <Button variant="ghost" className="w-full justify-start" asChild>
                    <Link to={`/o/${displayedOrg.url}/settings/teams?action=add-team`}>
                      <Plus className="mr-2 h-4 w-4" />
                      <Trans>Create Team</Trans>
                    </Link>
                  </Button>
                )}
              </AnimateGenericFadeInOut>
            </div>
          </div>

          {/* Settings column */}
          <div className="hidden w-1/3 flex-col md:flex">
            <div className="flex h-12 items-center border-b p-2">
              <h3 className="flex items-center px-2 font-medium text-muted-foreground text-sm">
                <SettingsIcon className="mr-2 h-3.5 w-3.5" />
                <Trans>Settings</Trans>
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              {isUserAdmin && (
                <DropdownMenuItem className="px-4 py-2 text-muted-foreground" asChild>
                  <Link to="/admin">
                    <Trans>Admin panel</Trans>
                  </Link>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem className="px-4 py-2 text-muted-foreground" asChild>
                <Link to="/inbox">
                  <Trans>Inbox</Trans>
                </Link>
              </DropdownMenuItem>

              {analyticsPath && (
                <DropdownMenuItem className="px-4 py-2 text-muted-foreground" asChild>
                  <Link to={analyticsPath}>
                    <Trans>Analytics</Trans>
                  </Link>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem className="px-4 py-2 text-muted-foreground" asChild>
                <Link
                  to={
                    canAccessOrganisationSettings
                      ? `/o/${currentOrganisation?.url}/settings/general`
                      : canAccessTeamSettings
                        ? `/t/${currentTeam?.url}/settings/general`
                        : '/settings/profile'
                  }
                >
                  <Trans>Settings</Trans>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem className="px-4 py-2 text-muted-foreground" asChild>
                <Link to="/settings/profile">
                  <Trans>Account</Trans>
                </Link>
              </DropdownMenuItem>

              {IS_BILLING_ENABLED() && (
                <DropdownMenuItem className="px-4 py-2 text-muted-foreground" asChild>
                  <Link to="/settings/billing">
                    <Trans>Billing</Trans>
                  </Link>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="px-4 py-2 text-muted-foreground"
                onClick={() => setLanguageSwitcherOpen(true)}
              >
                <Trans>Language</Trans>
              </DropdownMenuItem>

              {/* AmForge layout prototype: flip the shell without editing the URL. Same Tabs-style
                  treatment as the product switcher. Plain strings: not in the Lingui catalogs. */}
              <div className="flex items-center justify-between gap-2 px-4 py-2 text-muted-foreground text-sm">
                <span>Layout</span>
                <div
                  role="group"
                  aria-label="Layout"
                  className="inline-flex h-7 shrink-0 items-center rounded-md bg-muted p-0.5"
                  data-testid="amforge-layout-toggle"
                >
                  {(
                    [
                      ['sidebar', 'Sidebar'],
                      ['topbar', 'Top bar'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={currentLayout === value}
                      onClick={() => currentLayout !== value && switchAmforgeLayout(value)}
                      className={cn(
                        'inline-flex h-6 items-center whitespace-nowrap rounded-sm px-2 font-medium text-xs transition-colors',
                        currentLayout === value ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {currentOrganisation && (
                <DropdownMenuItem className="px-4 py-2 text-muted-foreground" asChild>
                  <Link
                    to={{
                      pathname: `/o/${currentOrganisation.url}/support`,
                      search: currentTeam ? `?team=${currentTeam.id}` : '',
                    }}
                  >
                    <Trans>Support</Trans>
                  </Link>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="hover:!text-muted-foreground px-4 py-2 text-muted-foreground"
                onSelect={async () => authClient.signOut()}
              >
                <Trans>Sign Out</Trans>
              </DropdownMenuItem>
            </div>
          </div>
        </div>
      </DropdownMenuContent>

      <LanguageSwitcherDialog open={languageSwitcherOpen} setOpen={setLanguageSwitcherOpen} />
    </DropdownMenu>
  );
};
