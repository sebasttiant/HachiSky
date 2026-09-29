# syntax=docker/dockerfile:1
FROM node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe AS base

# pnpm via corepack (bundled with this Node image), pinned to the exact
# version declared in package.json's packageManager field.
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

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
