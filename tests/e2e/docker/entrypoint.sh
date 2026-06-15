#!/bin/bash
set -euo pipefail

CONTAINER_CACHE="${CONTAINER_CACHE:-/foundry-cache}"

# Derive version from the zip filename if not supplied explicitly.
if [ -z "${FOUNDRY_VERSION:-}" ]; then
  ZIP=$(ls "${CONTAINER_CACHE}"/foundryvtt-*.zip 2>/dev/null | head -1)
  if [ -z "${ZIP:-}" ]; then
    echo "[entrypoint] ERROR: No Foundry zip found in ${CONTAINER_CACHE} and FOUNDRY_VERSION is unset"
    exit 1
  fi
  FOUNDRY_VERSION=$(basename "$ZIP" | grep -oP '\d+\.\d+')
fi
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
