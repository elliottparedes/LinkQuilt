# ─── Build Stage ───────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Generous npm fetch timeouts/retries: under QEMU emulation (local arm64
# verification) tarball downloads are slow enough to trip npm's 30s default
# fetch timeout, aborting the whole install on a random package.
RUN npm install --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000

COPY . .

# Demo env vars — passed as build args so next.config.ts can evaluate them
# at build time (Next.js bakes config into the standalone output).
# For non-demo builds, omit these args (defaults to secure mode).
ARG DEMO_MODE=false
ARG DEMO_AUTO_LOGIN=false
ARG DEMO_FRAME_ORIGIN=""
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV DEMO_MODE=${DEMO_MODE}
ENV DEMO_AUTO_LOGIN=${DEMO_AUTO_LOGIN}
ENV DEMO_FRAME_ORIGIN=${DEMO_FRAME_ORIGIN}
ENV NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE}
RUN npx next build

# ─── Runner Stage ──────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create data directory as root BEFORE switching to node user
RUN mkdir -p /app/data && chown node:node /app/data

# Copy built app with correct ownership
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/src/db/postgres ./src/db/postgres
COPY --from=builder --chown=node:node /app/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=node:node /app/src/db/bootstrap.mjs ./src/db/bootstrap.mjs
COPY --from=builder --chown=node:node /app/scripts/import-sqlite.mjs ./scripts/import-sqlite.mjs

# Switch to non-root user
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/api/health || exit 1

# Override Docker's HOSTNAME so Next.js binds to 0.0.0.0
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
