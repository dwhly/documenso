/**
 * Fleet (review r1 [1]): a recipient or QR token may download the SIGNED PDF only once the envelope is really
 * COMPLETED. Before that, `documentData.data` is the unsealed document (for a cancelled or rejected envelope it is
 * the original), and the download would still be named `<title>_signed.pdf`. The original stays downloadable, as
 * upstream allows. The token lookup itself (recipient token or QR token of THIS envelope) is done by the route.
 */
export type TokenDownloadVersion = 'signed' | 'original';

export const TOKEN_DOWNLOAD_NOT_COMPLETE = {
  error: 'The signed document is available once everyone has signed',
  code: 'DOCUMENT_NOT_COMPLETE',
} as const;

export const tokenDownloadRefusal = (envelopeStatus: string, version: TokenDownloadVersion) =>
  version === 'signed' && envelopeStatus !== 'COMPLETED' ? TOKEN_DOWNLOAD_NOT_COMPLETE : null;
