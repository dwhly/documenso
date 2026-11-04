import { useOptionalCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { isAdmin } from '@documenso/lib/utils/is-admin';
import {
  canAccessOrganisationAnalytics,
  canExecuteOrganisationAction,
  formatOrganisationAnalyticsPath,
} from '@documenso/lib/utils/organisations';
import { getRootHref } from '@documenso/lib/utils/params';
import { canExecuteTeamAction, formatAnalyticsPath } from '@documenso/lib/utils/teams';
import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import { Sheet, SheetContent } from '@documenso/ui/primitives/sheet';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { ReadStatus } from '@prisma/client';
import {
  ChartBarIcon,
  ChevronsLeft,
  ChevronsRight,
  FileIcon,
  InboxIcon,
  LayoutTemplateIcon,
  type LucideIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
} from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';

import { AmforgeProductSwitcher } from '~/chief/amforge-product-switcher';
import { BrandingLogo } from '~/components/general/branding-logo';
import { BrandingLogoIcon } from '~/components/general/branding-logo-icon';
import { useOptionalCurrentTeam } from '~/providers/team';

import { AppCommandMenu } from '~/components/general/app-command-menu';
import { OrgMenuSwitcher } from '~/components/general/org-menu-switcher';

/**
 * AmForge sidebar shell for Sign (Chief Dealroom layout prototype, `?layout=sidebar`).
 *
 * Structure and classes mirror Send's (Coneshare) shell 1:1 so both products read as one app:
 *   MainLayout.jsx  -> grid md:grid-cols-[16rem_1fr] / [4rem_1fr] when collapsed
 *   Sidebar.jsx     -> aside border-r bg-gray-100/40, w-64 / w-16
 *   SidebarHeader   -> h-14 border-b px-4: wordmark (mark when collapsed) + ghost collapse button
 *   SidebarContent  -> nav mt-4 gap-1 p-2; items rounded-lg px-3 py-2 gap-3, active bg-gray-200
 *   SidebarFooter   -> mt-auto p-2 + NavUser (here: Documenso's OrgMenuSwitcher, sidebar variant)
 *   Header.jsx      -> h-14 border-b bg-gray-100/40 px-6: product switcher | hairline | page title
 * Documenso's own search (cmd-K) sits at the right of the slim header.
 */

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hasDivider?: boolean;
  isActive: (pathname: string) => boolean;
  badge?: number;
};

const NAV_ITEM_CLASS =
  'flex items-center gap-3 rounded-lg py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50';
const NAV_ITEM_ACTIVE_CLASS = 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-50';

const useSidebarNavItems = (): NavItem[] => {
  const { _ } = useLingui();
  const { user, organisations } = useSession();

  const currentTeam = useOptionalCurrentTeam();
  const currentOrganisation = useOptionalCurrentOrganisation();

  const { data: unreadCountData } = trpc.document.inbox.getCount.useQuery({
    readStatus: ReadStatus.NOT_OPENED,
  });

  return useMemo(() => {
    const navigationTeam =
      currentTeam ??
      (organisations.length === 1 && organisations[0].teams.length === 1 ? organisations[0].teams[0] : null);

    const canManageTeam = currentTeam && canExecuteTeamAction('MANAGE_TEAM', currentTeam.currentTeamRole);
    const canManageOrganisation =
      currentOrganisation &&
      canExecuteOrganisationAction('MANAGE_ORGANISATION', currentOrganisation.currentOrganisationRole);

    const analyticsPath =
      navigationTeam && canExecuteTeamAction('MANAGE_TEAM', navigationTeam.currentTeamRole)
        ? formatAnalyticsPath(navigationTeam.url)
        : currentOrganisation && canAccessOrganisationAnalytics(currentOrganisation.currentOrganisationRole)
          ? formatOrganisationAnalyticsPath(currentOrganisation.url)
          : null;

    const settingsPath = canManageOrganisation
      ? `/o/${currentOrganisation?.url}/settings/general`
      : canManageTeam
        ? `/t/${currentTeam?.url}/settings/general`
        : '/settings/profile';

    const items: NavItem[] = [];

    if (navigationTeam) {
      const documentsPath = `/t/${navigationTeam.url}/documents`;
      const templatesPath = `/t/${navigationTeam.url}/templates`;

      items.push(
        {
          href: documentsPath,
          label: _(msg`Documents`),
          icon: FileIcon,
          isActive: (pathname) => pathname.startsWith(documentsPath),
        },
        {
          href: templatesPath,
          label: _(msg`Templates`),
          icon: LayoutTemplateIcon,
          isActive: (pathname) => pathname.startsWith(templatesPath),
        },
      );
    }

    items.push({
      href: '/inbox',
      label: _(msg`Inbox`),
      icon: InboxIcon,
      isActive: (pathname) => pathname.startsWith('/inbox'),
      badge: unreadCountData?.count,
    });

    if (analyticsPath) {
      items.push({
        href: analyticsPath,
        label: _(msg`Analytics`),
        icon: ChartBarIcon,
        isActive: (pathname) => pathname.includes('/analytics'),
      });
    }

    items.push({
      href: settingsPath,
      label: _(msg`Settings`),
      icon: SettingsIcon,
      hasDivider: true,
      isActive: (pathname) => pathname.includes('/settings'),
    });

    if (isAdmin(user)) {
      items.push({
        href: '/admin',
        label: _(msg`Admin panel`),
        icon: ShieldIcon,
        isActive: (pathname) => pathname.startsWith('/admin'),
      });
    }

    return items;
  }, [_, currentTeam, currentOrganisation, organisations, unreadCountData, user]);
};

type SidebarBodyProps = {
  isCollapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  navItems: NavItem[];
};

const SidebarBody = ({ isCollapsed, onToggle, onNavigate, navItems }: SidebarBodyProps) => {
  const params = useParams();
  const { pathname } = useLocation();

  return (
    <>
      {/* SidebarHeader */}
      <div className="flex h-14 items-center border-b px-4">
        <Link
          to={getRootHref(params)}
          onClick={onNavigate}
          className="flex flex-1 items-center gap-2 font-semibold"
          aria-label="AmForge Home"
        >
          {isCollapsed ? (
            <BrandingLogoIcon className="h-6 w-6" />
          ) : (
            <BrandingLogo product={false} className="h-6 w-auto text-foreground" />
          )}
        </Link>

        {onToggle && (
          <Button variant="ghost" onClick={onToggle} className="h-8 w-8 p-0" title="Toggle sidebar (])">
            {isCollapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
            <span className="sr-only">Toggle sidebar</span>
          </Button>
        )}
      </div>

      {/* Mobile only: the product switcher lives in the slim header on desktop. */}
      {!onToggle && (
        <div className="px-4 pt-4">
          <AmforgeProductSwitcher current="sign" />
        </div>
      )}

      {/* SidebarContent */}
      <nav className="mt-4 flex flex-col gap-1 p-2">
        {navItems.map((item) => (
          <Fragment key={item.href}>
            {item.hasDivider && <hr className="my-1.5 border-gray-200 border-t dark:border-gray-800" />}

            <Link
              to={item.href}
              onClick={onNavigate}
              className={cn(
                NAV_ITEM_CLASS,
                item.isActive(pathname) && NAV_ITEM_ACTIVE_CLASS,
                isCollapsed ? 'h-10 w-10 justify-center px-0' : 'px-3',
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className={cn(isCollapsed && 'hidden')}>{item.label}</span>

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={cn(
                    'ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground',
                    isCollapsed && 'hidden',
                  )}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          </Fragment>
        ))}
      </nav>

      {/* SidebarFooter */}
      <div className="mt-auto flex flex-col gap-4 p-2">
        <OrgMenuSwitcher variant="sidebar" isCollapsed={isCollapsed} />
      </div>
    </>
  );
};

export type AmforgeSidebarLayoutProps = {
  banners?: ReactNode;
  isSettingsLayout?: boolean;
  children: ReactNode;
};

export const AmforgeSidebarLayout = ({ banners, isSettingsLayout, children }: AmforgeSidebarLayoutProps) => {
  const { pathname } = useLocation();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [modifierKey, setModifierKey] = useState(() => 'Ctrl');

  const navItems = useSidebarNavItems();

  useEffect(() => {
    const isMacOS = /Macintosh|Mac\s+OS\s+X/i.test(navigator.userAgent);
    setModifierKey(isMacOS ? '⌘' : 'Ctrl');

    // Same shortcut as Send's SidebarProvider.
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (event.key === ']' && !target?.closest('input, textarea, [contenteditable="true"]')) {
        event.preventDefault();
        setIsCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Header title = the active nav item (Send's Header.jsx does the same).
  const title = navItems.find((item) => item.isActive(pathname))?.label ?? '';

  return (
    <div className="flex h-dvh flex-col">
      {banners}

      <div
        className={cn(
          'grid min-h-0 w-full flex-1 transition-all',
          isCollapsed ? 'md:grid-cols-[4rem_1fr]' : 'md:grid-cols-[16rem_1fr]',
        )}
      >
        <aside
          data-collapsed={isCollapsed}
          className="hidden flex-col border-r bg-gray-100/40 transition-all data-[collapsed=false]:w-64 data-[collapsed=true]:w-16 md:flex dark:bg-gray-800/40"
        >
          <SidebarBody
            isCollapsed={isCollapsed}
            onToggle={() => setIsCollapsed((prev) => !prev)}
            navItems={navItems}
          />
        </aside>

        <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden">
          <header className="flex h-14 items-center gap-4 border-b bg-gray-100/40 px-4 md:px-6 dark:bg-gray-800/40">
            <button
              type="button"
              className="text-muted-foreground md:hidden"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon className="h-6 w-6" />
            </button>

            <AmforgeProductSwitcher current="sign" className="hidden md:inline-flex" />
            <div className="hidden h-6 w-px bg-border md:block" aria-hidden="true" />

            <h1 className="truncate font-semibold text-lg">{title}</h1>

            <Button
              variant="outline"
              className="ml-auto hidden h-9 w-64 items-center justify-between rounded-lg px-3 text-muted-foreground md:flex"
              onClick={() => setIsCommandMenuOpen(true)}
            >
              <span className="flex items-center">
                <SearchIcon className="mr-2 h-4 w-4" />
                <Trans>Search</Trans>
              </span>
              <span className="flex items-center rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tracking-wider">
                {modifierKey}+K
              </span>
            </Button>

            <button
              type="button"
              className="ml-auto text-muted-foreground md:hidden"
              onClick={() => setIsCommandMenuOpen(true)}
              aria-label="Search"
            >
              <SearchIcon className="h-6 w-6" />
            </button>
          </header>

          <main
            className={cn(
              'overflow-auto',
              isSettingsLayout ? 'md:flex md:min-h-0 md:flex-col' : 'pt-4 pb-8 md:pt-6 md:pb-12',
            )}
          >
            {children}
          </main>
        </div>
      </div>

      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent position="left" size="content" className="flex w-64 flex-col bg-background p-0">
          <SidebarBody isCollapsed={false} onNavigate={() => setIsMobileOpen(false)} navItems={navItems} />
        </SheetContent>
      </Sheet>

      <AppCommandMenu open={isCommandMenuOpen} onOpenChange={setIsCommandMenuOpen} />
    </div>
  );
};
