## node:24-alpine is intentionally not used here: @sparticuz/chromium ships a
## glibc-linked Chromium binary, which cannot run on Alpine's musl libc.
FROM node:24-bookworm-slim

# Shared libraries required by the headless Chromium binary bundled in @sparticuz/chromium.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# patches/ must be present before `yarn install` runs `postinstall` -
# patch-package applies patches/postman-collection+*.patch (a fix for
# CVE-2026-73231 in a transitive faker dependency) during that step, and
# silently no-ops if the patch file isn't there yet.
COPY package*.json yarn.lock ./
COPY patches ./patches
RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

EXPOSE 3000

CMD ["yarn", "dev"]