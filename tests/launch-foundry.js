#!/usr/bin/env node

/**
 * @file tests/launch-foundry.js
 * @description Manual FoundryVTT Launcher for Development Testing
 * 
 * This tool launches a live FoundryVTT session using Docker containers
 * and the bootstrap infrastructure. It provides a development environment
 * for manual testing of the Simulacrum module.
 * 
 * The launcher will:
 * 1. Create a Docker container with FoundryVTT
 * 2. Bootstrap the complete setup (license, EULA, system install, world creation)
 * 3. Launch the game world with the Simulacrum module
 * 4. Wait for user to press ESC key before cleanup
 * 
 * For automated unit tests, use run-tests.js instead.
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BootstrapRunner } from './bootstrap/bootstrap-runner.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEBUG_MODE = process.env.DEBUG === 'true' || process.argv.includes('--debug');

// Initialize logging to artifacts
const LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), 'artifacts', `launch-foundry-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
writeFileSync(LOG_FILE, `FoundryVTT Launch Started: ${new Date().toISOString()}\n${'='.repeat(80)}\n`);

// Wrap console methods to also log to file
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  const message = args.join(' ');
  originalLog(...args);
  try { appendFileSync(LOG_FILE, `${new Date().toISOString()} [LOG] ${message}\n`); } catch {}
};

console.warn = (...args) => {
  const message = args.join(' ');
  originalWarn(...args);
  try { appendFileSync(LOG_FILE, `${new Date().toISOString()} [WARN] ${message}\n`); } catch {}
};

console.error = (...args) => {
  const message = args.join(' ');
  originalError(...args);
  try { appendFileSync(LOG_FILE, `${new Date().toISOString()} [ERROR] ${message}\n`); } catch {}
};

class LaunchLogger {
  constructor(debugMode = false) {
    this.debugMode = debugMode;
    if (this.debugMode) {
      console.log('[FoundryVTT Launcher] [Debug] 🐛 DEBUG MODE ENABLED - Verbose output enabled');
    }
  }

  success(message) {
    console.log(`[FoundryVTT Launcher] ✅ ${message}`);
  }

  warn(message) {
    console.warn(`[FoundryVTT Launcher] ⚠️ ${message}`);
  }

  error(message) {
    console.error(`[FoundryVTT Launcher] ❌ ${message}`);
  }

  info(message) {
    console.log(`[FoundryVTT Launcher] 📋 ${message}`);
  }

  debug(message) {
    if (this.debugMode) {
      console.log(`[FoundryVTT Launcher] [Debug] 🔍 ${message}`);
    }
  }
}

class FoundryLauncher {
  constructor() {
    this.config = null;
    this.bootstrap = null;
    this.logger = new LaunchLogger(DEBUG_MODE);
    this.startTime = Date.now();
  }

  async initialize() {
    this.logger.info('Initializing FoundryVTT launcher...');
    
    // Load test configuration
    const configPath = join(PROJECT_ROOT, 'tests', 'config', 'test.config.json');
    if (!existsSync(configPath)) {
      throw new Error('Test configuration file not found: tests/config/test.config.json');
    }

    try {
      const configContent = readFileSync(configPath, 'utf-8');
      this.config = JSON.parse(configContent);
      this.logger.success('Configuration loaded');
      this.logger.debug(`Supported versions: ${this.config['foundry-versions'].join(', ')}`);
      this.logger.debug(`Supported systems: ${this.config['foundry-systems'].join(', ')}`);
    } catch (error) {
      throw new Error(`Failed to load test configuration: ${error.message}`);
    }

    // Initialize bootstrap runner
    this.bootstrap = new BootstrapRunner(this.config, this.logger);
  }

  async launch(options = {}) {
    const { versions = null, systems = null } = options;

    // Determine which versions to test
    const versionsToTest = versions || [this.config['foundry-versions'][0]]; // Default to first version
    const systemsToTest = systems || [this.config['foundry-systems'][0]]; // Default to first system

    this.logger.info(`Launching FoundryVTT ${versionsToTest[0]} with ${systemsToTest[0]} system...`);
    
    try {
      // Clean up any existing artifacts
      this.cleanArtifacts();

      // Create session for manual testing
      const session = await this.bootstrap.createSession(versionsToTest[0], systemsToTest[0]);
      this.logger.success(`FoundryVTT session created: ${session.name}`);
      this.logger.info(`Access URL: http://localhost:${session.port}`);
      this.logger.info('');
      this.logger.info('🎮 FoundryVTT is now running!');
      this.logger.info('📝 You can now manually test the Simulacrum module');
      this.logger.info('🌐 Open your browser and navigate to the URL above');
      this.logger.info('');
      this.logger.info('⌨️  Press ESC key to stop and cleanup when done...');

      // Wait for user to press ESC
      await this.waitForEscapeKey();

      this.logger.info('🧹 Cleaning up session...');
      await this.bootstrap.cleanup();
      
      const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
      this.logger.success(`Session completed in ${totalTime}s`);

    } catch (error) {
      this.logger.error(`Launch failed: ${error.message}`);
      if (this.bootstrap) {
        this.logger.info('🧹 Attempting cleanup...');
        await this.bootstrap.cleanup();
      }
      throw error;
    }
  }

  cleanArtifacts() {
    const artifactsPath = join(PROJECT_ROOT, 'tests', 'artifacts');
    
    if (existsSync(artifactsPath)) {
      try {
        // Clean up old screenshots and logs (keep recent ones)
        const now = Date.now();
        const files = readdirSync(artifactsPath);
        
        for (const file of files) {
          const filePath = join(artifactsPath, file);
          const stats = statSync(filePath);
          const ageHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);
          
          // Remove files older than 24 hours
          if (ageHours > 24) {
            unlinkSync(filePath);
            this.logger.debug(`Cleaned up old artifact: ${file}`);
          }
        }
      } catch (error) {
        this.logger.debug(`Artifact cleanup failed: ${error.message}`);
      }
    }
  }

  async waitForEscapeKey() {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      stdin.on('data', (key) => {
        // ESC key is \u001b
        if (key === '\u001b') {
          stdin.setRawMode(false);
          stdin.pause();
          resolve();
        }
        // Also handle Ctrl+C
        if (key === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          resolve();
        }
      });
    });
  }
}

// Normalize version tokens (v12 -> v12, 12 -> v12)
function normalizeVersionToken(version) {
  return version.startsWith('v') ? version : `v${version}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    versions: null,
    systems: null
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--versions' || arg === '-v') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.versions = nextArg.split(',').map(v => normalizeVersionToken(v));
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--versions=')) {
      options.versions = arg.split('=')[1].split(',').map(v => normalizeVersionToken(v));
    } else if (arg === '--systems' || arg === '-s') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.systems = nextArg.split(',').map(s => s.trim());
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--systems=')) {
      options.systems = arg.split('=')[1].split(',').map(s => s.trim());
    }
  }
  
  return options;
}

// Display help message
function showHelp() {
  console.log(`[FoundryVTT Launcher] 
FoundryVTT Manual Testing Launcher

Usage: node launch-foundry.js [options]

Options:
  --help, -h              Show this help message
  --debug                 Enable verbose debug output (same as DEBUG=true)
  --versions, -v <list>   Override FoundryVTT version (defaults to first configured)
  --systems, -s <list>    Override game system (defaults to first configured)
  
Description:
  This launcher creates a live FoundryVTT session using Docker containers
  for manual testing and development. It performs complete bootstrap setup
  including license acceptance, EULA handling, system installation, and
  world creation.
  
  The session will remain active until you press the ESC key, allowing
  you to manually test the Simulacrum module in a real FoundryVTT environment.
  
Examples:
  node launch-foundry.js                    # Launch default version and system
  node launch-foundry.js -v v13 -s dnd5e   # Launch FoundryVTT v13 with D&D 5e
  node launch-foundry.js --debug           # Launch with verbose debug output

For automated unit testing, use:
  node run-tests.js
`);
}

// Main execution
async function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      return;
    }

    const launcher = new FoundryLauncher();
    await launcher.initialize();

    await launcher.launch({
      versions: options.versions,
      systems: options.systems
    });

  } catch (error) {
    console.error(`[FoundryVTT Launcher] ❌ Fatal error: ${error.message}`);
    if (DEBUG_MODE) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`[FoundryVTT Launcher] ❌ Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

export { FoundryLauncher };