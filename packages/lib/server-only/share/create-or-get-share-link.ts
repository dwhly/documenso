import { AppError, AppErrorCode } from '../../errors/app-error';

export type CreateSharingIdOptions =
  | {
      documentId: number;
      token: string;
    }
  | {
      documentId: number;
      userId: number;
    };

export const createOrGetShareLink = async (_options: CreateSharingIdOptions) => {
  throw new AppError(AppErrorCode.FORBIDDEN, { message: 'Document sharing is disabled.' });
};
