# syntax=docker/dockerfile:1.7
# Build from the repo root: docker build -f apps/web/Dockerfile -t domik-web .
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /repo

# 1) Prune the monorepo down to the web app and its workspace deps.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2 prune @domik/web --docker

# 2) Install deps (cached on lockfile), then build the standalone Next.js output.
FROM base AS builder
COPY --from=pruner /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
COPY tsconfig.base.json ./
RUN pnpm turbo run build --filter=@domik/web

# 3) Runtime: only the traced standalone server + static assets.
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=UTC PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
