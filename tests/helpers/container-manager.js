/**
 * @file tests/helpers/container-manager.js
 * @description Docker container lifecycle management for FoundryVTT integration testing
 * 
 * This manager handles:
 * - Dynamic Docker image building from Dockerfile.foundry
 * - Container lifecycle (start, stop, remove)
 * - Health checking and ready state validation
 * - Resource cleanup and error recovery
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import path, { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const execAsync = promisify(exec);

// Get the directory of this script for reliable path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

export class ContainerManager {
  constructor(config, portManager) {
    this.config = config;
    this.portManager = portManager;
    
    // Track running containers
    this.runningContainers = new Map(); // containerId -> { port, instanceId, startTime, permutation }
    
    // Docker configuration
    this.dockerConfig = {
      imagePrefix: config.docker.imagePrefix,
      dataPath: config.docker.dataPath,
      moduleMountPath: config.docker.moduleMountPath,
      systemsMountPath: config.docker.systemsMountPath
    };

    console.log('[Test Runner] ContainerManager initialized with config:', this.dockerConfig);
  }

  /**
   * Build Docker image for specific FoundryVTT version
   * @param {Object} permutation - Test permutation with version info
   * @returns {Promise<string>} Built image name
   */
  async buildDockerImage(permutation) {
    const imageName = permutation.dockerImage;
    const versionZip = this.getFoundryVersionZip(permutation.version);
    
    console.log(`[Test Runner] 🏗️  Building Docker image: ${imageName}`);
    console.log(`[Test Runner] 📦 Using FoundryVTT binary: ${versionZip}`);

    // Verify FoundryVTT zip file exists
    if (!fs.existsSync(versionZip)) {
      throw new Error(`FoundryVTT binary not found: ${versionZip}. Please download FoundryVTT ${permutation.version} binary.`);
    }

    // Check if image already exists
    try {
      const existingImage = await execAsync(`docker images -q ${imageName}`);
      if (existingImage.stdout.trim()) {
        console.log(`[Test Runner] ✅ Docker image ${imageName} already exists, skipping build`);
        return imageName;
      }
    } catch (error) {
      // Image doesn't exist, proceed with build
    }

    // Build the image
    const buildCommand = [
      'docker build',
      '-f tests/docker/Dockerfile.foundry',
      `--build-arg FOUNDRY_VERSION_ZIP=${path.basename(versionZip)}`,
      `--build-arg FOUNDRY_LICENSE_KEY=${this.config.foundryLicenseKey}`,
      `--build-arg FOUNDRY_DATA_PATH=${this.dockerConfig.dataPath}`,
      `-t ${imageName}`,
      '.'
    ].join(' ');

    console.log(`[Test Runner] 🔨 Build command: ${buildCommand}`);

    try {
      // Build with timeout and progress monitoring
      // Change to project root directory for Docker build
      const originalCwd = process.cwd();
      const projectRoot = this.getProjectRoot();
      
      if (process.cwd() !== projectRoot) {
        process.chdir(projectRoot);
        console.log(`[Test Runner] 📁 Changed to project root: ${projectRoot}`);
      }
      
      const buildProcess = exec(buildCommand);
      
      let buildOutput = '';
      buildProcess.stdout.on('data', (data) => {
        buildOutput += data;
        // Log important build steps
        if (data.includes('Step ') || data.includes('Successfully')) {
          console.log(`[Test Runner] 🏗️  ${data.trim()}`);
        }
      });

      buildProcess.stderr.on('data', (data) => {
        buildOutput += data;
        console.error(`🚨 Build error: ${data.trim()}`);
      });

      // Wait for build completion with timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          buildProcess.kill();
          reject(new Error(`Docker build timeout for ${imageName} after ${this.config.docker.timeouts.buildTimeout/60000} minutes`));
        }, this.config.docker.timeouts.buildTimeout);

        buildProcess.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker build failed for ${imageName} with exit code ${code}`));
          }
        });

        buildProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Restore original working directory
      if (process.cwd() !== originalCwd) {
        process.chdir(originalCwd);
        console.log(`[Test Runner] 📁 Restored working directory: ${originalCwd}`);
      }

      console.log(`[Test Runner] ✅ Docker image ${imageName} built successfully`);
      return imageName;

    } catch (error) {
      // Restore original working directory on error
      const originalCwd = process.cwd();
      const projectRoot = this.getProjectRoot();
      if (process.cwd() !== originalCwd) {
        process.chdir(originalCwd);
        console.log(`[Test Runner] 📁 Restored working directory: ${originalCwd}`);
      }
      
      console.error(`❌ Docker build failed for ${imageName}:`, error.message);
      throw error;
    }
  }

  /**
   * Start Docker container for testing
   * @param {Object} permutation - Test permutation
   * @param {string} instanceId - Unique instance identifier
   * @returns {Promise<Object>} Container information
   */
  async startContainer(permutation, instanceId) {
    console.log(`[Test Runner] 🚀 Starting container for ${permutation.id} (${instanceId})...`);

    // Allocate port
    const port = await this.portManager.allocatePort(instanceId);
    
    try {
      // Ensure image exists
      const imageName = await this.buildDockerImage(permutation);
      
      // Generate unique container name
      const containerName = `foundry-test-${permutation.id}-${instanceId}`;
      
      // Prepare volume mounts
      const cwd = process.cwd();
      const volumeMounts = [
        `-v "${path.join(cwd, 'scripts')}:${this.dockerConfig.moduleMountPath}"`,
        `-v "${path.join(cwd, 'foundry-systems')}:${this.dockerConfig.systemsMountPath}"` // If systems directory exists
      ];

      // Build run command
      const runCommand = [
        'docker run',
        '-d',
        `--name ${containerName}`,
        `-p ${port}:30000`,
        ...volumeMounts,
        imageName
      ].join(' ');

      console.log(`[Test Runner] 🔨 Run command: ${runCommand}`);

      // Start container
      const result = await execAsync(runCommand);
      const containerId = result.stdout.trim();

      if (!containerId) {
        throw new Error('Failed to get container ID from docker run');
      }

      console.log(`[Test Runner] 📦 Container started: ${containerId} on port ${port}`);

      // Track running container
      this.runningContainers.set(containerId, {
        port,
        instanceId,
        containerName,
        startTime: Date.now(),
        permutation,
        imageName
      });

      // Wait for container to be ready
      await this.waitForContainerReady(containerId, port);

      return {
        containerId,
        port,
        containerName,
        imageName,
        url: `http://localhost:${port}`
      };

    } catch (error) {
      // Release port on failure
      this.portManager.releasePort(instanceId, port);
      throw error;
    }
  }

  /**
   * Wait for container to be ready and FoundryVTT to respond
   * @param {string} containerId - Container ID
   * @param {number} port - Container port
   * @returns {Promise<void>}
   */
  async waitForContainerReady(containerId, port) {
    console.log(`[Test Runner] ⏳ Waiting for container ${containerId} to be ready on port ${port}...`);

    const maxAttempts = 30;
    const checkInterval = this.config.docker.timeouts.healthCheckInterval;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check container is still running
        const containerStatus = await execAsync(`docker container inspect ${containerId} --format='{{.State.Status}}'`);
        if (containerStatus.stdout.trim() !== 'running') {
          throw new Error(`Container ${containerId} stopped unexpectedly: ${containerStatus.stdout.trim()}`);
        }

        // Check if FoundryVTT is responding
        const healthCheck = await execAsync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`, { timeout: 5000 });
        const httpCode = healthCheck.stdout.trim();

        if (httpCode === '200' || httpCode === '302') {
          console.log(`[Test Runner] ✅ Container ${containerId} is ready (HTTP ${httpCode})`);
          return;
        }

        console.log(`[Test Runner] 🔄 Attempt ${attempt}/${maxAttempts}: HTTP ${httpCode}, waiting...`);

      } catch (error) {
        if (attempt === maxAttempts) {
          // Get container logs for debugging
          try {
            const logs = await execAsync(`docker logs ${containerId} --tail 50`);
            console.error(`❌ Container logs (last 50 lines):\n${logs.stdout}\n${logs.stderr}`);
          } catch (logError) {
            console.error('Failed to get container logs:', logError.message);
          }
          
          throw new Error(`Container ${containerId} failed to become ready after ${maxAttempts} attempts`);
        }

        console.log(`[Test Runner] 🔄 Attempt ${attempt}/${maxAttempts} failed: ${error.message}, retrying...`);
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Stop container
   * @param {string} containerId - Container ID
   * @returns {Promise<void>}
   */
  async stopContainer(containerId) {
    console.log(`[Test Runner] 🛑 Stopping container ${containerId}...`);

    try {
      await execAsync(`docker stop ${containerId}`, { timeout: this.config.docker.timeouts.containerStop });
      console.log(`[Test Runner] ✅ Container ${containerId} stopped`);
    } catch (error) {
      console.warn(`⚠️ Failed to stop container ${containerId}:`, error.message);
      // Try force stop
      try {
        await execAsync(`docker kill ${containerId}`);
        console.log(`[Test Runner] 🔪 Container ${containerId} force killed`);
      } catch (killError) {
        console.error(`❌ Failed to kill container ${containerId}:`, killError.message);
      }
    }
  }

  /**
   * Remove container
   * @param {string} containerId - Container ID
   * @returns {Promise<void>}
   */
  async removeContainer(containerId) {
    console.log(`[Test Runner] 🗑️  Removing container ${containerId}...`);

    try {
      await execAsync(`docker rm ${containerId}`);
      console.log(`[Test Runner] ✅ Container ${containerId} removed`);
      
      // Remove from tracking
      if (this.runningContainers.has(containerId)) {
        const container = this.runningContainers.get(containerId);
        this.portManager.releasePort(container.instanceId, container.port);
        this.runningContainers.delete(containerId);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to remove container ${containerId}:`, error.message);
    }
  }

  /**
   * Get container logs
   * @param {string} containerId - Container ID
   * @param {number} lines - Number of lines to get
   * @returns {Promise<Object>} Container logs
   */
  async getContainerLogs(containerId, lines = 100) {
    try {
      const result = await execAsync(`docker logs ${containerId} --tail ${lines}`);
      return {
        stdout: result.stdout,
        stderr: result.stderr
      };
    } catch (error) {
      console.error(`Failed to get logs for ${containerId}:`, error.message);
      return {
        stdout: '',
        stderr: '',
        error: error.message
      };
    }
  }

  /**
   * Get container manager status
   * @returns {Object} Status information
   */
  getStatus() {
    const containers = Array.from(this.runningContainers.entries()).map(([containerId, info]) => ({
      containerId: containerId.substring(0, 12),
      instanceId: info.instanceId,
      permutation: info.permutation.id,
      port: info.port,
      runningFor: Date.now() - info.startTime,
      imageName: info.imageName
    }));

    return {
      runningContainers: containers.length,
      containers
    };
  }

  /**
   * Cleanup all running containers
   * @returns {Promise<void>}
   */
  async cleanupAllContainers() {
    console.log('[Test Runner] 🧹 Cleaning up all running containers...');

    const containerIds = Array.from(this.runningContainers.keys());
    let cleanupErrors = [];
    
    // First cleanup tracked containers
    for (const containerId of containerIds) {
      try {
        console.log(`[Test Runner] 🧹 Cleaning up tracked container ${containerId.substring(0, 12)}...`);
        
        // Stop container first
        await this.stopContainer(containerId);
        
        // Then remove container
        await this.removeContainer(containerId);
        
        console.log(`[Test Runner] ✅ Successfully cleaned up container ${containerId.substring(0, 12)}`);
      } catch (error) {
        const errorMsg = `Cleanup failed for ${containerId.substring(0, 12)}: ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        cleanupErrors.push(errorMsg);
        
        // Try emergency cleanup with docker commands
        try {
          console.log(`[Test Runner] 🚨 Attempting emergency cleanup for ${containerId.substring(0, 12)}`);
          await execAsync(`docker kill ${containerId}`, { timeout: 10000 });
          await execAsync(`docker rm -f ${containerId}`, { timeout: 10000 });
          
          // Force remove from tracking
          if (this.runningContainers.has(containerId)) {
            const container = this.runningContainers.get(containerId);
            this.portManager.releasePort(container.instanceId, container.port);
            this.runningContainers.delete(containerId);
          }
          
          console.log(`[Test Runner] ✅ Emergency cleanup successful for ${containerId.substring(0, 12)}`);
        } catch (emergencyError) {
          console.error(`💥 Emergency cleanup also failed for ${containerId.substring(0, 12)}: ${emergencyError.message}`);
          cleanupErrors.push(`Emergency cleanup failed: ${emergencyError.message}`);
        }
      }
    }

    // Now cleanup orphaned containers created by bootstrap-runner using execSync
    console.log('[Test Runner] 🔍 Looking for orphaned session containers...');
    try {
      const { execSync } = await import('child_process');
      // Find all containers with names matching session-* pattern
      const orphanedContainers = execSync('docker ps -a --filter "name=session-" --format "{{.Names}}"', { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(name => name.length > 0);
      
      if (orphanedContainers.length > 0) {
        console.log(`[Test Runner] 📦 Found ${orphanedContainers.length} orphaned containers to clean up`);
        
        for (const containerName of orphanedContainers) {
          try {
            console.log(`[Test Runner] 🧹 Stopping orphaned container: ${containerName}`);
            execSync(`docker stop ${containerName}`, { stdio: 'ignore' });
            execSync(`docker rm ${containerName}`, { stdio: 'ignore' });
            console.log(`[Test Runner] ✅ Removed orphaned container: ${containerName}`);
          } catch (error) {
            console.warn(`⚠️ Failed to cleanup orphaned container ${containerName}: ${error.message}`);
          }
        }
      } else {
        console.log('[Test Runner] ✅ No orphaned containers found');
      }
    } catch (error) {
      console.warn(`⚠️ Failed to check for orphaned containers: ${error.message}`);
    }
    
    console.log(`[Test Runner] 🧹 Container cleanup completed`);
    
    if (cleanupErrors.length > 0) {
      console.warn(`⚠️ ${cleanupErrors.length} cleanup errors occurred:`);
      cleanupErrors.forEach(error => console.warn(`  - ${error}`));
    } else {
      console.log('[Test Runner] ✅ All containers cleaned up successfully');
    }
  }

  /**
   * Get FoundryVTT version zip file path
   * @param {string} version - FoundryVTT version
   * @returns {string} Path to zip file
   */
  getFoundryVersionZip(version) {
    // Get the project root directory
    const projectRoot = this.getProjectRoot();
    
    // Common locations for FoundryVTT binaries
    const possiblePaths = [
      path.join(projectRoot, 'tests/fixtures/binary_versions', version, 'FoundryVTT-Node-13.347.zip'),
      path.join(projectRoot, 'tests/fixtures/binary_versions', version, `foundryvtt-${version}.zip`),
      path.join(projectRoot, 'tests/fixtures/binary_versions', version, `FoundryVTT-${version}.zip`),
      path.join(projectRoot, 'foundry-binaries', `foundryvtt-${version}.zip`),
      path.join(projectRoot, 'foundry-binaries', `FoundryVTT-${version}.zip`),
      path.join(projectRoot, 'tests/binaries', `foundryvtt-${version}.zip`),
      path.join(projectRoot, `foundryvtt-${version}.zip`),
      path.join(projectRoot, 'foundryvtt.zip') // Generic fallback
    ];

    for (const zipPath of possiblePaths) {
      if (fs.existsSync(zipPath)) {
        return zipPath;
      }
    }

    // If no specific version found, return the generic path with instructions
    console.warn(`⚠️ FoundryVTT binary for ${version} not found in expected locations:`);
    possiblePaths.forEach(p => console.warn(`  - ${p}`));
    console.warn(`Please download FoundryVTT ${version} and place the zip file in one of these locations.`);
    
    return possiblePaths[0]; // Return first option for error reporting
  }

  /**
   * Verify Docker is available
   * @returns {Promise<boolean>} True if Docker is available
   */
  async verifyDockerAvailable() {
    try {
      await execAsync('docker --version');
      console.log('[Test Runner] ✅ Docker is available');
      return true;
    } catch (error) {
      console.error('❌ Docker is not available:', error.message);
      return false;
    }
  }

  /**
   * Get Docker system information
   * @returns {Promise<Object>} Docker system info
   */
  async getDockerInfo() {
    try {
      const versionResult = await execAsync('docker --version');
      const infoResult = await execAsync('docker system df');
      
      return {
        version: versionResult.stdout.trim(),
        systemInfo: infoResult.stdout.trim(),
        available: true
      };
    } catch (error) {
      return {
        version: 'N/A',
        systemInfo: 'N/A',
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Get the project root directory
   * @returns {string} Project root directory
   */
  getProjectRoot() {
    return PROJECT_ROOT;
  }
}