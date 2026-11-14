/**
 * Fleet (review r2 [1]/[9]): the ONE rule for which stored bytes of an envelope item may be served, and what a
 * download may be called. Every file path (recipient/QR token routes, staff routes, API v2/v2-beta, the S3 presign
 * route, recipient loaders) asks this module instead of reading `documentData.data` itself.
 *
 * Storage model: `documentData.initialData` is the uploaded original. `documentData.data` is the current bytes. Until
 * the envelope finishes they are the same. The seal job then replaces `data` with the sealed artifact, for COMPLETED
 * (everyone signed) AND for REJECTED (a rejection is sealed too: inserted fields burned in, certificate/audit pages,
 * digital signature). CANCELLED is never sealed.
 *
 * - Recipients / QR tokens get the current bytes only once the envelope is COMPLETED; before that (pending,
 *   cancelled, rejected-and-sealed, ...) a preview serves the ORIGINAL, and a "signed" download is refused.
 * - Staff / API (owner-authorised, upstream behaviour): the requested version's bytes are served unchanged, but a
 *   download is only NAMED signed (`_signed.pdf`) for a COMPLETED envelope. A REJECTED envelope's sealed artifact
 *   stays available to the owner (it is the sealed record of the rejection, which upstream deliberately keeps), named
 *   `_rejected.pdf`. Anything else is the unsealed document and is named `<title>.pdf`.
 */
type Status = 'DRAFT' | 'PENDING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | (string & {});

type StoredBytes = { data: string; initialData: string };

/** The sealed bytes are the signed document only for a COMPLETED envelope. */
export const isSignedArtifactAvailable = (status: Status) => status === 'COMPLETED';

/** The seal job has run (or will run) for these statuses; `data` may differ from the original. */
export const isSealedStatus = (status: Status) => status === 'COMPLETED' || status === 'REJECTED';

// ---- recipient / QR token paths -------------------------------------------------------------------------------

/** Bytes a recipient/QR token may see for "the document" (preview, `current`): the original until COMPLETED. */
export const recipientViewableData = (status: Status, documentData: StoredBytes) =>
  isSignedArtifactAvailable(status) ? documentData.data : documentData.initialData;

/** `/dataId/:id/:version/item.pdf` by token: `current` falls back to `initial` until COMPLETED. */
export const recipientDocumentDataVersion = (status: Status, version: 'initial' | 'current') =>
  version === 'current' && isSignedArtifactAvailable(status) ? 'current' : 'initial';

/** `/token/.../envelopeItem/:id` preview: which static version to serve. */
export const recipientPreviewVersion = (status: Status): 'signed' | 'original' =>
  isSignedArtifactAvailable(status) ? 'signed' : 'original';

export const SIGNED_DOCUMENT_NOT_COMPLETE = {
  error: 'The signed document is available once everyone has signed',
  code: 'DOCUMENT_NOT_COMPLETE',
} as const;

/** Token download: the signed version only for a COMPLETED envelope; the original is always allowed. */
export const recipientDownloadRefusal = (status: Status, version: 'signed' | 'original') =>
  version === 'signed' && !isSignedArtifactAvailable(status) ? SIGNED_DOCUMENT_NOT_COMPLETE : null;

/** Recipient loader data: the id of a document's stored bytes, never the bytes (BYTES_64) or a storage key (S3). */
export const toRecipientDocumentDataRef = <T extends { id: string }>(documentData: T) => ({ id: documentData.id });

type WithDocumentData = {
  documentData: { id: string };
  envelopeItems: Array<{ documentData: { id: string } }>;
};

export type WithoutDocumentBytes<T extends WithDocumentData> = Omit<T, 'documentData' | 'envelopeItems'> & {
  documentData: { id: string };
  envelopeItems: Array<Omit<T['envelopeItems'][number], 'documentData'> & { documentData: { id: string } }>;
};

/** A recipient page's document with every `documentData` reduced to its id (the viewer fetches the PDF by token). */
export const withoutDocumentBytes = <T extends WithDocumentData>(document: T): WithoutDocumentBytes<T> => {
  const result = {
    ...document,
    documentData: toRecipientDocumentDataRef(document.documentData),
    envelopeItems: document.envelopeItems.map((item) => ({
      ...item,
      documentData: toRecipientDocumentDataRef(item.documentData),
    })),
  };

  // TS cannot narrow a spread of a generic item to Omit<item, 'documentData'> & { documentData }; it is that shape.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return result as unknown as WithoutDocumentBytes<T>;
};

// ---- staff / API paths (owner-authorised; bytes unchanged, honest names) -------------------------------------

/** Staff/API "signed"/"original": upstream semantics, `signed` reads `data`, `original` reads `initialData`. */
export const staffDownloadData = (version: 'signed' | 'original', documentData: StoredBytes) =>
  version === 'signed' ? documentData.data : documentData.initialData;

/**
 * Download file name. `_signed.pdf` only for the signed version of a COMPLETED envelope; `_rejected.pdf` for the
 * sealed artifact of a REJECTED one; `_pending.pdf` for the on-demand partial; otherwise `<title>.pdf`.
 * The `.pdf` strip keeps upstream's per-version case handling (case-sensitive for signed/original).
 */
export const envelopeDownloadFilename = (title: string, version: 'signed' | 'original' | 'pending', status: Status) => {
  if (version === 'pending') {
    return `${title.replace(/\.pdf$/i, '')}_pending.pdf`;
  }

  const baseTitle = title.replace(/\.pdf$/, '');

  if (version === 'signed' && status === 'COMPLETED') {
    return `${baseTitle}_signed.pdf`;
  }

  if (version === 'signed' && status === 'REJECTED') {
    return `${baseTitle}_rejected.pdf`;
  }

  return `${baseTitle}.pdf`;
};
