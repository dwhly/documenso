import { getRootHref } from '@documenso/lib/utils/params';
import { MenuIcon } from 'lucide-react';
import { type HTMLAttributes, useState } from 'react';
import { useParams } from 'react-router';

import { FleetAccountMenu } from '~/chief/fleet-account-menu';
import { FleetHeader } from '~/chief/fleet-header';

import { AppCommandMenu } from './app-command-menu';
import { AppNavMobile } from './app-nav-mobile';

export type HeaderProps = HTMLAttributes<HTMLDivElement> & {
  /** Kept for callers; the fds header always spans the viewport. */
  fullWidth?: boolean;
};

/**
 * Fleet Dealroom staff header (shell spec §1). No search box or icon buttons: search lives on list pages,
 * the inbox is a sub-nav tab, and the command menu stays reachable on Ctrl/Cmd+K. The hamburger only shows
 * below `md`, where the tabs and sub-nav collapse.
 */
export const Header = ({ className, fullWidth: _fullWidth, ...props }: HeaderProps) => {
  const params = useParams();

  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isHamburgerMenuOpen, setIsHamburgerMenuOpen] = useState(false);

  return (
    <FleetHeader
      className={className}
      homeHref={getRootHref(params)}
      tabs
      account={
        <>
          <FleetAccountMenu />

          <button
            type="button"
            className="md:hidden"
            onClick={() => setIsHamburgerMenuOpen(true)}
            aria-label="Menu"
          >
            <MenuIcon className="h-6 w-6 text-muted-foreground" />
          </button>

          <AppCommandMenu open={isCommandMenuOpen} onOpenChange={setIsCommandMenuOpen} />
          <AppNavMobile isMenuOpen={isHamburgerMenuOpen} onMenuOpenChange={setIsHamburgerMenuOpen} />
        </>
      }
      {...props}
    />
  );
};
