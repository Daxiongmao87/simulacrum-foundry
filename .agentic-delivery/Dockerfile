FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV AGENTIC_DELIVERY_NODE_MODULES_CACHE=/opt/agentic-delivery/simulacrum-node_modules

WORKDIR /workspace

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    ca-certificates \
    git \
    iproute2 \
    unzip \
    zip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci \
  && ./node_modules/.bin/playwright install --with-deps chromium \
  && mkdir -p /opt/agentic-delivery/simulacrum-node_modules \
  && cp -a node_modules/. /opt/agentic-delivery/simulacrum-node_modules/ \
  && rm -rf node_modules \
  && npm cache clean --force
