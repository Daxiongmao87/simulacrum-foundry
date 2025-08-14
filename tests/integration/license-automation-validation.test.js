/**
 * License Automation Validation Test
 * 
 * Verifies that the ConcurrentDockerTestRunner can automatically handle the 
 * FoundryVTT license screen using a real license key.
 * 
 * This test is a critical part of the CI/CD pipeline, ensuring that our
 * testing infrastructure remains robust against changes in FoundryVTT's
 * setup process.
 */

import { ConcurrentDockerTestRunner } from '../helpers/concurrent-docker-test-runner.js';
import { loadTestConfig } from '../helpers/test-config.js';

const config = loadTestConfig();
const runner = new ConcurrentDockerTestRunner();

const testCases = [];
config.versions.forEach(version => {
  if (version.enabled) {
    config.systems.forEach(systemId => {
      testCases.push({ 
        version, 
        system: { id: systemId, name: systemId }
      });
    });
  }
});

describe('License Automation E2E Validation', () => {
  test.each(testCases)('should automatically enter license key for $version.version and $system.name', async ({ version, system }) => {
    const context = {
      version: version.version,
      versionZip: version.zipFile,
      system: system.id
    };

    const { page, containerId } = await runner.setupTestEnvironment(context);

    try {
      const currentUrl = page.url();
      console.log(`Current page URL: ${currentUrl}`);
      expect(currentUrl).not.toContain('license');
      expect(currentUrl).toContain('setup');

      const setupTitle = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        const h2 = document.querySelector('h2');
        return h1?.textContent || h2?.textContent || '';
      });
      console.log(`Setup screen title: "${setupTitle}"`);
      expect(setupTitle.toLowerCase()).toContain('foundry virtual tabletop');

      const bodyText = await page.content();
      expect(bodyText).not.toMatch(/invalid license|license error|invalid key/i);

      console.log(`License automation for FoundryVTT ${context.version} + ${context.systemName} successful.`);
    } finally {
      await runner.cleanupTestEnvironment(containerId);
    }
  }, config.bootstrap.timeouts.foundryReady + 60000);

  afterAll(async () => {
    await runner.globalCleanup();
  });
});
