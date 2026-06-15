#!/bin/bash
# Installed as /home/node/launcher.sh — called by entrypoint.sh after Foundry
# is extracted and licensed. Runs the Playwright test suite instead of the server.
set -e
cd /workspace
npm ci
exec stdbuf -oL -eL npm run test:e2e
