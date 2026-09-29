# syntax=docker/dockerfile:1
FROM node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe

# pnpm via corepack (bundled with this Node image) instead of a separate
# `npm install -g pnpm`, to avoid a second global-install layer and keep the
# package manager pinned to the exact version declared in package.json.
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

# poppler-utils is used only for host-side / CI structural inspection of the
# generated PDF (pdfinfo, pdffonts, pdfimages, pdftotext, pdftoppm); it is not
# required by the app itself but is installed here so evidence step 6 can run
# fully inside the image without extra containers.
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
RUN chown -R node:node /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

USER node
RUN pnpm install --frozen-lockfile

# Playwright OS-level dependencies require apt/root; the browser binary
# download is run afterwards as `node` so the files under
# PLAYWRIGHT_BROWSERS_PATH are owned by the user that will execute them.
USER root
RUN pnpm exec playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /ms-playwright \
    && chown -R node:node /ms-playwright

USER node
RUN pnpm exec playwright install chromium

COPY --chown=node:node . .

USER node
CMD ["pnpm", "typecheck"]
