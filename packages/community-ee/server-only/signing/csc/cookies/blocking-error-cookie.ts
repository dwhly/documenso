import { unsupported } from '../../../../unsupported';
export const readCscBlockingErrorFromRequest = async (_request: Request): Promise<{ recipientToken: string; code: string; message: string } | null> => null;
export const expiredCscBlockingErrorCookieHeader = (): string => 'chief_csc_disabled=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';
export const setCscBlockingErrorCookie = async (_options: unknown): Promise<never> => unsupported();
