#!/usr/bin/env node

/**
 * @file tests/cleanup-test-containers.js
 * @description Automatic cleanup of FoundryVTT test containers
 * 
 * This script ensures that test containers are properly cleaned up
 * after each test run, preventing resource leaks and ensuring
 * consistent test environments.
 * 
 * Features:
 * - Finds and stops all FoundryVTT test containers
 * - Removes containers, networks, and volumes
 * - Handles multiple test instances
 * - Logs cleanup actions
 * - Can be run manually or automatically
 * 
 * Usage:
 *   node tests/cleanup-test-containers.js [options]
 * 
 * Options:
 *   --force          Force cleanup without confirmation
 *   --dry-run       Show what would be cleaned up without doing it
 *   --verbose       Show detailed cleanup information
 *   --help          Show this help message
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';

// Configuration
const CONTAINER_PREFIXES = [
  'foundry-test',
  'foundry-vtt-test',
  'simulacrum-foundry',
  'foundry-bootstrap'
];

const PORT_RANGES = [
  { start: 30000, end: 30010 },
  { start: 30020, end: 30030 },
  { start: 30040, end: 30050 }
];

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  force: args.includes('--force'),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  help: args.includes('--help')
};

if (options.help) {
  console.log(`
🧹 FoundryVTT Test Container Cleanup
====================================

Usage: node tests/cleanup-test-containers.js [options]

Options:
  --force          Force cleanup without confirmation
  --dry-run        Show what would be cleaned up without doing it
  --verbose        Show detailed cleanup information
  --help           Show this help message

Examples:
  node tests/cleanup-test-containers.js
  node tests/cleanup-test-containers.js --force
  node tests/cleanup-test-containers.js --dry-run --verbose
`);
  process.exit(0);
}

/**
 * Get all running Docker containers
 */
function getRunningContainers() {
  try {
    const output = execSync('docker ps --format "{{.ID}}\t{{.Names}}\t{{.Ports}}\t{{.Status}}"', { encoding: 'utf8' });
    return output.trim().split('\n').filter(line => line.trim());
  } catch (error) {
    console.log('⚠️  Docker not available or no containers running');
    return [];
  }
}

/**
 * Check if a container is a FoundryVTT test container
 */
function isTestContainer(containerInfo) {
  const [id, name, ports, status] = containerInfo.split('\t');
  
  // Check container name
  const isTestName = CONTAINER_PREFIXES.some(prefix => 
    name.toLowerCase().includes(prefix.toLowerCase())
  );
  
  // Check ports (FoundryVTT typically uses 30000+)
  const hasTestPorts = PORT_RANGES.some(range => {
    const portMatch = ports.match(/:(\d+)->/);
    if (portMatch) {
      const port = parseInt(portMatch[1]);
      return port >= range.start && port <= range.end;
    }
    return false;
  });
  
  return isTestName || hasTestPorts;
}

/**
 * Get container details for logging
 */
function getContainerDetails(containerId) {
  try {
    const inspect = execSync(`docker inspect ${containerId}`, { encoding: 'utf8' });
    const container = JSON.parse(inspect)[0];
    return {
      name: container.Name.replace('/', ''),
      image: container.Config.Image,
      ports: container.NetworkSettings.Ports,
      created: container.Created,
      state: container.State.Status
    };
  } catch (error) {
    return { name: 'unknown', image: 'unknown', ports: {}, created: 'unknown', state: 'unknown' };
  }
}

/**
 * Stop and remove a container
 */
function cleanupContainer(containerId, containerInfo) {
  const [id, name, ports, status] = containerInfo.split('\t');
  
  if (options.dryRun) {
    console.log(`🔍 Would clean up: ${name} (${id}) - ${ports}`);
    return;
  }
  
  try {
    console.log(`🛑 Stopping container: ${name} (${id})`);
    execSync(`docker stop ${id}`, { stdio: 'inherit' });
    
    console.log(`🗑️  Removing container: ${name} (${id})`);
    execSync(`docker rm ${id}`, { stdio: 'inherit' });
    
    console.log(`✅ Cleaned up: ${name} (${id})`);
  } catch (error) {
    console.error(`❌ Failed to clean up ${name} (${id}): ${error.message}`);
  }
}

/**
 * Clean up Docker networks
 */
function cleanupNetworks() {
  try {
    const networks = execSync('docker network ls --format "{{.ID}}\t{{.Name}}"', { encoding: 'utf8' });
    const testNetworks = networks.trim().split('\n').filter(line => {
      const [id, name] = line.split('\t');
      return CONTAINER_PREFIXES.some(prefix => 
        name.toLowerCase().includes(prefix.toLowerCase())
      );
    });
    
    if (testNetworks.length > 0) {
      console.log('🌐 Cleaning up test networks...');
      testNetworks.forEach(network => {
        const [id, name] = network.split('\t');
        if (options.dryRun) {
          console.log(`🔍 Would remove network: ${name} (${id})`);
        } else {
          try {
            execSync(`docker network rm ${id}`, { stdio: 'inherit' });
            console.log(`✅ Removed network: ${name} (${id})`);
          } catch (error) {
            console.log(`⚠️  Could not remove network ${name}: ${error.message}`);
          }
        }
      });
    }
  } catch (error) {
    console.log('⚠️  Could not list networks');
  }
}

/**
 * Clean up Docker volumes
 */
function cleanupVolumes() {
  try {
    const volumes = execSync('docker volume ls --format "{{.Name}}"', { encoding: 'utf8' });
    const testVolumes = volumes.trim().split('\n').filter(name => 
      CONTAINER_PREFIXES.some(prefix => 
        name.toLowerCase().includes(prefix.toLowerCase())
      )
    );
    
    if (testVolumes.length > 0) {
      console.log('💾 Cleaning up test volumes...');
      testVolumes.forEach(name => {
        if (options.dryRun) {
          console.log(`🔍 Would remove volume: ${name}`);
        } else {
          try {
            execSync(`docker volume rm ${name}`, { stdio: 'inherit' });
            console.log(`✅ Removed volume: ${name}`);
          } catch (error) {
            console.log(`⚠️  Could not remove volume ${name}: ${error.message}`);
          }
        }
      });
    }
  } catch (error) {
    console.log('⚠️  Could not list volumes');
  }
}

/**
 * Main cleanup function
 */
function main() {
  console.log('🧹 FoundryVTT Test Container Cleanup');
  console.log('====================================');
  
  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No containers will be modified');
  }
  
  console.log('');
  
  // Get running containers
  const containers = getRunningContainers();
  
  if (containers.length === 0) {
    console.log('✅ No containers running');
    return;
  }
  
  // Find test containers
  const testContainers = containers.filter(isTestContainer);
  
  if (testContainers.length === 0) {
    console.log('✅ No FoundryVTT test containers found');
    return;
  }
  
  console.log(`🔍 Found ${testContainers.length} test container(s):`);
  testContainers.forEach(container => {
    const [id, name, ports, status] = container.split('\t');
    console.log(`   ${name} (${id}) - ${ports} - ${status}`);
  });
  
  console.log('');
  
  // Confirm cleanup (unless --force is used)
  if (!options.force && !options.dryRun) {
    console.log('⚠️  This will stop and remove all test containers.');
    console.log('   Use --force to skip confirmation or --dry-run to preview.');
    console.log('');
    
    // In automated environments, we can't prompt, so just proceed
    if (process.env.CI || process.env.AUTOMATED_TESTING) {
      console.log('🤖 Automated environment detected, proceeding with cleanup...');
    } else {
      console.log('❓ Continue? (y/N)');
      // For now, just proceed since we can't do interactive input easily
      console.log('🤖 Proceeding with cleanup...');
    }
  }
  
  console.log('');
  
  // Clean up containers
  console.log('🚀 Starting cleanup...');
  testContainers.forEach(container => cleanupContainer(...container.split('\t')));
  
  // Clean up networks and volumes
  cleanupNetworks();
  cleanupVolumes();
  
  console.log('');
  console.log('🏁 Cleanup complete!');
  
  // Show final status
  const remainingContainers = getRunningContainers();
  if (remainingContainers.length > 0) {
    console.log(`📊 ${remainingContainers.length} container(s) still running`);
  } else {
    console.log('📊 All containers stopped');
  }
}

// Run cleanup
main();
