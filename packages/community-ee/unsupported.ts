import { AppError } from '@documenso/lib/errors/app-error';

export const unsupported = (..._args: unknown[]): never => {
  throw new AppError('NOT_SUPPORTED', { statusCode: 501, message: 'This capability is not supported by Chief Sign.' });
};
