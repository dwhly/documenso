FROM node:24-bookworm-slim AS dependencies
ENV HUSKY=0 DOCKER_OUTPUT=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY json/ ./
COPY patches/ ./patches/
COPY prisma/ ./packages/prisma/
RUN npm ci --omit=dev --no-audit --no-fund && npx prisma generate --schema packages/prisma/schema.prisma --generator client && rm -f node_modules/@documenso/ee && npm cache clean --force

FROM node:24-bookworm-slim
ENV NODE_ENV=production HUSKY=0 DOCKER_OUTPUT=1 DOCUMENSO_DISABLE_TELEMETRY=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/packages ./packages
COPY --chown=node:node build/ ./apps/remix/build/
COPY --chown=node:node public/ ./apps/remix/public/
COPY --chown=node:node remix-package.json ./apps/remix/package.json
COPY --chown=node:node start.sh ./apps/remix/start.sh
USER node
WORKDIR /app/apps/remix
EXPOSE 3000
CMD ["sh", "start.sh"]
