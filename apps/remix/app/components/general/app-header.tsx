import { getRootHref } from '@documenso/lib/utils/params';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import { ReadStatus } from '@prisma/client';
import { InboxIcon, MenuIcon, SearchIcon } from 'lucide-react';
import { type HTMLAttributes, useState } from 'react';
import { Link, useParams } from 'react-router';

import { FleetHeader } from '~/chief/fleet-header';

import { AppCommandMenu } from './app-command-menu';
import { AppNavDesktop } from './app-nav-desktop';
import { AppNavMobile } from './app-nav-mobile';
import { OrgMenuSwitcher } from './org-menu-switcher';

export type HeaderProps = HTMLAttributes<HTMLDivElement> & {
  /** Kept for callers; the fds header always spans the viewport. */
  fullWidth?: boolean;
};

export const Header = ({ className, fullWidth: _fullWidth, ...props }: HeaderProps) => {
  const params = useParams();

  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isHamburgerMenuOpen, setIsHamburgerMenuOpen] = useState(false);

  const { data: unreadCountData } = trpc.document.inbox.getCount.useQuery(
    {
      readStatus: ReadStatus.NOT_OPENED,
    },
    {
      // refetchInterval: 30000, // Refetch every 30 seconds
    },
  );

  return (
    <FleetHeader
      className={className}
      homeHref={getRootHref(params)}
      utilities={
        <>
          <Button asChild variant="outline" className="relative hidden h-9 w-9 md:flex">
            <Link to="/inbox" className="relative block h-9 w-9" aria-label="Inbox">
              <InboxIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground" />

              {unreadCountData && unreadCountData.count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary font-semibold text-[10px] text-primary-foreground">
                  {unreadCountData.count > 99 ? '99+' : unreadCountData.count}
                </span>
              )}
            </Link>
          </Button>

          <OrgMenuSwitcher />

          <div className="flex flex-row items-center space-x-4 md:hidden">
            <button type="button" onClick={() => setIsCommandMenuOpen(true)} aria-label="Search">
              <SearchIcon className="h-6 w-6 text-muted-foreground" />
            </button>

            <button type="button" onClick={() => setIsHamburgerMenuOpen(true)} aria-label="Menu">
              <MenuIcon className="h-6 w-6 text-muted-foreground" />
            </button>

            <AppCommandMenu open={isCommandMenuOpen} onOpenChange={setIsCommandMenuOpen} />

            <AppNavMobile isMenuOpen={isHamburgerMenuOpen} onMenuOpenChange={setIsHamburgerMenuOpen} />
          </div>
        </>
      }
      {...props}
    >
      <AppNavDesktop setIsCommandMenuOpen={setIsCommandMenuOpen} className="ml-4" />
    </FleetHeader>
  );
};
