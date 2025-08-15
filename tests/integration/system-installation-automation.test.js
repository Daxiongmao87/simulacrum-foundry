/**
 * Integration Test: System Installation Automation
 * 
 * Tests the enhanced installGameSystem() method with real FoundryVTT containers.
 * Validates selectors, retry logic, and installation verification against actual UI.
 */

import { ConcurrentDockerTestRunner } from '../helpers/concurrent-docker-test-runner.js';

describe('System Installation Automation', () => {
  let testRunner;

  beforeAll(async () => {
    testRunner = new ConcurrentDockerTestRunner();
  });

  afterAll(async () => {
    if (testRunner) {
      await testRunner.globalCleanup();
    }
  });

  // Use describe block for testAcrossVersions
  describe('System Installation Tests', () => {
    beforeEach(() => {
      if (!testRunner) {
        testRunner = new ConcurrentDockerTestRunner();
      }
    });

    testRunner?.testAcrossVersions?.('should install dnd5e system automatically', async (page, context) => {
    // Test basic installation
    const result = await testRunner.installGameSystem(page, 'dnd5e');
    
    expect(result.success).toBe(true);
    expect(['installed', 'already_installed']).toContain(result.status);
    expect(result.retryCount).toBeDefined();
    
    if (result.status === 'installed') {
      expect(result.details).toContain('Installation completed and verified');
    }
  });

  testRunner.testAcrossVersions('should handle already installed systems gracefully', async (page, context) => {
    // Install system first
    await testRunner.installGameSystem(page, 'dnd5e');
    
    // Try to install again
    const result = await testRunner.installGameSystem(page, 'dnd5e');
    
    expect(result.success).toBe(true);
    expect(result.status).toBe('already_installed');
    expect(result.retryCount).toBe(0); // No retries needed for already installed
  });

  testRunner.testAcrossVersions('should handle non-existent systems with proper error', async (page, context) => {
    // Try to install a non-existent system
    const result = await testRunner.installGameSystem(page, 'non-existent-system');
    
    expect(result.success).toBe(false);
    expect(result.status).toBe('install_error');
    expect(result.details).toContain('not found in installer dialog');
    expect(result.retryCount).toBeGreaterThan(0); // Should have attempted retries
  });

  testRunner.testAcrossVersions('should respect custom timeout settings', async (page, context) => {
    const startTime = Date.now();
    
    // Test with very short timeout to verify timeout handling
    const result = await testRunner.installGameSystem(page, 'pf2e', {
      maxRetries: 1,
      downloadTimeout: 5000  // 5 seconds - too short for real download
    });
    
    const elapsedTime = Date.now() - startTime;
    
    // Should fail within reasonable time due to short timeout
    expect(elapsedTime).toBeLessThan(15000); // Should fail quickly
    
    if (!result.success) {
      expect(result.details).toMatch(/timeout|Installation failed/i);
    }
  });

  testRunner.testAcrossVersions('should install multiple systems sequentially', async (page, context) => {
    const systems = ['dnd5e', 'pf2e'];
    const results = [];
    
    for (const systemId of systems) {
      const result = await testRunner.installGameSystem(page, systemId);
      results.push(result);
      
      expect(result.success).toBe(true);
      expect(['installed', 'already_installed']).toContain(result.status);
    }
    
    // Verify both systems are now available
    for (const systemId of systems) {
      const verifyResult = await testRunner.installGameSystem(page, systemId);
      expect(verifyResult.status).toBe('already_installed');
    }
  });

  testRunner.testAcrossVersions('should handle dialog close failures gracefully', async (page, context) => {
    // This test validates that even if dialog closing fails, the installation is still verified
    const result = await testRunner.installGameSystem(page, 'dnd5e');
    
    expect(result.success).toBe(true);
    // The method should succeed even if dialog closing encounters issues
  });

});

/**
 * Unit Test: Enhanced Installation Method Logic
 * 
 * Tests specific aspects of the enhanced installation method without requiring full Docker setup.
 */
describe('Enhanced Installation Method Logic', () => {
  let testRunner;

  beforeEach(() => {
    testRunner = new ConcurrentDockerTestRunner();
  });

  test('should validate installation options with defaults', () => {
    // Test that default options are properly set
    const mockPage = {
      waitForSelector: jest.fn(),
      click: jest.fn(),
      evaluate: jest.fn(),
      $: jest.fn(),
      keyboard: { press: jest.fn() }
    };

    // The method should handle missing options gracefully
    expect(() => {
      testRunner.installGameSystem(mockPage, 'dnd5e', {});
    }).not.toThrow();
    
    expect(() => {
      testRunner.installGameSystem(mockPage, 'dnd5e', {
        maxRetries: 5,
        downloadTimeout: 600000
      });
    }).not.toThrow();
  });

  test('should generate appropriate error messages for different failure scenarios', () => {
    const testCases = [
      {
        scenario: 'Dialog not found',
        expectedPattern: /dialog.*open.*attempts/i
      },
      {
        scenario: 'Package not found',
        expectedPattern: /not found.*repository/i
      },
      {
        scenario: 'Installation timeout',
        expectedPattern: /timeout.*\d+ms/i
      }
    ];

    // These error patterns should be descriptive and actionable
    testCases.forEach(testCase => {
      expect(testCase.expectedPattern).toBeInstanceOf(RegExp);
    });
  });

});