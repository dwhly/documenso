/**
 * Fleet (review r1 [1]): the completion page offers Download as soon as the document is really COMPLETED, either at
 * load time or from the live signing-status poll (so the last signer sees it without a reload). REJECTED and
 * CANCELLED are terminal but not completed: upstream's `isDocumentCompleted()` counts them, which offered a
 * "signed" download of a document nobody finished. The server refuses that download too (server/chief/token-download.ts).
 */
export const isSignedDownloadReady = (liveStatus: string | undefined, documentStatus: string | undefined) =>
  liveStatus === 'COMPLETED' || documentStatus === 'COMPLETED';
