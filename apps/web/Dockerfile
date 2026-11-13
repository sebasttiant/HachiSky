# syntax=docker/dockerfile:1
FROM node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS base

# Node 26 no longer bundles Corepack. Install the exact pnpm version declared
# in package.json so local and container dependency resolution stay aligned.
RUN npm install --global pnpm@12.18.0 --no-audit --no-fund

WORKDIR /app
RUN chown -R node:node /app
USER node

FROM base AS deps
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS test
COPY --chown=node:node . .
CMD ["pnpm", "test"]

FROM deps AS build
COPY --chown=node:node . .
RUN pnpm build

# Known limitation (U1 scope): the runtime image keeps devDependencies and
# the full source tree instead of a slimmed production-only install, to keep
# this infrastructure spike simple. Revisit before a real production deploy.
FROM build AS runtime
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
