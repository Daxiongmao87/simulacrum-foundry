#!/usr/bin/env node

/**
 * Deploy packaged Simulacrum module to all running test containers
 *
 * This script:
 * 1. Runs npm run package to create the distribution
 * 2. Finds all running Docker containers matching the test prefix
 * 3. Deploys the packaged module to each container using copy-to-docker.js
 *
 * Usage: node tools/deploy-to-test-containers.js
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test configuration
const configPath = resolve(__dirname, '../tests/config/test.config.json');
let config;

try {
  const configData = readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
} catch (error) {
  console.error('❌ Error: Could not load test configuration');
  console.error(`Expected file: ${configPath}`);
  console.error(error.message);
  process.exit(1);
}

const containerPrefix = config.docker.imagePrefix;
const supportedVersions = config['foundry-versions'];

console.log(`Simulacrum | 🚀 Deploying Simulacrum to test containers...`);
console.log(`Simulacrum | 📦 Container prefix: ${containerPrefix}`);
console.log(`🔧 Supported versions: ${supportedVersions.join(', ')}`);

try {
  // Step 1: Package the module
  console.log('Simulacrum | \n📦 Step 1: Packaging module...');
  execSync('npm run package', { stdio: 'inherit' });
  console.log('Simulacrum | ✅ Module packaged successfully');

  // Step 2: Find running containers started from images with our prefix
  console.log('Simulacrum | \n🔍 Step 2: Finding running test containers...');

  let runningContainers = [];
  try {
    const containerOutput = execSync(
      'docker ps --format "{{.Names}}||{{.Image}}"',
      { encoding: 'utf8', stdio: 'pipe' }
    );

    const lines = containerOutput
      .trim()
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const parsed = lines
      .map(line => {
        const [name, image] = line.split('||');
        return { name: name?.trim(), image: image?.trim() };
      })
      .filter(entry => entry.name && entry.image);

    // Match images that start with our configured imagePrefix (optionally with a tag suffix)
    runningContainers = parsed.filter(({ image }) => {
      // Remove tag if present (e.g., ":latest") for matching
      const imageBase = image.split(':')[0];
      return (
        imageBase === containerPrefix ||
        imageBase.startsWith(`${containerPrefix}-`)
      );
    });
  } catch (error) {
    console.log('Simulacrum | 📋 No running containers found');
    runningContainers = [];
  }

  if (runningContainers.length === 0) {
    console.log(`⚠️  No running containers found for images with prefix "${containerPrefix}"`);
    console.log('Simulacrum | 💡 Try running some tests first with: node tests/run-tests.js --manual');
    process.exit(0);
  }

  console.log(`Simulacrum | ✅ Found ${runningContainers.length} running test container(s):`);
  runningContainers.forEach(({ name, image }) =>
    console.log(`Simulacrum |    - ${name} (image: ${image})`)
  );

  // Step 3: Deploy to each container
  console.log('Simulacrum | \n🚚 Step 3: Deploying to containers...');

  let deployedCount = 0;
  let failedCount = 0;

  for (const { name: containerName, image: imageNameRaw } of runningContainers) {
    // Extract version from image name (expected: simulacrum-foundry-test-v13-<system>[:tag])
    const imageName = imageNameRaw.split(':')[0];
    const versionMatch = imageName.match(/-v(\d+)-/);

    if (!versionMatch) {
      console.log(`Simulacrum | ⚠️  Skipping ${containerName}: Could not determine version from image ${imageName}`);
      failedCount++;
      continue;
    }

    const version = `v${versionMatch[1]}`;

    if (!supportedVersions.includes(version)) {
      console.log(`Simulacrum | ⚠️  Skipping ${containerName}: Unsupported version ${version}`);
      failedCount++;
      continue;
    }

    console.log(`Simulacrum | \n📤 Deploying to ${containerName} (${version})...`);

    try {
      execSync(
        `node tools/copy-to-docker.js "${containerName}" "${version}"`,
        { stdio: 'inherit' }
      );
      deployedCount++;
    } catch (error) {
      console.error(`❌ Failed to deploy to ${containerName}`);
      failedCount++;
    }
  }

  // Summary
  console.log('Simulacrum | \n📊 Deployment Summary:');
  console.log(`Simulacrum | ✅ Successfully deployed to ${deployedCount} container(s)`);
  if (failedCount > 0) {
    console.log(`Simulacrum | ❌ Failed to deploy to ${failedCount} container(s)`);
  }

  if (deployedCount > 0) {
    console.log('Simulacrum | \n🎉 Deployment complete!');
    console.log('Simulacrum | 🔄 You may need to restart FoundryVTT or refresh the modules list in each instance');
  }

} catch (error) {
  console.error(`❌ Deployment failed: ${error.message}`);
  process.exit(1);
}
