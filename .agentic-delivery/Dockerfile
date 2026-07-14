FROM node:24.11.0-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    iproute2 \
    unzip \
    zip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci \
  && npx playwright install --with-deps chromium \
  && npm cache clean --force

COPY . .
