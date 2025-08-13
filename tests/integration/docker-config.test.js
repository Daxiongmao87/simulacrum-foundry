/**
 * Docker Configuration Integration Test
 * 
 * Tests Docker-only test configuration system.
 */

import { loadTestConfig } from '../helpers/test-config.js';

describe('Docker Test Configuration', () => {
  test('should load Docker configuration', () => {
    const config = loadTestConfig();
    
    expect(config).toBeDefined();
    expect(config.docker).toBeDefined();
    expect(config.docker.image).toBe('foundryvtt/foundry:v12');
    expect(config.docker.port).toBe(30000);
    expect(config.puppeteer).toBeDefined();
    expect(config.puppeteer.headless).toBe(true);
    expect(config.puppeteer.timeout).toBe(30000);
  });
  
  test('should have Docker-only configuration (no binary options)', () => {
    const config = loadTestConfig();
    
    // Ensure no binary mode options exist
    expect(config.binary).toBeUndefined();
    expect(config.local).toBeUndefined();
    expect(config.development).toBeUndefined();
    
    // Only Docker and Puppeteer config allowed
    const allowedKeys = ['docker', 'puppeteer'];
    const configKeys = Object.keys(config);
    
    configKeys.forEach(key => {
      expect(allowedKeys).toContain(key);
    });
  });
});