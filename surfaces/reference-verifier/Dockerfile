# PEAC Reference Verifier — OCI image
#
# Multi-stage build. First stage installs and builds the monorepo; second stage
# copies the built apps/api output plus its workspace dependencies and runs a
# non-root node process.
#
# Build context is the repo root (../..). Tag example:
#   docker build -f surfaces/reference-verifier/Dockerfile -t peac-reference-verifier:local .

# --- Stage 1: build ---
FROM node:24.14.1-alpine AS build

RUN apk add --no-cache git python3 make g++

WORKDIR /workspace

# Install pnpm pinned to the repo's declared packageManager version.
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Copy only the lockfile + workspace manifests first for better cache reuse.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages ./packages

# Install workspace dependencies (dev included; required for build).
RUN pnpm install --frozen-lockfile --prefer-offline

# Copy the rest of the repo and build the verifier plus its dependencies.
COPY . .
RUN pnpm --filter @peac/app-api... build

# Prune dev dependencies for the runtime stage.
RUN pnpm --filter @peac/app-api... --prod deploy /deploy

# --- Stage 2: runtime ---
FROM node:24.14.1-alpine AS runtime

RUN addgroup -S peac && adduser -S peac -G peac

WORKDIR /app

COPY --from=build --chown=peac:peac /deploy ./

USER peac

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/server.js"]
