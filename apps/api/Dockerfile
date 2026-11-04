# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.10.4 prune api --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN npm ci --ignore-scripts
COPY --from=pruner /app/out/full/ .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx turbo run build --filter=api

FROM base AS runner
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ .
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/generated ./packages/database/generated
COPY --from=builder /app/apps/api/dist ./apps/api/dist

USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
