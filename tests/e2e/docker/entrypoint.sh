#!/bin/bash
# Streamlined Foundry install entrypoint for the e2e test image.
# Installs Foundry from a cached zip, applies the license, then hands off
# to launcher.sh (which runs the test suite instead of the Foundry server).
set -euo pipefail

# Source FOUNDRY_* env vars baked in from the felddy stage at image build time
# (e.g. FOUNDRY_VERSION=14.363). Docker does not carry ENV across base-image
# switches, so we persist them to a file and source it here.
if [ -f /home/node/.foundry_env ]; then
  # shellcheck disable=SC1091
  set -a; source /home/node/.foundry_env; set +a
fi

FOUNDRY_VERSION="${FOUNDRY_VERSION:-}"
CONTAINER_CACHE="${CONTAINER_CACHE:-/foundry-cache}"
INSTALL_DIR="/home/node/resources/app"
DATA_DIR="/data"
CONFIG_DIR="${DATA_DIR}/Config"

# ── Install Foundry ───────────────────────────────────────────────────────────

if [ ! -f "${INSTALL_DIR}/main.mjs" ]; then
  ZIP="${CONTAINER_CACHE}/foundryvtt-${FOUNDRY_VERSION}.zip"

  if [ ! -f "${ZIP}" ]; then
    echo "[entrypoint] ERROR: Foundry zip not found at ${ZIP}"
    echo "[entrypoint] Place foundryvtt-${FOUNDRY_VERSION}.zip in the CONTAINER_CACHE directory"
    echo "[entrypoint] or set FOUNDRY_USERNAME + FOUNDRY_PASSWORD in tests/e2e/.env.test"
    exit 1
  fi

  echo "[entrypoint] Installing Foundry VTT ${FOUNDRY_VERSION}..."
  mkdir -p "${INSTALL_DIR}"
  unzip -q "${ZIP}" -d "${INSTALL_DIR}"
  echo "[entrypoint] Installation complete."
else
  echo "[entrypoint] Foundry VTT ${FOUNDRY_VERSION} already installed."
fi

# ── Apply license ─────────────────────────────────────────────────────────────

mkdir -p "${CONFIG_DIR}"
if [ -n "${FOUNDRY_LICENSE_JSON_B64:-}" ]; then
  echo "${FOUNDRY_LICENSE_JSON_B64}" | base64 -d > "${CONFIG_DIR}/license.json"
  echo "[entrypoint] License applied from FOUNDRY_LICENSE_JSON_B64."
elif [ -n "${FOUNDRY_LICENSE_KEY:-}" ]; then
  echo "{ \"license\": \"${FOUNDRY_LICENSE_KEY}\" }" | tr -d '-' > "${CONFIG_DIR}/license.json"
  echo "[entrypoint] License applied from FOUNDRY_LICENSE_KEY."
else
  echo "[entrypoint] WARNING: No license provided — Foundry will prompt on first run."
fi

# ── Run tests ─────────────────────────────────────────────────────────────────

exec /home/node/launcher.sh
