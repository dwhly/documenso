/**
 * Room context for the Sign recipient pages (shell spec §4). Send's glue marks every envelope it creates
 * with `externalId = dealroom:<deployment>:<command>` and, for NDA gates, `meta.redirectUrl` = the room's
 * signing page. Send does not put the room's name on the envelope, so `roomName` stays null until it does
 * and the context bar falls back to the document title.
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

  if (fromRoom && redirectUrl) {
    try {
      const url = new URL(redirectUrl);
      backUrl = url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
      backUrl = null;
    }
  }

  return { fromRoom, roomName: null, backUrl };
};
