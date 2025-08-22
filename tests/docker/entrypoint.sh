#!/bin/bash
set -e

# DockerTestRunner Integration Entrypoint
# Handles FoundryVTT startup with proper module mounting and configuration

echo "🐳 FoundryVTT Docker Container Starting..."
echo "📊 Data Path: ${FOUNDRY_DATA_PATH}"
echo "🔑 License Key: ${FOUNDRY_LICENSE_KEY:0:4}****"

# Ensure data directory structure exists
mkdir -p "${FOUNDRY_DATA_PATH}/Data/modules"
mkdir -p "${FOUNDRY_DATA_PATH}/Data/systems" 
mkdir -p "${FOUNDRY_DATA_PATH}/Data/worlds"

# Mount Simulacrum module if available (will be mounted by DockerTestRunner)
if [ -d "/modules/simulacrum" ]; then
    echo "📦 Mounting Simulacrum module..."
    ln -sf /modules/simulacrum "${FOUNDRY_DATA_PATH}/Data/modules/simulacrum"
fi

# Mount test systems if available (will be mounted by DockerTestRunner)
if [ -d "/systems" ]; then
    echo "🎲 Mounting game systems..."
    for system in /systems/*; do
        if [ -d "$system" ]; then
            system_name=$(basename "$system")
            ln -sf "$system" "${FOUNDRY_DATA_PATH}/Data/systems/$system_name"
            echo "   - $system_name"
        fi
    done
fi

# Create basic configuration if it doesn't exist
CONFIG_FILE="${FOUNDRY_DATA_PATH}/Config/options.json"
mkdir -p "$(dirname "$CONFIG_FILE")"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "⚙️ Creating default configuration..."
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

# Wait for any initialization tasks
echo "⏳ Initializing FoundryVTT..."
sleep 2

# Start FoundryVTT with provided arguments
echo "🚀 Starting FoundryVTT server..."
echo "📍 Using main.js path: ${FOUNDRY_MAIN_JS_PATH}"

# Verify main.js exists
if [ ! -f "${FOUNDRY_MAIN_JS_PATH}" ]; then
    echo "❌ main.js not found at ${FOUNDRY_MAIN_JS_PATH}"
    echo "📁 Available files in /app:"
    find /app -name "main.js" -type f 2>/dev/null || echo "No main.js files found"
    exit 1
fi

cd /app
exec node "${FOUNDRY_MAIN_JS_PATH}" --dataPath="${FOUNDRY_DATA_PATH}" "$@"