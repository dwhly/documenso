/**
 * Room context for the Sign recipient pages (shell spec §4). Send's glue marks every envelope it creates
 * with `externalId = dealroom:<deployment>:<command>` and, for NDA gates, `meta.redirectUrl` = the room's
 * signing page with a `room_name` query param (shell §7), which names the room in the context bar.
 */
export type FleetRecipientContext = {
  fromRoom: boolean;
  roomName: string | null;
  backUrl: string | null;
};

const DEALROOM_EXTERNAL_ID = /^dealroom:[^:]+:/;

export const toFleetRecipientContext = (envelope: {
  externalId: string | null;
  documentMeta: { redirectUrl: string | null } | null;
}): FleetRecipientContext => {
  const fromRoom = DEALROOM_EXTERNAL_ID.test(envelope.externalId ?? '');
  const redirectUrl = envelope.documentMeta?.redirectUrl ?? '';

  let backUrl: string | null = null;
  let roomName: string | null = null;

  if (fromRoom && redirectUrl) {
    try {
      const url = new URL(redirectUrl);
      backUrl = url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
      roomName = backUrl ? url.searchParams.get('room_name')?.trim() || null : null;
    } catch {
      backUrl = null;
    }
  }

  return { fromRoom, roomName, backUrl };
};

/** Context bar label (shell §7): "<Room name> / <Document title>" from a room, else the document title. */
export const fleetContextLabel = (roomName: string | null | undefined, documentTitle: string | null | undefined) =>
  roomName && documentTitle ? `${roomName} / ${documentTitle}` : (roomName ?? documentTitle ?? '');
