import { AppError, genericErrorCodeToTrpcErrorCodeMap } from '@documenso/lib/errors/app-error';
import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { createTrpcContext } from '@documenso/trpc/server/context';
import { appRouter } from '@documenso/trpc/server/router';
import { authenticatedMiddleware, procedure, router } from '@documenso/trpc/server/trpc';
import { createOpenApiFetchHandler } from '@documenso/trpc/utils/openapi-fetch-handler';
import type { AnyTRPCProcedure } from '@trpc/server';
import { TRPCError } from '@trpc/server';
import { Hono } from 'hono';
import { generateOpenApiDocument } from 'trpc-to-openapi';
import { z } from 'zod';
import { WebhookSchema } from '@documenso/prisma/generated/zod/modelSchema/WebhookSchema';
import type { HonoEnv } from '../router';
import { procedureInventory } from './policy';

const procedures: Record<string, AnyTRPCProcedure> = {};
for (const entry of procedureInventory) {
  if (entry.classification !== 'deal' || entry.openapi) {
    continue;
  }
  const native = (appRouter._def.procedures as unknown as Record<string, { _def: typeof procedure._def }>)[entry.name];
  if (native._def.middlewares[0] !== authenticatedMiddleware._middlewares[0]) {
    throw new Error(`Deal adapter requires native staff authentication: ${entry.name}`);
  }
  const output =
    native._def.output ??
    (entry.name === 'webhook.getTeamWebhooks'
      ? WebhookSchema.array()
      : entry.name === 'webhook.testWebhook'
        ? z.object({ success: z.boolean(), message: z.string().optional(), error: z.string().optional() })
        : entry.name.startsWith('webhook.')
          ? WebhookSchema
          : undefined);
  if (!output) {
    throw new Error(`Missing typed output for ${entry.name}`);
  }
  let builder = procedure
    .meta({
      openapi: {
        method: 'POST',
        path: `/${entry.name.replaceAll('.', '/')}`,
        summary: entry.name,
        tags: ['Chief deals'],
        contentTypes:
          entry.name.endsWith('updateBrandingLogo') || entry.name === 'envelope.item.replacePdf'
            ? ['multipart/form-data']
            : ['application/json'],
      },
    })
    .input(native._def.inputs[0] ?? z.object({}))
    .output(output)
    .use(async ({ ctx, input, next }) => {
      const token = ctx.req.headers.get('authorization');
      if (!token) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Per-staff team API token required' });
      }
      return next();
    });
  // Preserve the native input, authentication, authorization and output middleware chain.
  for (const middleware of native._def.middlewares.slice(0, -1)) {
    builder = builder.use(middleware);
  }
  builder = builder.use(async ({ ctx, input, next }) => {
    const scope = input && typeof input === 'object' && 'payload' in input ? input.payload : input;
    if (scope && typeof scope === 'object' && 'teamId' in scope && scope.teamId !== ctx.teamId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Token is bound to another team' });
    }
    return next();
  });
  const resolver = native._def.resolver!;
  procedures[entry.name.replaceAll('.', '_')] = builder.mutation(resolver);
}
export const dealRouter = router(procedures);
export const dealOpenApi = generateOpenApiDocument(dealRouter, {
  title: 'Chief Sign deal procedures',
  version: '1.0.0',
  baseUrl: `${NEXT_PUBLIC_WEBAPP_URL()}/api/deal`,
  securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'Authorization' } },
});
export const dealApi = new Hono<HonoEnv>()
  .get('/openapi.json', (c) => c.json(dealOpenApi))
  .all('*', (c) =>
    createOpenApiFetchHandler({
      endpoint: '/api/deal',
      router: dealRouter,
      createContext: () => createTrpcContext({ c, requestSource: 'apiV2' }),
      req: c.req.raw,
      responseMeta: ({ errors }) => {
        const cause = errors[0]?.cause;
        return cause instanceof AppError
          ? { status: genericErrorCodeToTrpcErrorCodeMap[cause.code]?.status ?? 400 }
          : {};
      },
    }),
  );
