#!/bin/bash
set -e

echo "FoundryVTT container starting..."
echo "Data Path: ${FOUNDRY_DATA_PATH}"
echo "License Key: ${FOUNDRY_LICENSE_KEY:0:4}****"

mkdir -p "${FOUNDRY_DATA_PATH}/Data/modules" "${FOUNDRY_DATA_PATH}/Data/systems" "${FOUNDRY_DATA_PATH}/Data/worlds"

CONFIG_FILE="${FOUNDRY_DATA_PATH}/Config/options.json"
mkdir -p "$(dirname "$CONFIG_FILE")"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << EOF
{
  "port": 30000,
  "upnp": false,
  "fullscreen": false,
  "hostname": null,
  "routePrefix": null,
  "sslCert": null,
  "sslKey": null,
  "awsConfig": null,
  "dataPath": "${FOUNDRY_DATA_PATH}/Data",
  "proxySSL": false,
  "proxyPort": null,
  "minifyStaticFiles": false,
  "updateChannel": "stable",
  "language": "en.core",
  "world": null,
  "demo": false,
  "noUpdate": true
}
EOF
fi

echo "Starting FoundryVTT..."
if [ ! -f "${FOUNDRY_MAIN_JS_PATH}" ]; then
  echo "main.js not found at ${FOUNDRY_MAIN_JS_PATH}"
  find /app -name main.js -type f || true
  exit 1
fi

cd /app
exec node "${FOUNDRY_MAIN_JS_PATH}" --dataPath="${FOUNDRY_DATA_PATH}" "$@"

