import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';

import { procedure } from '../trpc';
import { ZShareDocumentRequestSchema, ZShareDocumentResponseSchema } from './share-document.types';

// Note: This is an unauthenticated route.
export const shareDocumentRoute = procedure
  .input(ZShareDocumentRequestSchema)
  .output(ZShareDocumentResponseSchema)
  .mutation(async () => {
    throw new AppError(AppErrorCode.FORBIDDEN, { message: 'Document sharing is disabled.' });
  });
