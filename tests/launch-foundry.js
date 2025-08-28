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
import { execSync } from 'child_process';
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

  async discoverSessions() {
    this.logger.debug('Discovering running FoundryVTT sessions...');
    
    try {
      // Find running Docker containers that look like FoundryVTT test containers
      const dockerCommand = 'docker ps --format "table {{.ID}}\\t{{.Names}}\\t{{.Ports}}\\t{{.Status}}\\t{{.Image}}"';
      const containerList = execSync(dockerCommand, { encoding: 'utf8' });
      
      const sessions = [];
      const lines = containerList.split('\n').slice(1); // Skip header
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.split('\t');
        if (parts.length >= 4) {
          const [containerId, name, ports, status, image] = parts;
          
          // Look for containers that appear to be FoundryVTT test containers
          if (name.includes('test-') || ports.includes('30000')) {
            // Extract port number from ports string (e.g., "0.0.0.0:30001->30000/tcp")
            const portMatch = ports.match(/0\.0\.0\.0:(\d+)->30000/);
            const port = portMatch ? portMatch[1] : null;
            
            if (port) {
              sessions.push({
                id: containerId.substring(0, 12), // Short container ID
                name,
                port: parseInt(port),
                url: `http://localhost:${port}`,
                status: status.trim(),
                image: image || 'unknown',
                containerId
              });
            }
          }
        }
      }
      
      return sessions;
    } catch (error) {
      this.logger.debug(`Failed to discover sessions: ${error.message}`);
      return [];
    }
  }

  async listSessions() {
    this.logger.info('Listing running FoundryVTT sessions...');
    
    const sessions = await this.discoverSessions();
    
    if (sessions.length === 0) {
      this.logger.info('No running FoundryVTT sessions found.');
      this.logger.info('Start a session using: node tests/launch-foundry.js --daemon -v v13 -s dnd5e');
      return { success: true, sessions: [] };
    }
    
    this.logger.success(`Found ${sessions.length} running session${sessions.length === 1 ? '' : 's'}:`);
    console.log(''); // Empty line for readability
    
    for (const session of sessions) {
      this.logger.info(`📋 Session: ${session.name}`);
      this.logger.info(`   ID: ${session.id}`);
      this.logger.info(`   URL: ${session.url}`);
      this.logger.info(`   Status: ${session.status}`);
      this.logger.info(`   Image: ${session.image}`);
      console.log(''); // Empty line between sessions
    }
    
    return { success: true, sessions };
  }

  async stopSession(sessionId) {
    this.logger.info(`Stopping session: ${sessionId}`);
    
    const sessions = await this.discoverSessions();
    
    // Find session by ID (partial match) or name
    const targetSession = sessions.find(s => 
      s.id.startsWith(sessionId) || 
      s.name.includes(sessionId) ||
      s.containerId.startsWith(sessionId)
    );
    
    if (!targetSession) {
      this.logger.error(`Session '${sessionId}' not found.`);
      this.logger.info('Available sessions:');
      for (const session of sessions) {
        this.logger.info(`  ${session.id}: ${session.name}`);
      }
      throw new Error(`Session '${sessionId}' not found`);
    }
    
    try {
      this.logger.info(`Stopping container: ${targetSession.name} (${targetSession.id})`);
      execSync(`docker stop ${targetSession.containerId}`, { stdio: 'inherit' });
      
      this.logger.info(`Removing container: ${targetSession.name} (${targetSession.id})`);
      execSync(`docker rm ${targetSession.containerId}`, { stdio: 'inherit' });
      
      // Try to remove the Docker image as well
      if (targetSession.image && !targetSession.image.includes('unknown')) {
        this.logger.info(`Removing Docker image: ${targetSession.image}`);
        try {
          execSync(`docker rmi ${targetSession.image}`, { stdio: 'inherit' });
        } catch (e) {
          this.logger.debug(`Docker image removal failed (may be in use): ${e.message}`);
        }
      }
      
      this.logger.success(`Session ${targetSession.name} stopped and cleaned up successfully`);
      return { success: true, session: targetSession };
      
    } catch (error) {
      this.logger.error(`Failed to stop session: ${error.message}`);
      throw error;
    }
  }

  async stopAllSessions() {
    this.logger.info('Stopping all FoundryVTT sessions...');
    
    const sessions = await this.discoverSessions();
    
    if (sessions.length === 0) {
      this.logger.info('No running sessions found.');
      return { success: true, stopped: [] };
    }
    
    const results = [];
    
    for (const session of sessions) {
      try {
        this.logger.info(`Stopping: ${session.name} (${session.id})`);
        await this.stopSession(session.id);
        results.push({ session, success: true });
      } catch (error) {
        this.logger.error(`Failed to stop ${session.name}: ${error.message}`);
        results.push({ session, success: false, error: error.message });
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    this.logger.info(`Cleanup complete: ${successful} stopped, ${failed} failed`);
    
    return { success: failed === 0, results };
  }

  async launch(options = {}) {
    const { versions = null, systems = null, daemon = false } = options;

    // Determine which versions to test
    const versionsToTest = versions || [this.config['foundry-versions'][0]]; // Default to first version
    const systemsToTest = systems || [this.config['foundry-systems'][0]]; // Default to first system

    this.logger.info(`Launching FoundryVTT ${versionsToTest[0]} with ${systemsToTest[0]} system...`);
    
    try {
      // Clean up any existing artifacts
      this.cleanArtifacts();

      // Create permutation object for bootstrap
      const permutation = {
        id: `${versionsToTest[0]}-${systemsToTest[0]}`,
        version: versionsToTest[0],
        system: systemsToTest[0],
        description: `${systemsToTest[0]} on Foundry VTT ${versionsToTest[0]}`
      };

      // Create session for testing
      const session = await this.bootstrap.createSession(permutation);
      this.logger.success(`FoundryVTT session created: ${session.name}`);
      this.logger.info(`Access URL: http://localhost:${session.port}`);
      this.logger.info(`Container ID: ${session.containerId || session.instanceId}`);
      this.logger.info('');
      this.logger.info('🎮 FoundryVTT is now running!');
      this.logger.info('📝 You can now test the Simulacrum module');
      this.logger.info('🌐 Open your browser and navigate to the URL above');
      this.logger.info('');

      if (daemon) {
        // Daemon mode: return immediately, don't wait for user input
        this.logger.info('🔄 Running in daemon mode');
        this.logger.info('📋 Use --list-sessions to see running sessions');
        this.logger.info('🛑 Use --stop <session-id> to stop this session');
        this.logger.info('🧹 Use --stop-all to stop all sessions');
        this.logger.info('');
        this.logger.success(`Daemon session started successfully!`);
        this.logger.info(`Session ID: ${session.containerId || session.instanceId}`);
        this.logger.info(`URL: http://localhost:${session.port}`);
        
        const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
        this.logger.success(`Session launched in ${totalTime}s`);
        
        // Return session info for potential use by calling code
        return {
          success: true,
          session: {
            id: session.containerId || session.instanceId,
            name: session.instanceId,
            port: session.port,
            url: `http://localhost:${session.port}`,
            containerId: session.containerId
          }
        };
      } else {
        // Interactive mode: wait for ESC key
        this.logger.info('⌨️  Press ESC key to stop and cleanup when done...');
        this.logger.info('💡 Tip: Use --daemon flag to run in background mode');

        // Wait for user to press ESC
        await this.waitForEscapeKey();

        this.logger.info('🧹 Cleaning up session...');
        await this.bootstrap.cleanup();
        
        const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
        this.logger.success(`Session completed in ${totalTime}s`);
        
        return { success: true };
      }

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
    systems: null,
    daemon: false,
    listSessions: false,
    stop: null,
    stopAll: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--daemon' || arg === '-d') {
      options.daemon = true;
    } else if (arg === '--list-sessions') {
      options.listSessions = true;
    } else if (arg === '--stop') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.stop = nextArg;
        i++; // Skip next argument as it's the value
      } else {
        throw new Error('--stop requires a session ID');
      }
    } else if (arg.startsWith('--stop=')) {
      options.stop = arg.split('=')[1];
      if (!options.stop) {
        throw new Error('--stop requires a session ID');
      }
    } else if (arg === '--stop-all') {
      options.stopAll = true;
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
    } else {
      throw new Error(`Unknown argument: ${arg}. Use --help for usage information.`);
    }
  }
  
  return options;
}

// Display help message
function showHelp() {
  console.log(`[FoundryVTT Launcher] 
FoundryVTT Testing Launcher with Daemon Support

Usage: node launch-foundry.js [options]

Launch Options:
  --help, -h              Show this help message
  --debug                 Enable verbose debug output (same as DEBUG=true)
  --versions, -v <list>   Override FoundryVTT version (defaults to first configured)
  --systems, -s <list>    Override game system (defaults to first configured)
  --daemon, -d            Run in background daemon mode (no interactive ESC wait)

Session Management:
  --list-sessions         List all running FoundryVTT sessions
  --stop <session-id>     Stop specific session by ID or container name
  --stop-all              Stop all running FoundryVTT sessions
  
Description:
  This launcher creates live FoundryVTT sessions using Docker containers
  for testing and development. It performs complete bootstrap setup including
  license acceptance, EULA handling, system installation, and world creation.
  
  Interactive Mode (default): Session runs until you press ESC key
  Daemon Mode (--daemon): Session runs in background, use --stop to cleanup
  
Examples:
  # Interactive mode (traditional usage)
  node launch-foundry.js -v v13 -s dnd5e   # Launch and wait for ESC
  
  # Daemon mode (AI/automation friendly)  
  node launch-foundry.js --daemon -v v13 -s dnd5e  # Launch in background
  node launch-foundry.js --list-sessions           # Show running sessions
  node launch-foundry.js --stop session-id         # Stop specific session
  node launch-foundry.js --stop-all                # Stop all sessions
  
  # Use with foundry-inspector
  node launch-foundry.js --daemon -v v13 -s dnd5e
  node tools/foundry-inspector.js --extract-schema "Actor"
  node launch-foundry.js --stop-all

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

    // Handle session management commands
    if (options.listSessions) {
      await launcher.listSessions();
      return;
    }

    if (options.stop) {
      await launcher.stopSession(options.stop);
      return;
    }

    if (options.stopAll) {
      await launcher.stopAllSessions();
      return;
    }

    // Validate launch options
    if (options.daemon && (options.stop || options.stopAll || options.listSessions)) {
      throw new Error('Cannot combine --daemon with session management commands');
    }

    // Launch FoundryVTT session
    const result = await launcher.launch({
      versions: options.versions,
      systems: options.systems,
      daemon: options.daemon
    });

    if (result && result.session && options.daemon) {
      // In daemon mode, output session info for potential script usage
      console.log(`SESSION_ID=${result.session.id}`);
      console.log(`SESSION_URL=${result.session.url}`);
      console.log(`SESSION_PORT=${result.session.port}`);
    }

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