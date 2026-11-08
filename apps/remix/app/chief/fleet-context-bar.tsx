import { cn } from '@documenso/ui/lib/utils';
import { Trans } from '@lingui/react/macro';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRouteLoaderData } from 'react-router';
import * as superjson from 'superjson';

import { type FleetRecipientContext, fleetContextLabel } from './recipient-context';

const SIGNING_ROUTE_ID = 'routes/_recipient+/sign.$token+/_index';
const COMPLETE_ROUTE_ID = 'routes/_recipient+/sign.$token+/complete';

/** Room context the signing loader attached (see recipient-context.ts); null outside that route. */
export const useFleetRecipientContext = (): FleetRecipientContext | null => {
  const raw = useRouteLoaderData(SIGNING_ROUTE_ID);

  if (!raw) {
    return null;
  }

  const data = superjson.deserialize<{ fleetContext?: FleetRecipientContext }>(raw as never);

  return data?.fleetContext ?? null;
};

export type FleetContextBarProps = {
  /** Room name when the envelope came from a room, otherwise the document title. */
  label: ReactNode;
  visitorName?: string | null;
  visitorEmail?: string | null;
  backUrl?: string | null;
  roomName?: string | null;
  className?: string;
};

/**
 * Visitor context bar (shell spec §4): under the visitor header, in the 960px container. "Back to <room>"
 * top-left when the envelope came from a room, the room (or document) name, and the visitor at right.
 */
export const FleetContextBar = ({
  label,
  visitorName,
  visitorEmail,
  backUrl,
  roomName,
  className,
}: FleetContextBarProps) => (
  <div className={cn('fleet-context-bar fleet-visitor-container', className)}>
    <div className="fleet-context-bar__inner">
      <div className="flex min-w-0 items-center gap-3">
        {backUrl && (
          <a href={backUrl} className="fleet-context-bar__back">
            <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {roomName ? <Trans>Back to {roomName}</Trans> : <Trans>Back to room</Trans>}
          </a>
        )}
        <span className="fleet-context-bar__label truncate">{label}</span>
      </div>

      {(visitorName || visitorEmail) && (
        <div className="fleet-context-bar__visitor truncate">
          {visitorName && <span>{visitorName}</span>}
          {visitorName && visitorEmail && <span aria-hidden="true"> · </span>}
          {visitorEmail && <span>{visitorEmail}</span>}
        </div>
      )}
    </div>
  </div>
);

type CompleteLoaderData = {
  fleetContext?: FleetRecipientContext;
  document?: { title: string } | null;
  recipientName?: string;
  recipientEmail?: string;
};

/**
 * Context bar for visitor pages rendered by the recipient layout (signing complete): same bar as the signing
 * page, fed by the complete route's loader. Renders nothing on other recipient routes.
 */
export const FleetRecipientLayoutContextBar = () => {
  const data = useRouteLoaderData(COMPLETE_ROUTE_ID) as CompleteLoaderData | undefined;

  if (!data?.document) {
    return null;
  }

  const context = data.fleetContext;

  return (
    <FleetContextBar
      label={fleetContextLabel(context?.roomName, data.document.title)}
      roomName={context?.roomName}
      backUrl={context?.backUrl}
      visitorName={data.recipientName !== data.recipientEmail ? data.recipientName : null}
      visitorEmail={data.recipientEmail}
    />
  );
};
