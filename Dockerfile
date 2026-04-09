# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY apps ./apps

RUN CI=true pnpm build && CI=true pnpm prune --prod

FROM node:24-bookworm-slim AS runtime

ARG VERSION=v0.0.0-dev
ARG COMMIT=unknown

ENV NODE_ENV=production
ENV PORT=3000
ENV MEDIA_TAGGER_VERSION=${VERSION}
ENV MEDIA_TAGGER_GIT_HASH=${COMMIT}

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libimage-exiftool-perl tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/apps/web/dist ./apps/web/dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/api/dist/server.js"]