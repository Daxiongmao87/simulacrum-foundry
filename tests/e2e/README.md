# Simulacrum E2E Testing

End-to-end testing infrastructure for the Simulacrum Foundry VTT module using [Playwright](https://playwright.dev).

## Overview

This E2E test suite provides comprehensive testing of Simulacrum within an actual Foundry VTT instance using **per-test isolation** - each test gets its own Foundry server instance for complete independence.

### Test Lifecycle

**Global Setup (runs once):**
1. Validates Foundry zip exists in `vendor/foundry/`
2. Validates license key in `.env.test`
3. Packages the Simulacrum module
4. Pre-caches game systems to `.foundry-system-cache/` (avoids re-downloading per test)

**Per-Test Setup (via fixtures):**
1. Extracts fresh Foundry to `.foundry-test-{testId}/`
2. Creates clean data directory `.foundry-data-{testId}/`
3. Copies cached system and module files
4. Starts Foundry server on unique port (`30000 + workerIndex`)
5. Uses Playwright to handle license/EULA and create test world
6. Launches world, joins as Gamemaster
7. Verifies/enables Simulacrum module

**Per-Test Teardown:**
1. Kills server process
2. Deletes `.foundry-test-{testId}/` and `.foundry-data-{testId}/`

**Global Teardown:**
1. Kills any orphaned processes on ports 30000-30010
2. Cleans up any orphaned test directories

## Multi-System Testing

Tests automatically run against each configured game system. This ensures Simulacrum works correctly across different RPG systems.

### Configuration

In `.env.test`:

```bash
# Single system (default)
TEST_SYSTEM_IDS=dnd5e

# Multiple systems - tests run against EACH
TEST_SYSTEM_IDS=dnd5e,pf2e

# Any system in Foundry's package browser works!
TEST_SYSTEM_IDS=dnd5e,pf2e,swade,coc7,wfrp4e
```

No manifest URLs needed - systems are installed via Foundry's UI using the system ID.

### How It Works

1. **Global Setup** pre-caches each system by:
   - Starting a temporary Foundry server
   - Using Playwright to install systems via Foundry's UI
   - Copying installed systems to `.foundry-system-cache/`
   - Killing the temporary server
2. **Per-Test Fixtures** copy from the cache (fast local copy vs slow download)
3. **Playwright** generates a separate project for each system (e.g., `chromium-dnd5e`, `chromium-pf2e`)
4. **Tests** run against each system independently with full isolation
5. **Reports** show results per system

### Accessing System in Tests

```javascript
import { test, expect } from '../fixtures/test-base.js';

test('system-specific test', async ({ gamePage, systemId, worldId }) => {
  console.log(`Testing on: ${systemId}`); // e.g., "dnd5e" or "pf2e"
  console.log(`World: ${worldId}`);       // e.g., "simulacrum-test-world-dnd5e"
  
  // System-specific assertions
  if (systemId === 'pf2e') {
    // PF2e-specific test logic
  }
});
```

## Prerequisites

### 1. Foundry VTT License

You need a valid Foundry VTT license. The license key should be added to your `.env.test` file.

### 2. Foundry VTT Installation File

Place your Foundry VTT installation zip file in:

```
vendor/foundry/FoundryVTT-XX.XXX.zip
```

> ⚠️ This folder is gitignored. You must provide your own licensed copy.

### 3. Node.js Dependencies

```bash
npm install
```

## Setup

### 1. Create Environment File

```bash
cp tests/e2e/.env.test.example tests/e2e/.env.test
```

### 2. Configure Environment

Edit `tests/e2e/.env.test` with your:

- Foundry license key
- Admin password
- Game system preferences
- API keys (if testing LLM integration)

### 3. Place Foundry VTT

```bash
mkdir -p vendor/foundry
# Copy your FoundryVTT-XX.XXX.zip file here
```

## Running Tests

### Full Test Suite

```bash
npm run test:e2e
```

### Specific Test File

```bash
npm run test:e2e -- --grep "Panel"
```

### With UI (Debug Mode)

```bash
npm run test:e2e:ui
```

### Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Debug Single Test

```bash
npm run test:e2e:debug
```

## Test Structure

```
tests/e2e/
├── playwright.config.js     # Playwright configuration
├── .env.test               # Test environment (gitignored)
├── .env.test.example       # Template for .env.test
├── README.md               # This file
│
├── setup/
│   ├── global-setup.js     # One-time: validate, package module, cache systems
│   └── global-teardown.js  # Failsafe: kill orphaned processes, clean orphaned dirs
│
├── fixtures/
│   ├── foundry-helpers.js  # Foundry interaction utilities
│   ├── foundry-setup.js    # Per-test server lifecycle (extract, start, teardown)
│   └── test-base.js        # Extended test fixtures
│
├── specs/
│   ├── common/             # Tests that run for ALL systems
│   │   ├── smoke.spec.js       # Basic sanity checks
│   │   ├── module-load.spec.js # Module loading tests
│   │   ├── panel.spec.js       # Panel UI tests
│   │   └── settings.spec.js    # Settings functionality
│   │
│   └── systems/            # System-specific tests
│       ├── dnd5e/          # D&D 5e specific tests
│       │   └── integration.spec.js
│       ├── pf2e/           # Pathfinder 2e specific tests
│       │   └── integration.spec.js
│       └── swade/          # Savage Worlds specific tests
│           └── integration.spec.js
│
├── reports/                # HTML test reports (gitignored)
├── screenshots/            # Failure screenshots (gitignored)
└── test-results/           # Test artifacts (gitignored)
```

### Test Routing

- **`specs/common/`**: Tests run for EVERY configured system
- **`specs/systems/{systemId}/`**: Tests run ONLY for that specific system

When you configure `TEST_SYSTEM_IDS=dnd5e,pf2e`:
- Common tests run twice (once per system)
- `specs/systems/dnd5e/` tests run only on dnd5e
- `specs/systems/pf2e/` tests run only on pf2e

## Writing Tests

### Using Fixtures

```javascript
import { test, expect } from '../fixtures/test-base.js';

test('my test', async ({ simulacrumPage, foundry }) => {
  // simulacrumPage is authenticated with world loaded and module active
  // foundry provides helper functions
  
  const panel = await foundry.openSimulacrumPanel(simulacrumPage);
  await expect(panel).toBeVisible();
});
```

### Available Fixtures

| Fixture | Timeout | Description |
|---------|---------|-------------|
| `systemId` | — | Current system being tested (from project config) |
| `testEnv` | — | Environment variables from `.env.test` |
| `foundryServer` | 180s | **Core fixture**: Isolated Foundry server per test |
| `worldId` | — | World ID from `foundryServer` |
| `isolatedContext` | — | Fresh browser context with `baseURL` set |
| `page` | — | Basic unauthenticated page |
| `adminPage` | — | Authenticated page at `/setup` |
| `gamePage` | 300s | Page inside the test world as Gamemaster |
| `simulacrumPage` | 300s | `gamePage` with Simulacrum module verified active |
| `foundry` | — | Helper functions from `foundry-helpers.js` |

### Helper Functions

```javascript
// Authentication
await foundry.loginAsAdmin(page, adminKey);
await foundry.launchWorld(page, worldId);
await foundry.joinAsUser(page, 'Gamemaster');

// Module interaction
await foundry.openSimulacrumPanel(page);
await foundry.isSimulacrumActive(page);

// Foundry utilities
await foundry.waitForFoundryReady(page);
await foundry.executeInFoundry(page, () => game.users.current);
await foundry.waitForNotification(page, 'Success', 'info');
```

### Writing System-Specific Tests

For tests that are unique to a specific game system's UX or features:

```javascript
// specs/systems/dnd5e/character-sheet.spec.js
import { test, expect } from '../../fixtures/test-base.js';

test.describe('D&D 5e Character Sheet', () => {
  test('displays ability scores correctly', async ({ gamePage, systemId }) => {
    // Verify we're running on the expected system
    expect(systemId).toBe('dnd5e');
    
    // D&D 5e-specific test logic
    const actorTypes = await gamePage.evaluate(() => {
      return Object.keys(game.system.documentTypes.Actor);
    });
    
    expect(actorTypes).toContain('character');
  });
});
```

Key patterns:
- Place system-specific tests in `specs/systems/{systemId}/`
- Assert `systemId` at the start if the test only makes sense for one system
- Use system-specific selectors and assertions

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
        
      - name: Setup Foundry
        run: |
          mkdir -p vendor/foundry
          # Download or restore Foundry from secure storage
          
      - name: Create test env
        run: |
          cat > tests/e2e/.env.test << EOF
          FOUNDRY_LICENSE_KEY=${{ secrets.FOUNDRY_LICENSE_KEY }}
          FOUNDRY_ADMIN_KEY=ci-test-admin
          TEST_SYSTEM_IDS=dnd5e,pf2e
          EOF
          
      - name: Run E2E tests
        run: npm run test:e2e
        
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: tests/e2e/reports/
```

## Troubleshooting

### Foundry Won't Start

1. Check if port 30000 is in use: `lsof -i :30000`
2. Verify the zip file is valid: `unzip -t vendor/foundry/*.zip`
3. Check Foundry version compatibility

### Tests Timeout

1. Increase timeouts in `playwright.config.js`
2. Check if Foundry is actually running: `curl http://localhost:30000`
3. Enable debug output: `DEBUG_FOUNDRY=true npm run test:e2e`

### Module Not Loading

1. Verify module.json is valid
2. Check build: `npm run package:module`
3. Look at Foundry console for errors

### Cleanup Issues

If tests fail to clean up properly:

```bash
# Kill any stray Foundry processes
pkill -f "main.mjs"

# Force-kill processes on test ports
fuser -k 30000-30010/tcp 2>/dev/null || true

# Remove orphaned test directories (per-test isolation pattern)
rm -rf .foundry-test-* .foundry-data-*

# Run global teardown manually
node -e "import('./tests/e2e/setup/global-teardown.js').then(m => m.default())"
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FOUNDRY_LICENSE_KEY` | Yes | — | Foundry license key (required) |
| `FOUNDRY_ADMIN_KEY` | No | `test-admin-key` | Admin password |
| `DEBUG_FOUNDRY` | No | `false` | Show Foundry server output |
| `TEST_SYSTEM_IDS` | No | `dnd5e` | Comma-separated system IDs to test |
| `TEST_WORLD_ID` | No | `simulacrum-test-world` | Base world ID (test ID appended per test) |

**Note:** `FOUNDRY_PORT` and `FOUNDRY_HOSTNAME` in `.env.test.example` are not used by the per-test isolation system. Each test automatically uses port `30000 + workerIndex` for parallel execution.

Systems are installed via Foundry's UI - any system available in Foundry's package browser works.
