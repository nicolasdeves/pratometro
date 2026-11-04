# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.10.4 prune web --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN npm ci --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN npx turbo run build --filter=web

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
