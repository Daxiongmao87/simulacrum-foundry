/**
 * Base Test Fixtures for Simulacrum E2E Tests
 *
 * ARCHITECTURE: Each test gets completely isolated state:
 * - Fresh Foundry extraction
 * - Clean data directory
 * - Own Foundry server instance
 * - Fresh browser context (no cookies/storage from other tests)
 *
 * This is slower but CORRECT. Tests must be independent.
 */

import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import * as helpers from './foundry-helpers.mjs';
import * as foundrySetup from './foundry-setup.mjs';
import { scanAccessibility } from './accessibility.mjs';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load environment from .env.test
 */
function loadEnv() {
  const envPath = join(__dirname, '../.env.test');
  if (!existsSync(envPath)) {
    if (process.env.ADP_FOUNDRY_ENDPOINT) return { ...process.env };
    throw new Error('Missing tests/e2e/.env.test - copy from .env.test.example');
  }

  const content = readFileSync(envPath, 'utf-8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return { ...env, ...process.env };
}

/**
 * Extended test fixtures - each test is fully isolated
 */
export const test = base.extend({
  evidence: [
    async ({ isolatedContext, foundryServer }, use, testInfo) => {
      const browserConsole = [];
      const pageErrors = [];
      const failedRequests = [];
      const boundPages = new WeakSet();
      const bindPage = page => {
        if (boundPages.has(page)) return;
        boundPages.add(page);
        page.on('console', message => {
          browserConsole.push({
            type: message.type(),
            text: message.text(),
            location: message.location(),
          });
        });
        page.on('pageerror', error =>
          pageErrors.push({ name: error.name, message: error.message })
        );
        page.on('requestfailed', request => {
          failedRequests.push({
            url: request.url(),
            method: request.method(),
            resourceType: request.resourceType(),
            errorText: request.failure()?.errorText ?? 'unknown',
          });
        });
      };

      isolatedContext.pages().forEach(bindPage);
      isolatedContext.on('page', bindPage);
      await use();

      const pages = isolatedContext.pages();
      for (const [index, page] of pages.entries()) {
        if (page.isClosed()) continue;
        await testInfo.attach(`dom-${index}.html`, {
          body: Buffer.from(await page.content()),
          contentType: 'text/html',
        });
        await testInfo.attach(`accessibility-${index}.json`, {
          body: Buffer.from(JSON.stringify(await scanAccessibility(page), null, 2)),
          contentType: 'application/json',
        });
      }

      await testInfo.attach('browser-console.json', {
        body: Buffer.from(JSON.stringify(browserConsole, null, 2)),
        contentType: 'application/json',
      });
      await testInfo.attach('browser-page-errors.json', {
        body: Buffer.from(JSON.stringify(pageErrors, null, 2)),
        contentType: 'application/json',
      });
      await testInfo.attach('browser-failed-requests.json', {
        body: Buffer.from(JSON.stringify(failedRequests, null, 2)),
        contentType: 'application/json',
      });
      const foundryLogs = await foundrySetup.collectFoundryLogs(foundryServer);
      await testInfo.attach('foundry-stdout.log', {
        body: Buffer.from(`${foundryLogs.stdout.join('\n')}\n`),
        contentType: 'text/plain',
      });
      await testInfo.attach('foundry-stderr.log', {
        body: Buffer.from(`${foundryLogs.stderr.join('\n')}\n`),
        contentType: 'text/plain',
      });
    },
    { auto: true },
  ],

  /**
   * Current system ID being tested (from project config)
   */
  systemId: ['dnd5e', { option: true }],

  /**
   * Current Foundry version being tested (from project config)
   */
  foundryVersion: ['13.351', { option: true }],

  /**
   * Environment configuration
   */
  // Playwright requires an object-destructuring fixture parameter.
  // eslint-disable-next-line no-empty-pattern
  testEnv: async ({}, use) => {
    const env = loadEnv();
    await use(env);
  },

  /**
   * CORE FIXTURE: Isolated Foundry server per test
   *
   * This fixture:
   * 1. Extracts fresh Foundry to unique directory
   * 2. Creates clean data directory
   * 3. Deploys module
   * 4. Starts Foundry server
   * 5. Installs required system (from cache if available)
   * 6. Creates test world
   * 7. Yields server info to test
   * 8. On teardown: kills server, deletes all directories
   */
  foundryServer: [
    async ({ systemId, foundryVersion, testEnv }, use, testInfo) => {
      const testId = `test-${testInfo.testId.replace(/[^a-zA-Z0-9]/g, '-')}-${randomUUID()}`;
      console.log(`[fixture] Starting isolated Foundry for: ${testId}`);

      let serverInfo = null;

      try {
        serverInfo = testEnv.ADP_FOUNDRY_ENDPOINT
          ? await foundrySetup.setupBrokerFoundry({
              testId,
              systemId,
              foundryVersion,
              baseUrl: testEnv.ADP_FOUNDRY_ENDPOINT,
              sessionPath: testEnv.ADP_FOUNDRY_SESSION_FILE,
              brokerSystemId: testEnv.ADP_GAME_SYSTEM || systemId,
              brokerFoundryVersion: testEnv.ADP_FOUNDRY_VERSION || foundryVersion,
            })
          : await foundrySetup.setupIsolatedFoundry({
              testId,
              systemId,
              foundryVersion,
              adminKey: testEnv.FOUNDRY_ADMIN_KEY || 'test-admin-key',
              licenseKey: testEnv.FOUNDRY_LICENSE_KEY,
              env: testEnv,
              port: 30000 + (testInfo.parallelIndex || 0),
            });

        console.log(`[fixture] Foundry ready at ${serverInfo.baseUrl}`);

        await use(serverInfo);
      } finally {
        // ALWAYS clean up, even if test fails
        console.log(`[fixture] Tearing down isolated Foundry for: ${testId}`);
        if (serverInfo && !serverInfo.externalBroker) {
          await foundrySetup.teardownIsolatedFoundry(serverInfo);
        }
      }
    },
    { timeout: 180000 },
  ], // 3 minutes for fixture setup

  /**
   * World ID for the current test
   */
  worldId: async ({ foundryServer }, use) => {
    await use(foundryServer.worldId);
  },

  /**
   * Fresh browser context with baseURL set from foundryServer
   */
  isolatedContext: async ({ browser, foundryServer }, use, testInfo) => {
    // Create brand new context - no cookies, no storage from other tests
    // Set baseURL so relative navigation works (e.g., page.goto('/'))
    // IMPORTANT: Must set viewport explicitly - Foundry requires 1366x768 minimum
    const context = await browser.newContext({
      storageState: undefined, // Explicitly no stored state
      baseURL: foundryServer.baseUrl,
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: testInfo.outputPath('video'),
        size: { width: 1280, height: 720 },
      },
    });

    await use(context);

    const recordedPages = context.pages();
    await context.close();
    for (const [index, recordedPage] of recordedPages.entries()) {
      const video = recordedPage.video();
      if (!video) throw new Error(`Playwright omitted video for page ${index}`);
      await testInfo.attach(`video-${index}`, {
        path: await video.path(),
        contentType: 'video/webm',
      });
    }
  },

  /**
   * Override default page to use dynamic baseUrl from foundryServer
   * This is the basic unauthenticated page.
   */
  page: async ({ foundryServer, isolatedContext }, use) => {
    const page = await isolatedContext.newPage();

    // Set baseURL for relative navigation
    // We can't set baseURL on context after creation, so we'll use a workaround
    // Tests using page.goto('/') will need to use foundryServer.baseUrl
    // For convenience, navigate to the server immediately
    await page.goto(foundryServer.baseUrl);

    await use(page);
  },

  /**
   * Authenticated admin page (at /setup, NOT in a world)
   */
  adminPage: async ({ foundryServer, isolatedContext }, use) => {
    const page = await isolatedContext.newPage();

    console.log(`[fixture] Creating adminPage for ${foundryServer.baseUrl}`);

    // Login as admin
    await helpers.loginAsAdmin(page, foundryServer.adminKey, foundryServer.baseUrl);

    // Navigate to setup (admin should already be here after login)
    await page.goto(`${foundryServer.baseUrl}/setup`);
    await page.waitForLoadState('networkidle');

    await use(page);
  },

  /**
   * Page within isolated context, connected to isolated server, inside a world
   */
  gamePage: [
    async ({ foundryServer, isolatedContext }, use) => {
      const page = await isolatedContext.newPage();

      console.log(`[fixture] Navigating to ${foundryServer.baseUrl}`);

      // Login as admin
      await helpers.loginAsAdmin(page, foundryServer.adminKey, foundryServer.baseUrl);

      // Launch the test world (pass baseUrl for navigation)
      await helpers.launchWorld(page, foundryServer.worldId, foundryServer.baseUrl);

      // Join as Gamemaster
      await helpers.joinAsUser(page, 'Gamemaster');

      // Wait for everything to be ready
      await helpers.waitForFoundryReady(page);

      await use(page);

      // Page cleanup handled by isolatedContext teardown
    },
    { timeout: 420000 },
  ], // 7 minutes for world launch and join plus slow migrations on the supported matrix

  /**
   * Page with Simulacrum module confirmed active
   */
  simulacrumPage: [
    async ({ gamePage }, use) => {
      // Debug: Log module state
      const moduleDebug = await gamePage.evaluate(() => {
        // @ts-ignore
        const mod = game.modules.get('simulacrum');
        // @ts-ignore
        const allModules = Array.from(game.modules.keys());
        // @ts-ignore
        const activeModules = Array.from(game.modules.values())
          .filter(m => m.active)
          .map(m => m.id);
        return {
          simulacrumFound: !!mod,
          simulacrumActive: mod?.active,
          simulacrumId: mod?.id,
          allModuleIds: allModules,
          activeModuleIds: activeModules,
        };
      });
      console.log(`[fixture] Module debug:`, JSON.stringify(moduleDebug, null, 2));

      // Check if Simulacrum is active
      let isActive = await helpers.isSimulacrumActive(gamePage);

      // If not active, try to enable it via Module Management UI
      if (!isActive) {
        console.log(`[fixture] Simulacrum not active, enabling via Module Management UI...`);
        const enabled = await helpers.enableModuleViaUI(gamePage, 'simulacrum');
        if (enabled) {
          console.log(`[fixture] Module enabled, verifying...`);
          isActive = await helpers.isSimulacrumActive(gamePage);
        } else {
          console.log(`[fixture] Failed to enable module via UI`);
        }
      }

      // Verify Simulacrum is now active
      expect(isActive).toBe(true);

      await use(gamePage);
    },
    { timeout: 420000 },
  ], // 7 minutes for module enable via UI, reload, and verification on slow worlds

  /**
   * Helper functions available in tests
   */
  // Playwright requires an object-destructuring fixture parameter.
  // eslint-disable-next-line no-empty-pattern
  foundry: async ({}, use) => {
    await use(helpers);
  },
});

export { expect };

/**
 * Test annotations for common scenarios
 */
export const describe = test.describe;
export const beforeAll = test.beforeAll;
export const afterAll = test.afterAll;
export const beforeEach = test.beforeEach;
export const afterEach = test.afterEach;
