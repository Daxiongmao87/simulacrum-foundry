FROM node:24.11.0-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV AGENTIC_DELIVERY_NODE_MODULES_CACHE=/opt/agentic-delivery/simulacrum-node_modules

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
  && mkdir -p /opt/agentic-delivery/simulacrum-node_modules \
  && cp -a node_modules/. /opt/agentic-delivery/simulacrum-node_modules/ \
  && rm -rf node_modules \
  && npx playwright install --with-deps chromium \
  && npm cache clean --force

