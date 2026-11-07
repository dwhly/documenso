import { Outlet } from 'react-router';

import { FleetHeader } from '~/chief/fleet-header';
import { PublicLegalLinks } from '~/components/general/public-legal-links';

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <FleetHeader />

      <main className="flex w-full flex-1 flex-col items-center justify-center px-4 py-12 md:p-12 lg:p-24">
        <div className="relative flex w-full items-center justify-center">
          <Outlet />
        </div>
      </main>

      <footer className="w-full pb-8">
        <PublicLegalLinks />
        <p className="mt-2 text-center text-muted-foreground text-xs">Fleet Dealroom · Rooms · Signatures</p>
      </footer>
    </div>
  );
}
