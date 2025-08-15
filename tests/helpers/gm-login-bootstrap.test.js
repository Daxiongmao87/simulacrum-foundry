/**
 * Test GM Login Bootstrap Helper
 * 
 * Bootstrap helper test for validating GM login and world launch automation.
 * This is NOT an integration test - it tests the bootstrap helper methods directly with mocks.
 * 
 * Tests the loginAsGM() method and its supporting methods:
 * - handleAdminAuthentication()
 * - launchWorld()
 * - authenticateAsGM()
 * - verifyGMWorldAccess()
 */

import { jest } from '@jest/globals';
import { ConcurrentDockerTestRunner } from './concurrent-docker-test-runner.js';

// Mock Puppeteer page object
const createMockPage = () => ({
  $: jest.fn(),
  $$: jest.fn(),
  click: jest.fn(),
  type: jest.fn(),
  select: jest.fn(),
  keyboard: { press: jest.fn() },
  waitForSelector: jest.fn(),
  waitForNavigation: jest.fn(),
  waitForFunction: jest.fn(),
  evaluate: jest.fn(),
  url: jest.fn(() => 'http://localhost:30000'),
  goto: jest.fn()
});

describe('GM Login Bootstrap Helper', () => {
  let testRunner;
  let mockPage;

  beforeEach(() => {
    testRunner = new ConcurrentDockerTestRunner();
    mockPage = createMockPage();
    
    // Mock the sleep method to speed up tests
    testRunner.sleep = jest.fn(() => Promise.resolve());
  });

  describe('loginAsGM()', () => {
    const worldConfig = {
      name: 'Test World v13',
      system: 'dnd5e',
      description: 'Test world for GM login automation'
    };

    test('should successfully complete GM login flow', async () => {
      // Mock successful admin authentication
      testRunner.handleAdminAuthentication = jest.fn().mockResolvedValue({
        success: true,
        status: 'not_required',
        details: 'No admin authentication form detected'
      });

      // Mock successful world launch
      testRunner.launchWorld = jest.fn().mockResolvedValue({
        success: true,
        method: 'navigation_to_join',
        details: 'World launch successful via navigation_to_join'
      });

      // Mock successful GM authentication
      testRunner.authenticateAsGM = jest.fn().mockResolvedValue({
        success: true,
        method: 'user_selection_auth',
        details: 'User selection authentication completed with user: gamemaster'
      });

      // Mock successful verification
      testRunner.verifyGMWorldAccess = jest.fn().mockResolvedValue({
        success: true,
        method: 'ui_elements_detected',
        details: 'FoundryVTT UI detected: #ui-left'
      });

      // Mock Puppeteer selectors
      mockPage.waitForSelector.mockResolvedValue(true);
      mockPage.click.mockResolvedValue(true);

      const result = await testRunner.loginAsGM(mockPage, worldConfig, {
        maxRetries: 1,
        timeout: 10000,
        adminPassword: 'test-password'
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('gm_authenticated');
      expect(result.retryCount).toBe(0);
      expect(result.details).toContain('GM successfully authenticated');
      
      // Verify method calls
      expect(testRunner.handleAdminAuthentication).toHaveBeenCalledWith(
        mockPage, 
        'test-password', 
        expect.objectContaining({ timeout: expect.any(Number) })
      );
      expect(testRunner.launchWorld).toHaveBeenCalledWith(
        mockPage, 
        'test-world-v13', 
        'Test World v13',
        expect.objectContaining({ timeout: expect.any(Number) })
      );
      expect(testRunner.authenticateAsGM).toHaveBeenCalled();
      expect(testRunner.verifyGMWorldAccess).toHaveBeenCalled();
    });

    test('should handle admin authentication failure', async () => {
      testRunner.handleAdminAuthentication = jest.fn().mockResolvedValue({
        success: false,
        status: 'auth_failed',
        details: 'Invalid admin password'
      });

      mockPage.waitForSelector.mockResolvedValue(true);
      mockPage.click.mockResolvedValue(true);

      const result = await testRunner.loginAsGM(mockPage, worldConfig, {
        maxRetries: 1,
        timeout: 10000
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('gm_login_error');
      expect(result.details).toContain('Admin authentication failed');
    });

    test('should handle world launch failure', async () => {
      testRunner.handleAdminAuthentication = jest.fn().mockResolvedValue({
        success: true,
        status: 'not_required'
      });

      testRunner.launchWorld = jest.fn().mockResolvedValue({
        success: false,
        details: 'World not found in worlds list'
      });

      mockPage.waitForSelector.mockResolvedValue(true);
      mockPage.click.mockResolvedValue(true);

      const result = await testRunner.loginAsGM(mockPage, worldConfig, {
        maxRetries: 1,
        timeout: 10000
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('gm_login_error');
      expect(result.details).toContain('World launch failed');
    });

    test('should retry on failure', async () => {
      let attemptCount = 0;
      testRunner.handleAdminAuthentication = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve({ success: true, status: 'not_required' });
      });

      testRunner.launchWorld = jest.fn().mockResolvedValue({
        success: true,
        method: 'navigation_to_join'
      });

      testRunner.authenticateAsGM = jest.fn().mockResolvedValue({
        success: true,
        method: 'user_selection_auth'
      });

      testRunner.verifyGMWorldAccess = jest.fn().mockResolvedValue({
        success: true,
        method: 'ui_elements_detected'
      });

      mockPage.waitForSelector.mockResolvedValue(true);
      mockPage.click.mockResolvedValue(true);
      mockPage.goto.mockResolvedValue(true);

      const result = await testRunner.loginAsGM(mockPage, worldConfig, {
        maxRetries: 2,
        timeout: 10000
      });

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(attemptCount).toBe(2);
    });
  });

  describe('handleAdminAuthentication()', () => {
    test('should return not_required when no admin form found', async () => {
      mockPage.$.mockResolvedValue(null);

      const result = await testRunner.handleAdminAuthentication(mockPage, 'test-password');

      expect(result.success).toBe(true);
      expect(result.status).toBe('not_required');
      expect(result.details).toContain('No admin authentication form detected');
    });

    test('should successfully authenticate with admin password', async () => {
      const mockInput = {
        click: jest.fn(),
        type: jest.fn(),
        press: jest.fn()
      };

      mockPage.$.mockImplementation((selector) => {
        if (selector.includes('adminPassword')) {
          return Promise.resolve(mockInput);
        }
        return Promise.resolve(null);
      });

      // Mock waitForFunction to resolve for form disappearing
      mockPage.waitForFunction.mockResolvedValueOnce(true);

      const result = await testRunner.handleAdminAuthentication(mockPage, 'test-password');

      expect(result.success).toBe(true);
      expect(result.status).toBe('authenticated');
      expect(mockInput.type).toHaveBeenCalledWith('test-password', { delay: 50 });
    });
  });

  describe('launchWorld()', () => {
    test('should find and launch world by slug', async () => {
      mockPage.evaluate.mockResolvedValueOnce({
        found: true,
        hasLaunchButton: true,
        method: 'slug_match'
      });

      mockPage.waitForSelector.mockResolvedValue(true);
      mockPage.click.mockResolvedValue(true);
      mockPage.waitForNavigation.mockResolvedValue(true);

      const result = await testRunner.launchWorld(mockPage, 'test-world-v13', 'Test World v13');

      expect(result.success).toBe(true);
      expect(result.method).toBe('navigation_to_join');
      expect(mockPage.click).toHaveBeenCalledWith(
        'li.package.world[data-package-id="test-world-v13"] a[data-action="worldLaunch"]'
      );
    });

    test('should handle world not found', async () => {
      mockPage.evaluate.mockResolvedValueOnce({
        found: false
      });

      const result = await testRunner.launchWorld(mockPage, 'missing-world', 'Missing World');

      expect(result.success).toBe(false);
      expect(result.details).toContain('World "Missing World" not found');
    });
  });

  describe('authenticateAsGM()', () => {
    test('should detect direct access', async () => {
      mockPage.evaluate.mockResolvedValueOnce('direct_access');

      const result = await testRunner.authenticateAsGM(mockPage);

      expect(result.success).toBe(true);
      expect(result.method).toBe('direct_access');
      expect(result.details).toContain('Already authenticated');
    });

    test('should handle user selection authentication', async () => {
      mockPage.evaluate.mockResolvedValueOnce('user_selection');

      testRunner.handleUserSelectionAuth = jest.fn().mockResolvedValue({
        success: true,
        method: 'user_selection_auth',
        details: 'User selection completed'
      });

      const result = await testRunner.authenticateAsGM(mockPage);

      expect(result.success).toBe(true);
      expect(result.method).toBe('user_selection_auth');
      expect(testRunner.handleUserSelectionAuth).toHaveBeenCalled();
    });
  });

  describe('verifyGMWorldAccess()', () => {
    test('should verify world access via UI elements', async () => {
      // Mock waitForFunction to return the UI element selector
      mockPage.waitForFunction.mockResolvedValueOnce('#ui-left');

      const result = await testRunner.verifyGMWorldAccess(mockPage);

      expect(result.success).toBe(true);
      expect(result.method).toBe('ui_elements_detected');
      expect(result.details).toContain('FoundryVTT UI detected');
    });

    test('should handle verification timeout', async () => {
      mockPage.waitForFunction.mockRejectedValue(new Error('Timeout'));

      const result = await testRunner.verifyGMWorldAccess(mockPage, { timeout: 1000 });

      expect(result.success).toBe(false);
      expect(result.details).toContain('Verification error');
    });
  });
});