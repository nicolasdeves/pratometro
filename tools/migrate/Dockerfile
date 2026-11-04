# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.10.4 prune @pratometro/database --docker

FROM base AS runner
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ .
RUN npm ci --ignore-scripts && npm cache clean --force
RUN npx prisma version
COPY --from=pruner /app/out/full/packages/database/prisma ./packages/database/prisma
COPY --from=pruner /app/out/full/packages/database/prisma.config.ts ./packages/database/prisma.config.ts

USER node
WORKDIR /app/packages/database
CMD ["npx", "prisma", "migrate", "deploy"]
