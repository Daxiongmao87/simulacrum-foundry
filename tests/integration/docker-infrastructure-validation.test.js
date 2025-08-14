/**
 * Docker Infrastructure Validation Test
 * 
 * Tests the core Docker infrastructure for FoundryVTT testing
 * Validates that DockerTestRunner can:
 * 1. Build and start FoundryVTT containers
 * 2. Bootstrap FoundryVTT environment 
 * 3. Support version matrix testing
 * 4. Handle cleanup properly
 */

import { DockerTestRunner } from '../helpers/docker-test-runner.js';

describe('Docker Infrastructure Validation', () => {
  const runner = new DockerTestRunner();

  // Test basic container lifecycle
  test('should create and cleanup Docker container', async () => {
    const testContext = {
      version: 'v12',
      versionZip: 'FoundryVTT-12.343.zip',
      system: 'dnd5e',
      systemName: 'dnd5e'
    };

    let containerId;
    let page;

    try {
      // Test container creation
      const { page: testPage, containerId: testContainerId } = await runner.setupTestEnvironment(testContext);
      page = testPage;
      containerId = testContainerId;

      // Verify FoundryVTT is running
      expect(page).toBeDefined();
      const title = await page.title();
      expect(title).toContain('Foundry');

      // Verify container is running
      expect(containerId).toBeDefined();
      expect(containerId).toMatch(/simulacrum-foundry-test-v12-dnd5e-\d+/);

    } finally {
      // Ensure cleanup happens
      if (containerId) {
        await runner.cleanupTestEnvironment(containerId);
      }
    }
  }, 120000); // 2 minute timeout for Docker operations

  // Test version matrix support
  test('should support multiple FoundryVTT versions', async () => {
    const config = runner.config;
    
    // Verify configuration has multiple versions
    expect(config.versions).toBeInstanceOf(Array);
    expect(config.versions.length).toBeGreaterThan(0);
    
    // Check that ZIP files exist for configured versions
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.join(__dirname, '..', '..');
    
    for (const version of config.versions) {
      if (version.enabled) {
        const zipPath = path.join(projectRoot, 'tests', 'fixtures', 'binary_versions', version.version, version.zipFile);
        expect(fs.existsSync(zipPath)).toBe(true);
      }
    }
  });

  // Test game system support
  test('should support multiple game systems', async () => {
    const config = runner.config;
    
    // Verify systems are configured
    expect(config.systems).toBeInstanceOf(Array);
    expect(config.systems.length).toBeGreaterThan(0);
    expect(config.systems).toContain('dnd5e');
  });

  // Test configuration loading
  test('should load test configuration properly', async () => {
    const config = runner.config;
    
    // Verify required configuration sections
    expect(config.docker).toBeDefined();
    expect(config.puppeteer).toBeDefined();
    expect(config.bootstrap).toBeDefined();
    
    // Verify Docker configuration
    expect(config.docker.port).toBe(30000);
    expect(config.docker.imagePrefix).toBe('simulacrum-foundry-test');
    
    // Verify timeouts are reasonable
    expect(config.bootstrap.timeouts.containerStart).toBeGreaterThan(0);
    expect(config.bootstrap.timeouts.foundryReady).toBeGreaterThan(0);
  });
});
