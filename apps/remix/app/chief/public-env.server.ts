import { createPublicEnv } from '@documenso/lib/utils/env';

export const createChiefPublicEnv = (request: Request) => {
  const environment: Record<string, string | undefined> = createPublicEnv();
  const configured = process.env.CHIEF_RECIPIENT_URL;
  if (configured && new URL(request.url).origin === new URL(configured).origin) {
    environment.NEXT_PUBLIC_WEBAPP_URL = configured;
  }
  return environment;
};
