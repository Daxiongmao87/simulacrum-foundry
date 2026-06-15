# syntax=docker/dockerfile:1
# PLAYWRIGHT_VERSION must match the @playwright/test version in package.json.
# build-container.js reads it automatically from node_modules and passes it here.
ARG PLAYWRIGHT_VERSION=v1.58.0

FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}-jammy

RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node

COPY entrypoint.sh /home/node/entrypoint.sh
COPY test-launcher.sh /home/node/launcher.sh
RUN chmod +x /home/node/entrypoint.sh /home/node/launcher.sh

RUN mkdir -p /home/node/resources /data

ENTRYPOINT ["/home/node/entrypoint.sh"]
