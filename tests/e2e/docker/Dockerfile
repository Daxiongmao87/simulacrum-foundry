ARG FOUNDRY_TAG=14
FROM felddy/foundryvtt:${FOUNDRY_TAG}

USER root

# Install npm (removed from felddy runtime image) and Playwright system dependencies
RUN apt-get update -qq \
    && apt-get install -y -qq npm \
    && rm -rf /var/lib/apt/lists/*

# Pre-install Playwright Chromium + its system deps so CI and local runs skip this step
RUN npx playwright install chromium --with-deps

USER node
