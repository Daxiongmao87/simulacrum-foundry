/**
 * Test Configuration Loader
 * 
 * Loads Docker-only test configuration for integration tests.
 * DOCKER ONLY - No binary mode, no local development options.
 * Dynamically discovers FoundryVTT versions from binary_versions directory.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_DIR = join(__dirname, '..', 'config');
const CONFIG_FILE = join(CONFIG_DIR, 'test.config.json');
const TEMPLATE_FILE = join(CONFIG_DIR, 'test.config.template.json');
const BINARY_VERSIONS_DIR = join(__dirname, '..', 'fixtures', 'binary_versions');

/**
 * Dynamically discover FoundryVTT versions from binary_versions directory
 * @returns {Array} Array of version objects with version and zipFile
 */
function discoverVersions() {
  const versions = [];
  
  if (!existsSync(BINARY_VERSIONS_DIR)) {
    console.warn(`Binary versions directory not found: ${BINARY_VERSIONS_DIR}`);
    return versions;
  }
  
  const versionDirs = readdirSync(BINARY_VERSIONS_DIR)
    .filter(name => {
      const fullPath = join(BINARY_VERSIONS_DIR, name);
      return statSync(fullPath).isDirectory() && !name.startsWith('.');
    });
  
  for (const versionDir of versionDirs) {
    const versionPath = join(BINARY_VERSIONS_DIR, versionDir);
    const zipFiles = readdirSync(versionPath)
      .filter(file => file.endsWith('.zip'));
    
    if (zipFiles.length === 1) {
      versions.push({
        version: versionDir,
        zipFile: zipFiles[0],
        enabled: true
      });
    } else if (zipFiles.length === 0) {
      console.warn(`No ZIP file found in version directory: ${versionDir}`);
    } else {
      console.warn(`Multiple ZIP files found in version directory: ${versionDir}, using first: ${zipFiles[0]}`);
      versions.push({
        version: versionDir,
        zipFile: zipFiles[0],
        enabled: true
      });
    }
  }
  
  return versions;
}

/**
 * Load test configuration from file or template
 * @returns {Object} Test configuration object with dynamically discovered versions
 */
export function loadTestConfig() {
  try {
    // Try to load user config first
    let config;
    if (existsSync(CONFIG_FILE)) {
      const configData = readFileSync(CONFIG_FILE, 'utf8');
      config = JSON.parse(configData);
    } else if (existsSync(TEMPLATE_FILE)) {
      const templateData = readFileSync(TEMPLATE_FILE, 'utf8');
      config = JSON.parse(templateData);
    } else {
      throw new Error('No test configuration found');
    }
    
    // Dynamically discover and inject versions
    config.versions = discoverVersions();
    
    if (config.versions.length === 0) {
      throw new Error('No FoundryVTT versions discovered in binary_versions directory');
    }
    
    console.log(`Discovered ${config.versions.length} FoundryVTT versions:`, 
      config.versions.map(v => `${v.version} (${v.zipFile})`));
    
    return config;
  } catch (error) {
    throw new Error(`Failed to load test configuration: ${error.message}`);
  }
}