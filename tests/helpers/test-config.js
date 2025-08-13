/**
 * Test Configuration Loader
 * 
 * Loads Docker-only test configuration for integration tests.
 * DOCKER ONLY - No binary mode, no local development options.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_DIR = join(__dirname, '..', 'config');
const CONFIG_FILE = join(CONFIG_DIR, 'test.config.json');
const TEMPLATE_FILE = join(CONFIG_DIR, 'test.config.template.json');

/**
 * Load test configuration from file or template
 * @returns {Object} Test configuration object
 */
export function loadTestConfig() {
  try {
    // Try to load user config first
    if (existsSync(CONFIG_FILE)) {
      const configData = readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(configData);
    }
    
    // Fall back to template
    if (existsSync(TEMPLATE_FILE)) {
      const templateData = readFileSync(TEMPLATE_FILE, 'utf8');
      return JSON.parse(templateData);
    }
    
    throw new Error('No test configuration found');
  } catch (error) {
    throw new Error(`Failed to load test configuration: ${error.message}`);
  }
}