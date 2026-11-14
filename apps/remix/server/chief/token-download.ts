/**
 * Fleet (review r1 [1], centralised in review r2): a recipient or QR token may download the SIGNED PDF only once the
 * envelope is really COMPLETED. The rule lives in @documenso/lib/utils/envelope-artifact (shared with the preview,
 * dataId, staff and API paths); this module keeps the route-facing names.
 */
import { SIGNED_DOCUMENT_NOT_COMPLETE, recipientDownloadRefusal } from '@documenso/lib/utils/envelope-artifact';

export type TokenDownloadVersion = 'signed' | 'original';

export const TOKEN_DOWNLOAD_NOT_COMPLETE = SIGNED_DOCUMENT_NOT_COMPLETE;

export const tokenDownloadRefusal = (envelopeStatus: string, version: TokenDownloadVersion) =>
  recipientDownloadRefusal(envelopeStatus, version);
