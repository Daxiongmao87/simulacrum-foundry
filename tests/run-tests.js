#!/usr/bin/env node

/**
 * @file tests/run-tests.js
 * @description Unit Test Runner for Simulacrum FoundryVTT Module
 * 
 * This runner executes Jest unit tests for the Simulacrum module.
 * It provides version-specific test execution and filtering capabilities.
 * 
 * For manual FoundryVTT testing, use launch-foundry.js instead.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEBUG_MODE = process.env.DEBUG === 'true' || process.argv.includes('--debug');

class TestLogger {
  constructor(debugMode = false) {
    this.debugMode = debugMode;
    if (this.debugMode) {
      console.log('[Test Runner] [Debug] 🐛 DEBUG MODE ENABLED - Verbose output enabled');
    }
  }

  success(message) {
    console.log(`[Test Runner] ✅ ${message}`);
  }

  warn(message) {
    console.warn(`[Test Runner] ⚠️ ${message}`);
  }

  error(message) {
    console.error(`[Test Runner] ❌ ${message}`);
  }

  info(message) {
    console.log(`[Test Runner] 📋 ${message}`);
  }

  debug(message) {
    if (this.debugMode) {
      console.log(`[Test Runner] [Debug] 🔍 ${message}`);
    }
  }
}

class UnitTestRunner {
  constructor() {
    this.config = null;
    this.logger = new TestLogger(DEBUG_MODE);
    this.startTime = Date.now();
  }

  async initialize() {
    this.logger.info('Initializing unit test runner...');
    
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
    } catch (error) {
      throw new Error(`Failed to load test configuration: ${error.message}`);
    }
  }

  async runUnitTests(options = {}) {
    const { versions = null, specificTest = null, listTests = false, coverage = false, coverageHtml = false } = options;

    // Determine which versions to test
    const versionsToTest = versions || this.config['foundry-versions'];
    this.logger.info(`Testing versions: ${versionsToTest.join(', ')}`);

    if (listTests) {
      this.listAvailableTests(versionsToTest);
      return { success: true, results: [] };
    }

    const results = [];
    let totalPassed = 0;
    let totalFailed = 0;

    for (const version of versionsToTest) {
      this.logger.info(`Running unit tests for FoundryVTT ${version}...`);
      
      const testDir = join(PROJECT_ROOT, 'tests', 'unit', version);
      if (!existsSync(testDir)) {
        this.logger.warn(`No unit tests found for version ${version} at ${testDir}`);
        continue;
      }

      const jestConfigPath = join(testDir, 'jest.config.js');
      if (!existsSync(jestConfigPath)) {
        this.logger.warn(`No Jest config found for version ${version} at ${jestConfigPath}`);
        continue;
      }

      let startTime = Date.now();
      try {
        let jestCommand = `node --experimental-vm-modules node_modules/.bin/jest --config ${jestConfigPath}`;
        
        if (specificTest) {
          // Look for test file matching the specific test name
          const testPattern = `${specificTest}.test.js`;
          jestCommand += ` --testNamePattern="${specificTest}" --testPathPattern="${testPattern}"`;
          this.logger.debug(`Running specific test: ${specificTest}`);
        }

        if (coverage) {
          jestCommand += ' --coverage';
          if (coverageHtml) {
            jestCommand += ' --coverageReporters=text --coverageReporters=html';
            this.logger.info(`Coverage HTML report will be saved to: coverage/lcov-report/index.html`);
          } else {
            jestCommand += ' --coverageReporters=text';
          }
        }

        if (DEBUG_MODE) {
          jestCommand += ' --verbose';
        }

        this.logger.debug(`Jest command: ${jestCommand}`);
        
        const output = execSync(jestCommand, { 
          encoding: 'utf-8', 
          stdio: 'inherit',
          cwd: PROJECT_ROOT 
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        this.logger.success(`Unit tests for ${version} completed in ${duration}s`);
        
        results.push({
          version,
          success: true,
          duration: parseFloat(duration),
          output: output || ''
        });
        totalPassed++;

      } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        this.logger.error(`Unit tests for ${version} failed after ${duration}s`);
        this.logger.debug(`Error: ${error.message}`);
        
        results.push({
          version,
          success: false,
          duration: parseFloat(duration),
          error: error.message,
          output: error.stdout || ''
        });
        totalFailed++;
      }
    }

    // Generate summary
    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const successRate = totalPassed + totalFailed > 0 
      ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1) 
      : '0.0';

    this.logger.info('');
    this.logger.info('📊 Unit Test Results Summary');
    this.logger.info('==========================');
    this.logger.info(`📋 Total Versions: ${totalPassed + totalFailed}`);
    if (totalPassed > 0) this.logger.success(`Passed: ${totalPassed}`);
    if (totalFailed > 0) this.logger.error(`Failed: ${totalFailed}`);
    this.logger.info(`⏱️ Duration: ${totalTime}s`);
    this.logger.info(`🎯 Success Rate: ${successRate}%`);
    this.logger.info('');

    if (totalFailed > 0) {
      this.logger.error('Unit testing failed!');
      return { success: false, results, summary: { totalPassed, totalFailed, successRate, totalTime } };
    } else {
      this.logger.success('Unit testing complete!');
      return { success: true, results, summary: { totalPassed, totalFailed, successRate, totalTime } };
    }
  }

  listAvailableTests(versions) {
    this.logger.info('📋 Available Unit Tests:');
    this.logger.info('========================');

    for (const version of versions) {
      const testDir = join(PROJECT_ROOT, 'tests', 'unit', version);
      if (!existsSync(testDir)) {
        this.logger.warn(`No tests found for version ${version}`);
        continue;
      }

      this.logger.info(`\n🔹 FoundryVTT ${version}:`);
      
      try {
        const testFiles = readdirSync(testDir)
          .filter(file => file.endsWith('.test.js'))
          .map(file => file.replace('.test.js', ''));

        if (testFiles.length === 0) {
          this.logger.warn(`  No test files found in ${testDir}`);
        } else {
          testFiles.forEach(testName => {
            this.logger.info(`  • ${testName}`);
          });
        }
      } catch (error) {
        this.logger.error(`  Error reading test directory: ${error.message}`);
      }
    }
    this.logger.info('');
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
    tests: null,
    listTests: false,
    coverage: false,
    coverageHtml: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--list-tests') {
      options.listTests = true;
    } else if (arg === '--versions' || arg === '-v') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.versions = nextArg.split(',').map(v => normalizeVersionToken(v));
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--versions=')) {
      options.versions = arg.split('=')[1].split(',').map(v => normalizeVersionToken(v));
    } else if (arg === '--tests' || arg === '-t') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        options.tests = nextArg.trim();
        i++; // Skip next argument as it's the value
      }
    } else if (arg.startsWith('--tests=')) {
      options.tests = arg.split('=')[1].trim();
    } else if (arg === '--unit') {
      // Keep --unit for backward compatibility, but it's now the default behavior
      // No-op since this runner only does unit tests
    } else if (arg === '--coverage' || arg === '-c') {
      options.coverage = true;
    } else if (arg === '--html') {
      options.coverageHtml = true;
      options.coverage = true; // HTML implies coverage
    }
  }
  
  return options;
}

// Display help message
function showHelp() {
  console.log(`[Test Runner] 
FoundryVTT Unit Test Runner

Usage: node run-tests.js [options]

Options:
  --help, -h              Show this help message
  --debug                 Enable verbose debug output (same as DEBUG=true)
  --versions, -v <list>   Override FoundryVTT versions (comma-separated)
  --tests, -t <name>      Run a specific unit test by name
  --list-tests            List available unit tests for selected versions
  
Description:
  This runner executes Jest unit tests for the Simulacrum FoundryVTT module.
  Tests are fast, isolated, and don't require Docker containers or game systems.
  The module is system-agnostic and unit tests verify core functionality only.
  
Examples:
  node run-tests.js                    # Run all unit tests
  node run-tests.js -v v13             # Run tests for FoundryVTT v13 only
  node run-tests.js -t logger          # Run specific test matching 'logger'
  node run-tests.js --list-tests       # Show available tests
  node run-tests.js --debug            # Run with verbose output
  node run-tests.js --coverage         # Run with coverage analysis
  node run-tests.js --coverage --html  # Run with HTML coverage report

For manual system-agnostic testing with live FoundryVTT + game systems:
  node launch-foundry.js -s dnd5e      # Test against D&D 5e system
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

    const runner = new UnitTestRunner();
    await runner.initialize();

    const result = await runner.runUnitTests({
      versions: options.versions,
      specificTest: options.tests,
      listTests: options.listTests,
      coverage: options.coverage,
      coverageHtml: options.coverageHtml
    });

    if (!result.success) {
      process.exit(1);
    }

  } catch (error) {
    console.error(`[Test Runner] ❌ Fatal error: ${error.message}`);
    if (DEBUG_MODE) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`[Test Runner] ❌ Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

export { UnitTestRunner, parseArgs };