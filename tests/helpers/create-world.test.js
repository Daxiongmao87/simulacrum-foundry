/**
 * Unit tests for ConcurrentDockerTestRunner.createWorld() method
 * Tests the world creation bootstrap helper using mocks (NOT integration tests)
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ConcurrentDockerTestRunner } from './concurrent-docker-test-runner.js';

// Mock dependencies
jest.mock('./test-config.js');
jest.mock('./port-manager.js');

describe('ConcurrentDockerTestRunner.createWorld()', () => {
  let testRunner;
  let mockPage;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create test runner instance
    testRunner = new ConcurrentDockerTestRunner();
    
    // Mock page object with all required methods
    mockPage = {
      waitForSelector: jest.fn(),
      click: jest.fn(),
      evaluate: jest.fn(),
      $: jest.fn(),
      select: jest.fn(),
      waitForFunction: jest.fn(),
      keyboard: {
        press: jest.fn()
      }
    };
    
    // Mock sleep method
    testRunner.sleep = jest.fn().mockResolvedValue();
  });

  test('should successfully create a new world with valid configuration', async () => {
    // Mock successful world creation flow
    mockPage.waitForSelector.mockResolvedValue();
    mockPage.click.mockResolvedValue();
    
    // Set up evaluate calls in sequence
    let evaluateCallCount = 0;
    mockPage.evaluate.mockImplementation(() => {
      evaluateCallCount++;
      switch (evaluateCallCount) {
        case 1: return Promise.resolve(false); // world doesn't exist
        case 2: return Promise.resolve(true);  // system is available
        case 3: return Promise.resolve({ verified: true, reason: 'launch_button_present' }); // verification successful
        default: return Promise.resolve(false);
      }
    });
    
    // Mock input elements
    const mockTitleInput = {
      click: jest.fn(),
      type: jest.fn()
    };
    const mockSystemSelect = {};
    const mockDescriptionInput = {
      click: jest.fn(),
      type: jest.fn()
    };
    
    mockPage.$
      .mockResolvedValueOnce(mockTitleInput)    // title input
      .mockResolvedValueOnce(mockSystemSelect)  // system select
      .mockResolvedValueOnce(mockDescriptionInput); // description input

    // Mock successful creation (dialog closes)
    mockPage.waitForFunction.mockResolvedValue(); // Dialog closes successfully

    const worldConfig = {
      name: 'Test World',
      system: 'dnd5e',
      description: 'Test world description'
    };

    const result = await testRunner.createWorld(mockPage, worldConfig);

    expect(result.success).toBe(true);
    expect(result.status).toBe('created');
    expect(result.details).toContain('verified');
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('a[data-tab="worlds"]', { timeout: 10000 });
    expect(mockPage.click).toHaveBeenCalledWith('button[data-action="worldCreate"]');
    expect(mockTitleInput.type).toHaveBeenCalledWith('Test World', { delay: 50 });
  });

  test('should return already_exists when world already exists', async () => {
    // Mock world already exists
    mockPage.waitForSelector.mockResolvedValue();
    mockPage.click.mockResolvedValue();
    mockPage.evaluate.mockResolvedValueOnce(true); // world exists

    const worldConfig = {
      name: 'Existing World',
      system: 'dnd5e'
    };

    const result = await testRunner.createWorld(mockPage, worldConfig);

    expect(result.success).toBe(true);
    expect(result.status).toBe('already_exists');
    expect(result.retryCount).toBe(0);
  });

  test('should throw error when world name is missing', async () => {
    const worldConfig = {
      system: 'dnd5e'
    };

    await expect(testRunner.createWorld(mockPage, worldConfig))
      .rejects.toThrow('World name is required');
  });

  test('should handle dialog opening failure and retry', async () => {
    // Mock initial failure, then success
    mockPage.waitForSelector
      .mockResolvedValueOnce() // worlds tab
      .mockRejectedValueOnce(new Error('Dialog timeout')) // first dialog attempt fails
      .mockResolvedValueOnce() // worlds tab (retry)
      .mockResolvedValueOnce(); // dialog succeeds on retry

    mockPage.click.mockResolvedValue();
    mockPage.evaluate
      .mockResolvedValueOnce(false) // world doesn't exist (first attempt)
      .mockResolvedValueOnce(false) // world doesn't exist (retry)
      .mockResolvedValueOnce(true)  // system available
      .mockResolvedValueOnce({ verified: true, reason: 'launch_button_present' });

    // Mock input elements for successful retry
    const mockTitleInput = { click: jest.fn(), type: jest.fn() };
    const mockSystemSelect = {};
    mockPage.$
      .mockResolvedValueOnce(mockTitleInput)
      .mockResolvedValueOnce(mockSystemSelect);

    // Mock successful creation on retry
    mockPage.waitForFunction.mockResolvedValue(); // Dialog closes successfully

    const worldConfig = {
      name: 'Retry Test World',
      system: 'dnd5e'
    };

    const result = await testRunner.createWorld(mockPage, worldConfig, { maxRetries: 2 });

    expect(result.success).toBe(true);
    expect(result.retryCount).toBe(1);
    expect(testRunner.sleep).toHaveBeenCalledWith(2000); // backoff delay
  });

  test('should handle system not available error', async () => {
    mockPage.waitForSelector.mockResolvedValue();
    mockPage.click.mockResolvedValue();
    mockPage.evaluate
      .mockResolvedValueOnce(false) // world doesn't exist
      .mockResolvedValueOnce(false); // system not available

    const mockTitleInput = { click: jest.fn(), type: jest.fn() };
    const mockSystemSelect = {};
    mockPage.$
      .mockResolvedValueOnce(mockTitleInput)
      .mockResolvedValueOnce(mockSystemSelect);

    const worldConfig = {
      name: 'Test World',
      system: 'invalid-system'
    };

    const result = await testRunner.createWorld(mockPage, worldConfig, { maxRetries: 1 });

    expect(result.success).toBe(false);
    expect(result.status).toBe('creation_error');
    expect(result.details).toContain('Game system "invalid-system" not available');
  });

  test('should handle creation timeout', async () => {
    mockPage.waitForSelector.mockResolvedValue();
    mockPage.click.mockResolvedValue();
    mockPage.evaluate
      .mockResolvedValueOnce(false) // world doesn't exist
      .mockResolvedValueOnce(true);  // system available

    const mockTitleInput = { click: jest.fn(), type: jest.fn() };
    const mockSystemSelect = {};
    mockPage.$
      .mockResolvedValueOnce(mockTitleInput)
      .mockResolvedValueOnce(mockSystemSelect);

    // Mock timeout scenario
    mockPage.waitForFunction.mockRejectedValue(new Error('World creation timeout after 5000ms'));

    const worldConfig = {
      name: 'Timeout Test World',
      system: 'dnd5e'
    };

    const result = await testRunner.createWorld(mockPage, worldConfig, { 
      maxRetries: 1, 
      timeout: 5000 
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('creation_error');
    expect(result.details).toContain('timeout');
  });

  test('should handle verification failure', async () => {
    mockPage.waitForSelector.mockResolvedValue();
    mockPage.click.mockResolvedValue();
    mockPage.evaluate
      .mockResolvedValueOnce(false) // world doesn't exist
      .mockResolvedValueOnce(true)  // system available
      .mockResolvedValueOnce({ verified: false, reason: 'no_world_indicators' }); // verification fails

    const mockTitleInput = { click: jest.fn(), type: jest.fn() };
    const mockSystemSelect = {};
    mockPage.$
      .mockResolvedValueOnce(mockTitleInput)
      .mockResolvedValueOnce(mockSystemSelect);

    // Mock successful creation but verification failure
    mockPage.waitForFunction.mockResolvedValue(); // Dialog closes successfully

    const worldConfig = {
      name: 'Verification Test World',
      system: 'dnd5e'
    };

    const result = await testRunner.createWorld(mockPage, worldConfig, { maxRetries: 1 });

    expect(result.success).toBe(false);
    expect(result.status).toBe('creation_error');
    expect(result.details).toContain('verification failed');
  });

  test('should use default system when not specified', async () => {
    mockPage.waitForSelector.mockResolvedValue();
    mockPage.click.mockResolvedValue();
    mockPage.evaluate
      .mockResolvedValueOnce(false) // world doesn't exist
      .mockResolvedValueOnce(true)  // system available
      .mockResolvedValueOnce({ verified: true, reason: 'launch_button_present' });

    const mockTitleInput = { click: jest.fn(), type: jest.fn() };
    const mockSystemSelect = {};
    mockPage.$
      .mockResolvedValueOnce(mockTitleInput)
      .mockResolvedValueOnce(mockSystemSelect);

    mockPage.waitForFunction.mockResolvedValue(); // Dialog closes successfully

    const worldConfig = {
      name: 'Default System World'
      // system not specified - should default to 'dnd5e'
    };

    const result = await testRunner.createWorld(mockPage, worldConfig);

    expect(result.success).toBe(true);
    expect(mockPage.select).toHaveBeenCalledWith('#world-config select[name="system"]', 'dnd5e');
  });

  test('should handle missing system selector gracefully', async () => {
    mockPage.waitForSelector.mockResolvedValue();
    mockPage.click.mockResolvedValue();
    mockPage.evaluate
      .mockResolvedValueOnce(false) // world doesn't exist
      .mockResolvedValueOnce({ verified: true, reason: 'launch_button_present' });

    const mockTitleInput = { click: jest.fn(), type: jest.fn() };
    mockPage.$
      .mockResolvedValueOnce(mockTitleInput)
      .mockResolvedValueOnce(null); // no system selector

    mockPage.waitForFunction.mockResolvedValue(); // Dialog closes successfully

    const worldConfig = {
      name: 'No System Selector World',
      system: 'dnd5e'
    };

    const result = await testRunner.createWorld(mockPage, worldConfig);

    expect(result.success).toBe(true);
    expect(mockPage.select).not.toHaveBeenCalled();
  });

  test('should skip description when not provided', async () => {
    mockPage.waitForSelector.mockResolvedValue();
    mockPage.click.mockResolvedValue();
    mockPage.evaluate
      .mockResolvedValueOnce(false) // world doesn't exist
      .mockResolvedValueOnce(true)  // system available
      .mockResolvedValueOnce({ verified: true, reason: 'launch_button_present' });

    const mockTitleInput = { click: jest.fn(), type: jest.fn() };
    const mockSystemSelect = {};
    mockPage.$
      .mockResolvedValueOnce(mockTitleInput)
      .mockResolvedValueOnce(mockSystemSelect);

    mockPage.waitForFunction.mockResolvedValue(); // Dialog closes successfully

    const worldConfig = {
      name: 'No Description World',
      system: 'dnd5e'
      // description not provided
    };

    const result = await testRunner.createWorld(mockPage, worldConfig);

    expect(result.success).toBe(true);
    // Should not try to find description input
    expect(mockPage.$).toHaveBeenCalledTimes(2); // Only title and system inputs
  });
});