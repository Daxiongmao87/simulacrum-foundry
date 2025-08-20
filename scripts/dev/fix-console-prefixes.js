#!/usr/bin/env node

/**
 * Console Prefix Fixer for Simulacrum Project
 *
 * This script systematically fixes all console.log statements to use the correct
 * domain-specific prefixes according to the file location and purpose.
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { relative } from 'path';

// Domain-specific prefix mapping
const DOMAIN_PREFIXES = {
  // Test runner files
  'tests/run-tests.js': 'Simulacrum | Test Runner - ',
  'tests/helpers/': 'Simulacrum | Test Runner - ',

  // Integration test files
  'tests/integration/': 'Simulacrum | Integration Test - ',

  // Main module files
  'scripts/core/': 'Simulacrum | ',
  'scripts/tools/': 'Simulacrum | ',
  'scripts/chat/': 'Simulacrum | ',
  'scripts/settings/': 'Simulacrum | ',
  'scripts/ui/': 'Simulacrum | ',
  'scripts/main.js': 'Simulacrum | ',
  'scripts/settings.js': 'Simulacrum | ',
  'scripts/error-handling.js': 'Simulacrum | ',

  // Tool files
  'tools/': 'Simulacrum | Tools - ',

  // Dev tools (keep as-is)
  'scripts/dev/': null,
};

// Debug prefix for debug logs
const DEBUG_PREFIX = 'Simulacrum | [Debug] ';

/**
 * Determine the correct prefix for a file
 */
function getPrefixForFile(filePath) {
  for (const [pattern, prefix] of Object.entries(DOMAIN_PREFIXES)) {
    if (filePath.startsWith(pattern)) {
      return prefix;
    }
  }

  // Default to main module prefix
  return 'Simulacrum | ';
}

/**
 * Check if a console.log statement is a debug statement
 */
function isDebugStatement(content) {
  const debugKeywords = [
    'debug',
    'Debug',
    'DEBUG',
    'verbose',
    'Verbose',
    'VERBOSE',
    'trace',
    'Trace',
    'TRACE',
    'development',
    'Development',
    'DEVELOPMENT',
    'dev',
    'Dev',
    'DEV',
  ];

  return debugKeywords.some((keyword) => content.includes(keyword));
}

/**
 * Fix console.log prefixes in a file
 */
function fixFilePrefixes(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const newLines = [];
  let fixedCount = 0;

  const basePrefix = getPrefixForFile(filePath);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip dev tool files
    if (basePrefix === null) {
      newLines.push(line);
      continue;
    }

    // Check if this line starts a console.log statement
    const consoleMatch = line.match(/console\.log\s*\(/);
    if (consoleMatch) {
      // Find the end of this console statement
      let endLine = i;
      let openParens = 0;
      let inString = false;
      let stringChar = '';

      for (let j = i; j < lines.length; j++) {
        const currentLine = lines[j];
        for (let k = 0; k < currentLine.length; k++) {
          const char = currentLine[k];

          if (!inString && (char === '"' || char === "'" || char === '`')) {
            inString = true;
            stringChar = char;
          } else if (inString && char === stringChar) {
            inString = false;
          } else if (!inString && char === '(') {
            openParens++;
          } else if (!inString && char === ')') {
            openParens--;
            if (openParens === 0) {
              endLine = j;
              break;
            }
          }
        }
        if (openParens === 0) {
          break;
        }
      }

      // Extract the full console statement
      const fullContent = lines.slice(i, endLine + 1).join('\n');

      // Check if it's a debug statement
      const isDebug = isDebugStatement(fullContent);
      const prefix = isDebug ? DEBUG_PREFIX : basePrefix;

      // Check if it already has a valid prefix
      const hasValidPrefix = fullContent.includes('Simulacrum |');

      if (!hasValidPrefix) {
        // Fix the first line to add the prefix
        const messageMatch = line.match(/console\.log\s*\(\s*(['"`])([^'"`]*)/);
        if (messageMatch) {
          const quote = messageMatch[1];
          const message = messageMatch[2];
          const newMessage = `${prefix}${message}`;
          line = line.replace(
            /console\.log\s*\(\s*(['"`])([^'"`]*)/,
            `console.log(${quote}${newMessage}`
          );
          fixedCount++;
        }
      }

      // Add all lines of the console statement
      for (let j = i; j <= endLine; j++) {
        if (j === i) {
          newLines.push(line);
        } else {
          newLines.push(lines[j]);
        }
      }

      // Skip the lines we've already processed
      i = endLine;
    } else {
      newLines.push(line);
    }
  }

  if (fixedCount > 0) {
    writeFileSync(filePath, newLines.join('\n'));
    console.log(
      `✅ Fixed ${fixedCount} console.log statements in ${relative(process.cwd(), filePath)}`
    );
  }

  return fixedCount;
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Fixing console.log prefixes across the codebase...\n');

  // Get all JavaScript files
  const files = await glob('{scripts,tests,tools}/**/*.js', {
    ignore: [
      'scripts/fimlib/**/*', // Git submodule - completely ignored
      'scripts/dev/**/*', // Dev tools - skip for now
      'node_modules/**/*',
    ],
  });

  let totalFixed = 0;

  for (const file of files) {
    const fixed = fixFilePrefixes(file);
    totalFixed += fixed;
  }

  console.log(`\n✨ Fixed ${totalFixed} console.log statements total`);
  console.log(
    '💡 Run "npm run console:validate" to verify all prefixes are correct'
  );
}

// Run the script
main().catch(console.error);
