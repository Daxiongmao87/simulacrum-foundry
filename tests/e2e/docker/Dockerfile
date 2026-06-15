# syntax=docker/dockerfile:1
ARG FOUNDRY_TAG=14
# PLAYWRIGHT_VERSION must match the @playwright/test version in package.json.
# build-container.js reads it automatically from node_modules and passes it here.
ARG PLAYWRIGHT_VERSION=v1.58.0

# Stage 1: alias felddy only to capture its FOUNDRY_VERSION env var.
# Docker does not carry ENV across a base-image switch, so we write it to a
# file here and COPY it into stage 2.
FROM felddy/foundryvtt:${FOUNDRY_TAG} AS fvttcontainer
RUN env | grep ^FOUNDRY_ > /home/node/.foundry_env

# Stage 2: playwright base — Chromium + all system libs already present.
# Use the jammy (Ubuntu 22.04) variant; pin to the exact playwright version
# so the pre-installed Chromium matches what @playwright/test expects.
FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}-jammy

RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node

# Restore FOUNDRY_* env vars (e.g. FOUNDRY_VERSION=14.363) from stage 1.
COPY --from=fvttcontainer /home/node/.foundry_env /home/node/.foundry_env

# Our entrypoint installs Foundry from the cached zip and applies the license,
# then delegates to launcher.sh to run the test suite.
COPY entrypoint.sh /home/node/entrypoint.sh
COPY test-launcher.sh /home/node/launcher.sh
RUN chmod +x /home/node/entrypoint.sh /home/node/launcher.sh

RUN mkdir -p /home/node/resources /data

ENTRYPOINT ["/home/node/entrypoint.sh"]
