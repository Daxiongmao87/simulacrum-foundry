#!/usr/bin/env node

/**
 * @file tests/bootstrap/common/docker-utils.js
 * @description Common Docker operations for FoundryVTT test containers
 */

import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

/**
 * Build a FoundryVTT Docker image
 * @param {string} imageName - Name for the Docker image
 * @param {string} version - FoundryVTT version (v12, v13, etc.)
 * @param {string} foundryLicenseKey - License key for FoundryVTT
 * @returns {Promise<void>}
 */
export async function buildFoundryImage(imageName, version, foundryLicenseKey) {
  console.log(`[Docker Utils] 🔨 Building Docker image: ${imageName}...`);
  console.log(`[Docker Utils] 🔑 Using license key: ${foundryLicenseKey.substring(0, 4)}****`);
  
  try {
    // Determine the zip file based on version
    const zipFileName = getZipFileForVersion(version);
    const dockerfilePath = join(PROJECT_ROOT, 'tests', 'docker', 'Dockerfile.foundry');
    // Use runner's behavior: pass context path directly; main.js build arg is /app/main.js
    const contextZipPath = `tests/fixtures/binary_versions/${version}/${zipFileName}`;
    const mainJsPath = '/app/main.js';
    
    execSync(`docker build -f ${dockerfilePath} --build-arg FOUNDRY_VERSION_ZIP=${contextZipPath} --build-arg FOUNDRY_MAIN_JS_PATH=${mainJsPath} --build-arg FOUNDRY_LICENSE_KEY=${foundryLicenseKey} -t ${imageName} .`, { 
      stdio: 'inherit',
      cwd: PROJECT_ROOT 
    });
    console.log(`[Docker Utils] ✅ Docker image ${imageName} built successfully`);
  } catch (error) {
    console.error('❌ Docker build failed:', error.message);
    throw error;
  }
}

/**
 * Get the zip file name for a specific FoundryVTT version
 * @param {string} version - FoundryVTT version
 * @returns {string} Zip file name
 */
function getZipFileForVersion(version) {
  // Dynamically discover zip file in version folder
  const versionPath = join(PROJECT_ROOT, 'tests', 'fixtures', 'binary_versions', version);
  try {
    const entries = readdirSync(versionPath);
    const zipFiles = entries.filter(entry => entry.endsWith('.zip'));
    
    if (zipFiles.length === 0) {
      throw new Error(`No zip files found in ${versionPath}`);
    }
    
    if (zipFiles.length > 1) {
      console.warn(`⚠️ Multiple zip files found in ${versionPath}, using first: ${zipFiles[0]}`);
    }
    
    return zipFiles[0];
  } catch (error) {
    throw new Error(`Failed to discover zip file for ${version}: ${error.message}`);
  }
}

/**
 * Start a FoundryVTT container
 * @param {string} containerName - Name for the container
 * @param {string} imageName - Docker image name
 * @param {number} port - Port to expose
 * @returns {Promise<string>} Container ID
 */
export async function startFoundryContainer(containerName, imageName, port, version) {
  console.log(`[Docker Utils] 🚀 Starting FoundryVTT container from image: ${imageName}...`);
  
  try {
    // Clean up any existing containers with the same name
    try {
      execSync(`docker stop ${containerName}`, { stdio: 'ignore' });
      execSync(`docker rm ${containerName}`, { stdio: 'ignore' });
    } catch (e) {
      // Container might not exist, which is fine
    }
    
    // Start fresh container (mirror runner env args)
    const envArgs = version === 'v12'
      ? '-e FOUNDRY_DATA_PATH=/data -e FOUNDRY_MAIN_JS_PATH=/app/resources/app/main.js'
      : '-e FOUNDRY_DATA_PATH=/data';
    const containerId = execSync(`docker run -d --name ${containerName} ${envArgs} -p ${port}:30000 ${imageName}`, { encoding: 'utf8' }).trim();
    console.log(`[Docker Utils] 📦 Container ID: ${containerId}`);
    
    return containerId;
  } catch (error) {
    console.error('❌ Failed to start container:', error.message);
    throw error;
  }
}

/**
 * Stop and remove a container
 * @param {string} containerId - Container ID to remove
 */
export function removeContainer(containerId) {
  try {
    execSync(`docker rm -f ${containerId}`, { stdio: 'ignore' });
    console.log(`[Docker Utils] ✅ Container ${containerId} force removed`);
  } catch (e) {
    console.warn(`⚠️ Container cleanup failed: ${e.message}`);
  }
}

/**
 * Get container logs
 * @param {string} containerId - Container ID
 * @returns {string} Container logs
 */
export function getContainerLogs(containerId) {
  try {
    return execSync(`docker logs ${containerId.slice(0, 12)}`, { encoding: 'utf8' });
  } catch (e) {
    return `Could not retrieve logs: ${e.message}`;
  }
}

/**
 * Remove a Docker image
 * @param {string} imageName - Image name to remove
 */
export function removeImage(imageName) {
  try {
    execSync(`docker rmi ${imageName}`, { stdio: 'ignore' });
    console.log(`[Docker Utils] ✅ Docker image ${imageName} removed`);
  } catch (e) {
    console.warn(`⚠️ Docker image cleanup failed for ${imageName}: ${e.message}`);
  }
}

/**
 * Check if a container is ready by testing HTTP response
 * @param {number} port - Port to test
 * @param {Object} config - Configuration object with retry settings
 * @returns {Promise<boolean>} True if container is ready
 */
export async function waitForContainerReady(port, config) {
  const retries = config?.bootstrap?.retries?.containerHealthCheck ?? 30;
  const curlTimeout = config?.bootstrap?.retries?.curlTimeout ?? 5000;
  const interval = config?.bootstrap?.retries?.healthCheckInterval ?? 1000;
  for (let i = 0; i < retries; i++) {
    try {
      const response = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`, { 
        encoding: 'utf8', 
        timeout: curlTimeout 
      });
      if (response.trim() === '302') {
        return true;
      }
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}
