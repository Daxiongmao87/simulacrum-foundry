/**
 * @jest-environment jsdom
 */

import { performPostToolVerification } from '../../scripts/core/tool-verification.js';

describe('tool-verification module imports', () => {
  test('should import all required dependencies without errors', () => {
    // This test verifies that all imports in tool-verification.js are valid
    // and that the module can be loaded without syntax errors
    expect(performPostToolVerification).toBeDefined();
    expect(typeof performPostToolVerification).toBe('function');
  });

  test('should import isDiagnosticsEnabled from dev utils', async () => {
    const { isDiagnosticsEnabled } = await import('../../scripts/utils/dev.js');
    expect(isDiagnosticsEnabled).toBeDefined();
    expect(typeof isDiagnosticsEnabled).toBe('function');
  });

  test('should import createLogger from logger utils', async () => {
    const { createLogger } = await import('../../scripts/utils/logger.js');
    expect(createLogger).toBeDefined();
    expect(typeof createLogger).toBe('function');
  });

  test('should import toolRegistry from tool-registry', async () => {
    const { toolRegistry } = await import('../../scripts/core/tool-registry.js');
    expect(toolRegistry).toBeDefined();
  });
});