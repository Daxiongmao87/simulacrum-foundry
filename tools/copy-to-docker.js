#!/usr/bin/env node

/**
 * Copy packaged Simulacrum module into a Docker container
 * Usage: node tools/copy-to-docker.js <container-name>
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Get container name and version from command line arguments
const containerName = process.argv[2];
const version = process.argv[3];

if (!containerName || !version) {
  console.error('Error: Container name and version are required');
  console.error('Usage: node tools/copy-to-docker.js <container-name> <version>');
  console.error('Example: node tools/copy-to-docker.js my-foundry-container v12');
  console.error('Supported versions: v12, v13');
  process.exit(1);
}

// Validate version
if (!['v12', 'v13'].includes(version)) {
  console.error(`Error: Unsupported version "${version}"`);
  console.error('Supported versions: v12, v13');
  process.exit(1);
}

// Path to the packaged module
const distPath = resolve('dist');

// Check if package directory exists
if (!existsSync(distPath)) {
  console.error('Error: Package directory not found at dist/');
  console.error('Run "npm run package" first to create the package');
  process.exit(1);
}

// Check if required files exist in dist
const requiredFiles = ['module.json', 'scripts'];
for (const file of requiredFiles) {
  if (!existsSync(resolve(distPath, file))) {
    console.error(`Error: Required file/directory "${file}" not found in dist/`);
    console.error('Run "npm run package" first to create the package');
    process.exit(1);
  }
}

// Version-specific configuration
const getVersionConfig = (version) => {
  switch (version) {
    case 'v12':
      return {
        dataPath: '/data',  // Standard data path for v12 containers
        modulesPath: '/data/Data/modules'
      };
    case 'v13':  
      return {
        dataPath: '/data',  // Standard data path for v13 containers
        modulesPath: '/data/Data/modules'
      };
    default:
      throw new Error(`Unsupported version: ${version}`);
  }
};

const config = getVersionConfig(version);

try {
  // Check if container exists and is running
  console.log(`Checking if container "${containerName}" (${version}) is running...`);
  execSync(`docker ps -q -f name=${containerName}`, { stdio: 'pipe' });
  
  // Container paths for FoundryVTT modules
  const foundryModulesPath = config.modulesPath;
  const simulacrumPath = `${foundryModulesPath}/simulacrum`;
  
  console.log(`Copying package to container "${containerName}"...`);
  
  // Remove existing module directory in container
  execSync(`docker exec "${containerName}" rm -rf "${simulacrumPath}"`, { stdio: 'inherit' });
  
  // Copy the entire dist directory to the container as simulacrum module
  execSync(`docker cp "${distPath}" "${containerName}:${simulacrumPath}"`, { stdio: 'inherit' });
  
  console.log(`✅ Successfully copied Simulacrum module to container "${containerName}" (${version})`);
  console.log(`Simulacrum | 📁 Module installed at: ${simulacrumPath}`);
  console.log('Simulacrum | 🔄 You may need to restart FoundryVTT or refresh the modules list');
  
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  
  if (error.message.includes('No such container')) {
    console.error(`Container "${containerName}" does not exist or is not running`);
    console.error('Available containers:');
    try {
      execSync('docker ps --format "table {{.Names}}\\t{{.Status}}"', { stdio: 'inherit' });
    } catch (listError) {
      console.error('Could not list containers');
    }
  }
  
  process.exit(1);
}