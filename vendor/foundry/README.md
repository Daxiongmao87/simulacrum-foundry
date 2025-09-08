Vendor FoundryVTT Node Zips (Untracked)

Place your FoundryVTT Node build zip(s) here to build a local Docker image for testing.

Requirements:
- FoundryVTT Node zip for v13 (e.g., FoundryVTT-Node-13.347.zip)
- Valid license to obtain the zip

Usage:
- Build image:
  npm run build:foundry-image -- --version v13 --tag v13-local --zip vendor/foundry/FoundryVTT-Node-13.347.zip

Notes:
- These zips are NOT source-controlled. See .gitignore rules.
- Do not commit licensed binaries. Each developer should obtain their own copy.

