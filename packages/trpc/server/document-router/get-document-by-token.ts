import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { recipientViewableData } from '@documenso/lib/utils/envelope-artifact';
import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';

import { authenticatedProcedure } from '../trpc';
import { ZGetDocumentByTokenRequestSchema, ZGetDocumentByTokenResponseSchema } from './get-document-by-token.types';

export const getDocumentByTokenRoute = authenticatedProcedure
  .input(ZGetDocumentByTokenRequestSchema)
  .output(ZGetDocumentByTokenResponseSchema)
  .query(async ({ input, ctx }) => {
    const { token } = input;

    const envelope = await prisma.envelope.findFirst({
      where: {
        type: EnvelopeType.DOCUMENT,
        recipients: {
          some: {
            token,
            email: ctx.user.email,
          },
        },
      },
      include: {
        envelopeItems: {
          include: {
            documentData: true,
          },
        },
      },
    });

    const firstDocumentData = envelope?.envelopeItems[0].documentData;

    if (!envelope || !firstDocumentData) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Document not found',
      });
    }

    if (envelope.envelopeItems.length !== 1) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'This endpoint does not support multiple items',
      });
    }

    ctx.logger.info({
      documentId: envelope.id,
    });

    // Fleet (review r2 [1]): a recipient token gets the current (possibly sealed) bytes only once COMPLETED.
    return {
      documentData: {
        ...firstDocumentData,
        data: recipientViewableData(envelope.status, firstDocumentData),
      },
    };
  });
