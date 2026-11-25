# syntax=docker/dockerfile:1.7
# Build from the repo root: docker build -f apps/worker/Dockerfile -t domik-worker .
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# 1) Prune the monorepo down to the worker and its workspace deps.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2 prune @domik/worker --docker

# 2) Install deps (cached on lockfile), then build.
FROM base AS builder
COPY --from=pruner /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
COPY tsconfig.base.json ./
RUN pnpm turbo run build --filter=@domik/worker

# 3) Runtime: a single bundled file, no node_modules.
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production TZ=UTC
WORKDIR /app
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs worker
COPY --from=builder --chown=worker:nodejs /repo/apps/worker/dist ./dist
# SQL migrations for `node dist/cli/migrate.js`.
COPY --from=builder --chown=worker:nodejs /repo/packages/db/drizzle ./drizzle
USER worker
CMD ["node", "--enable-source-maps", "dist/index.js"]
