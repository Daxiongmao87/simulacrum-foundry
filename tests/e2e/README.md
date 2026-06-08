# Simulacrum E2E Testing

End-to-end testing infrastructure for the Simulacrum Foundry VTT module using [Playwright](https://playwright.dev).

## Overview

This suite runs every test inside a **completely isolated Foundry VTT instance**: fresh extraction, clean data directory, unique port, pre-written world. Tests are independent and can run in parallel.

### Test Lifecycle

**Global Setup (runs once per `npm run test:e2e` invocation):**
1. Validates `vendor/foundry/` contains at least one versioned zip
2. Resolves Foundry license (from local install or `.env.test` fallback)
3. Packages the Simulacrum module (`tools/package-module.js`)
4. Pre-caches game systems into `.foundry-system-cache/v{N}/{systemId}/` — a one-time Playwright browser pass that downloads and installs each system, then copies it out

**Per-Test Setup (via Playwright fixtures):**
1. Extracts fresh Foundry to `.foundry-test-{testId}/`
2. Creates clean data directory `.foundry-data-{testId}/`
3. Copies cached system + packaged module into the data directory
4. Pre-writes `world.json` to disk (avoids UI-based world creation; works on v13 and v14)
5. Pre-places `license.json` in `Config/` to skip the license/EULA screens
6. Starts Foundry on a dynamically allocated free port
7. Launches world and joins as Gamemaster

**Per-Test Teardown:**
1. Kills the Foundry server process
2. Deletes `.foundry-test-{testId}/` and `.foundry-data-{testId}/`

**Global Teardown:**
1. Scans for orphaned `main.mjs` (Foundry) processes and warns if any remain
2. Cleans up any orphaned test directories

---

## Multi-Version Testing

Drop multiple Foundry VTT zips into `vendor/foundry/` — tests run against each version automatically. The major version is parsed from the filename (`FoundryVTT-13.351.zip` → v13, `FoundryVTT-14.359.zip` → v14).

Playwright builds one project per `(system × version)`. With `TEST_SYSTEM_IDS=dnd5e` and both v13 and v14 present, you get projects `chromium-dnd5e-v13` and `chromium-dnd5e-v14` running in parallel.

To target a single version or system:

```bash
npm run test:e2e -- --project=chromium-dnd5e-v14
npm run test:e2e -- --project=chromium-dnd5e-v13
```

System caches are namespaced per version (`v13/dnd5e`, `v14/dnd5e`) so a v13 install is never reused for v14.

---

## Prerequisites

### 1. Foundry VTT License

You need a valid Foundry VTT license. If you have already launched Foundry on this machine and accepted the EULA, the suite will automatically locate `license.json` from the standard install location — no extra configuration needed:

- **Windows:** `%LOCALAPPDATA%\FoundryVTT\Config\license.json`
- **macOS:** `~/Library/Application Support/FoundryVTT/Config/license.json`
- **Linux:** `~/.local/share/FoundryVTT/Config/license.json`

If your `license.json` is elsewhere, set `FOUNDRY_LICENSE_JSON_PATH` in `.env.test`. If you have never launched Foundry locally, set `FOUNDRY_LICENSE_KEY` as a fallback.

### 2. Foundry VTT Installation Zip(s)

Place one or more versioned Foundry VTT zips in:

```
vendor/foundry/FoundryVTT-13.351.zip
vendor/foundry/FoundryVTT-14.359.zip
```

The filename **must** contain a `major.minor` token (e.g., `13.351`) so the runner can detect the version. This directory is gitignored — supply your own licensed copies.

### 3. Node.js Dependencies

```bash
npm install
npx playwright install chromium
```

---

## Setup

### 1. Create Environment File

```bash
cp tests/e2e/.env.test.example tests/e2e/.env.test
```

### 2. Configure `.env.test`

Edit `tests/e2e/.env.test`. The minimum required setting is an admin password:

```bash
FOUNDRY_ADMIN_KEY=my-admin-password
TEST_SYSTEM_IDS=dnd5e
```

`FOUNDRY_LICENSE_KEY` is only needed if `license.json` cannot be auto-resolved (see above). See [Environment Variables Reference](#environment-variables-reference) for all options.

### 3. Place Foundry Zip(s)

```bash
mkdir -p vendor/foundry
# Copy your FoundryVTT-XX.XXX.zip file(s) here
```

---

## Running Tests

### Full Suite

```bash
npm run test:e2e
```

### Specific Project (version or system)

```bash
npm run test:e2e -- --project=chromium-dnd5e-v14
npm run test:e2e -- --project=chromium-dnd5e-v13
```

### Filter by Test Name

```bash
npm run test:e2e -- --grep "chat"
npm run test:e2e -- --grep "sidebar"
```

### Debug / Headed Mode

```bash
# Open Playwright UI (interactive test runner)
npm run test:e2e:ui

# Run with visible browser window
npm run test:e2e:headed

# Step through a single test
npm run test:e2e:debug
```

---

## Test Structure

```
tests/e2e/
├── .env.test                # Local config (gitignored)
├── .env.test.example        # Template — copy to .env.test
├── playwright.config.js     # Playwright config; builds projects from vendor/foundry/ zips
├── README.md
│
├── setup/
│   ├── global-setup.js      # One-time: validate, package module, cache systems
│   └── global-teardown.js   # Failsafe: kill orphaned processes, clean orphaned dirs
│
├── fixtures/
│   ├── test-base.js         # Extended test object; defines all fixtures
│   ├── foundry-setup.js     # Per-test server lifecycle (extract → start → teardown)
│   ├── foundry-helpers.js   # Foundry interaction utilities (login, launchWorld, etc.)
│   ├── platform-utils.js    # Cross-platform: license resolution, port kill, zip extract
│   └── poll-utils.js        # pollUntil, pollForElement, waitForUiSettle helpers
│
└── specs/
    └── common/              # Runs for ALL configured systems × ALL versions
        ├── send-message.spec.js         # Sidebar renders; Simulacrum tab is accessible
        ├── sidebar-tab.spec.js          # Sidebar tab UI smoke tests
        └── chat-message-compat.spec.js  # v13/v14 ChatMessage API compatibility
```

Tests placed under `specs/common/` run against every `(system × version)` combination. To add tests for a specific system only, create `specs/systems/{systemId}/your-test.spec.js`.

---

## Writing Tests

### Basic Pattern

```javascript
import { test, expect } from '../../fixtures/test-base.js';

test.describe('my feature', () => {
  test('does something', async ({ simulacrumPage, foundryVersion }) => {
    // simulacrumPage: authenticated page inside a world with Simulacrum active
    // foundryVersion: integer (13, 14, …)

    const result = await simulacrumPage.evaluate(() => {
      return game.modules.get('simulacrum')?.active;
    });
    expect(result).toBe(true);
  });
});
```

### Available Fixtures

| Fixture | Description |
|---------|-------------|
| `systemId` | Game system being tested (e.g., `"dnd5e"`) |
| `foundryVersion` | Major version integer (e.g., `13`, `14`) |
| `foundryZip` | Absolute path to the Foundry zip for this run |
| `testEnv` | Parsed key/value map from `.env.test` |
| `foundryServer` | Core fixture — isolated server; yields `{ baseUrl, worldId, adminKey, port }` |
| `worldId` | World ID for the current test (derived from `foundryServer`) |
| `isolatedContext` | Fresh `BrowserContext` pointed at `foundryServer.baseUrl` |
| `page` | Unauthenticated page navigated to Foundry root |
| `adminPage` | Authenticated page at `/setup` |
| `gamePage` | Page inside the test world, joined as Gamemaster |
| `simulacrumPage` | `gamePage` with Simulacrum module confirmed active |
| `foundry` | All exports from `foundry-helpers.js` |

### Version-Gating

```javascript
test('v14-specific API', async ({ simulacrumPage, foundryVersion }) => {
  test.skip(foundryVersion < 14, 'v14 only');
  // …
});
```

### Accessing Foundry APIs in Tests

Use `page.evaluate()` to run code inside the Foundry context:

```javascript
const userId = await simulacrumPage.evaluate(() => game.user.id);

// v13/v14 compat pattern (same as chat-interface.js)
const styles = await simulacrumPage.evaluate(() => {
  return CONST.CHAT_MESSAGE_STYLES ?? CONST.CHAT_MESSAGE_TYPES;
});
```

---

## System Caching

The first run for a given `(system × version)` pair downloads and installs the system via a temporary Foundry server. The result is saved to `.foundry-system-cache/v{N}/{systemId}/`. Subsequent runs skip the download and copy from the cache.

To force a re-cache (e.g., after a system update), delete the relevant cache entry:

```bash
# Windows PowerShell
Remove-Item -Recurse -Force .foundry-system-cache/v14/dnd5e

# macOS/Linux
rm -rf .foundry-system-cache/v14/dnd5e
```

The cache directory is gitignored.

---

## Troubleshooting

### Tests Fail at Startup

Check for orphaned Foundry processes (the global teardown reports them by PID but doesn't kill them automatically):

Clean up orphaned processes and directories, then rerun:

```bash
# Windows PowerShell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force .foundry-test-*, .foundry-data-*, .foundry-cache-*

# macOS/Linux
pkill -f "main.mjs"
rm -rf .foundry-test-* .foundry-data-* .foundry-cache-*
```

### License / EULA Screen Still Appears

The runner auto-resolves `license.json` from the standard Foundry install location. If it cannot find it, set an explicit path in `.env.test`:

```bash
FOUNDRY_LICENSE_JSON_PATH=C:\Users\You\AppData\Local\FoundryVTT\Config\license.json
```

If you have never launched Foundry locally and accepted the EULA, do that first (or set `FOUNDRY_LICENSE_KEY` as a fallback).

### System Cache Not Populating

Global setup installs systems via a browser-automated Foundry server. To diagnose:

1. Delete the failing cache entry and rerun — a screenshot is saved to `tests/e2e/test-results/` on failure
2. Ensure the system ID in `TEST_SYSTEM_IDS` is a valid Foundry package ID (e.g., `dnd5e`, `pf2e`)

### Module Not Loading

1. Verify `tools/package-module.js` succeeds: `node tools/package-module.js`
2. Check that `module.json` `id` is `"simulacrum"`

---

## Environment Variables Reference

Stored in `tests/e2e/.env.test` (gitignored). Copy `.env.test.example` as a starting point.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FOUNDRY_ADMIN_KEY` | No | `test-admin-key` | Admin password for all test instances |
| `TEST_SYSTEM_IDS` | No | `dnd5e` | Comma-separated game system IDs to test against |
| `FOUNDRY_LICENSE_KEY` | No | — | Foundry license key — only needed if `license.json` cannot be auto-resolved from a local install |
| `FOUNDRY_LICENSE_JSON_PATH` | No | Platform default | Explicit path to `license.json` (overrides auto-resolution) |
| `DEBUG_FOUNDRY` | No | — | Set to any non-empty value to print Foundry server stdout/stderr |
