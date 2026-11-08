import type { ReactNode } from 'react';

import { FleetContextBar, useFleetRecipientContext } from './fleet-context-bar';
import { fleetContextLabel } from './recipient-context';
import { FleetVisitorHeader } from './fleet-header';

export type FleetSignerChromeProps = {
  documentTitle: string;
  visitorName?: string | null;
  visitorEmail?: string | null;
  /** Below `lg` the sidebar collapses, so its actions (menu + complete) sit in a row under the bar. */
  mobileActions?: ReactNode;
};

/**
 * Signing page chrome (shell spec §4): visitor header + context bar. The context is the room when the
 * envelope came from a room and the room name is known, otherwise the document title.
 */
export const FleetSignerChrome = ({ documentTitle, visitorName, visitorEmail, mobileActions }: FleetSignerChromeProps) => {
  const context = useFleetRecipientContext();

  return (
    <div className="fleet-signer-chrome">
      <FleetVisitorHeader />

      <FleetContextBar
        label={fleetContextLabel(context?.roomName, documentTitle)}
        roomName={context?.roomName}
        backUrl={context?.backUrl}
        visitorName={visitorName}
        visitorEmail={visitorEmail}
      />

      {mobileActions && (
        <div className="fleet-visitor-container flex items-center justify-end gap-2 py-2 lg:hidden">{mobileActions}</div>
      )}
    </div>
  );
};
