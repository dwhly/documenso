/**
 * Fleet (review r1 [1]): the completion page offers Download as soon as the document is really COMPLETED, either at
 * load time or from the live signing-status poll (so the last signer sees it without a reload). REJECTED and
 * CANCELLED are terminal but not completed: upstream's `isDocumentCompleted()` counts them, which offered a
 * "signed" download of a document nobody finished. The server refuses that download too (server/chief/token-download.ts).
 */
export const isSignedDownloadReady = (liveStatus: string | undefined, documentStatus: string | undefined) =>
  liveStatus === 'COMPLETED' || documentStatus === 'COMPLETED';

/**
 * Fleet (review r2 [9]): the completion route's loader data is serialised into the page, so it carries only what the
 * page renders: item ids/titles/order and document metadata. Never `documentData` (base64 PDF bytes with database
 * storage, a storage key with S3), whatever the status; the PDF itself is fetched through the token file routes,
 * which apply the COMPLETED-only rule (@documenso/lib/utils/envelope-artifact).
 */
export const toCompletionDocument = <
  T extends {
    id: number;
    envelopeId: string;
    title: string;
    status: string;
    deletedAt: Date | null;
    envelopeItems: Array<{ id: string; envelopeId: string; title: string; order: number }>;
  },
>(
  document: T,
): Pick<T, 'id' | 'envelopeId' | 'title' | 'status' | 'deletedAt'> & {
  envelopeItems: Array<Pick<T['envelopeItems'][number], 'id' | 'envelopeId' | 'title' | 'order'>>;
} => ({
  id: document.id,
  envelopeId: document.envelopeId,
  title: document.title,
  status: document.status,
  deletedAt: document.deletedAt,
  envelopeItems: document.envelopeItems.map(({ id, envelopeId, title, order }) => ({ id, envelopeId, title, order })),
});

export const toCompletionRecipient = <T extends { token: string; role: string; email: string; name: string }>(
  recipient: T,
): Pick<T, 'token' | 'role' | 'email' | 'name'> => ({
  token: recipient.token,
  role: recipient.role,
  email: recipient.email,
  name: recipient.name,
});
