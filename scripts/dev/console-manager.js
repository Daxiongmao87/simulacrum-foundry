#!/usr/bin/env node

/**
 * Console Manager for Simulacrum Module
 *
 * This script helps manage console output in the codebase:
 * - Finds all console statements
 * - Validates prefixes
 * - Can strip debug logs for production
 * - Can add required prefixes
 *
 * Usage:
 *   node scripts/dev/console-manager.js [command] [options]
 *
 * Commands:
 *   audit    - List all console statements by type
 *   clean    - Remove non-error/warning console statements
 *   prefix   - Add "Simulacrum |" prefix to unprefixed logs
 *   validate - Check all console logs meet standards
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { relative } from 'path';

const VALID_PREFIXES = [
  'Simulacrum |', // Main module prefix
  'Simulacrum | [Debug] ', // Debug logs for main module
  'Simulacrum | Test Runner - ', // Test runner script prefix
  'Simulacrum | Test Runner [Debug] - ', // Debug logs for test runner
  'Simulacrum | Integration Test - ', // Integration test prefix
  'Simulacrum | Integration Test [Debug] - ', // Debug logs for integration tests
];
const DEBUG_MODE = process.env.DEBUG === 'true';

/**
 * Find all JavaScript files in the project
 */
async function findJavaScriptFiles() {
  const files = await glob('scripts/**/*.js', {
    ignore: [
      'scripts/fimlib/**/*', // Submodule
      'scripts/dev/**/*', // Dev tools
      'node_modules/**/*',
    ],
  });
  return files;
}

/**
 * Extract console statements from a file
 */
function extractConsoleStatements(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const statements = [];

  // First pass: find console statements and their line ranges
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const consoleMatch = line.match(
      /console\.(log|warn|error|debug|info|trace)\s*\(/
    );

    if (consoleMatch) {
      const type = consoleMatch[1];
      const lineNumber = i + 1;

      // Find the end of this console statement (look for closing parenthesis)
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

      // Extract the full console statement content
      const fullContent = lines.slice(i, endLine + 1).join('\n');

      // Try to extract the message if it's a simple string
      const messageMatch = fullContent.match(
        /console\.\w+\s*\(\s*['"`]([^'"`]*)/
      );
      const message = messageMatch ? messageMatch[1] : '';

      // Check if it has a valid prefix
      const hasValidPrefix = VALID_PREFIXES.some((prefix) =>
        message.startsWith(prefix)
      );

      statements.push({
        file: filePath,
        line: lineNumber,
        type,
        message,
        hasValidPrefix,
        fullLine: fullContent.trim(),
      });

      // Skip the lines we've already processed
      i = endLine;
    }
  }

  return statements;
}

/**
 * Audit command - list all console statements
 */
async function auditConsoleStatements() {
  console.log('🔍 Auditing console statements...\n');

  const files = await findJavaScriptFiles();
  const allStatements = [];

  for (const file of files) {
    const statements = extractConsoleStatements(file);
    allStatements.push(...statements);
  }

  // Group by type
  const byType = {
    log: [],
    warn: [],
    error: [],
    debug: [],
    info: [],
    trace: [],
  };

  allStatements.forEach((stmt) => {
    if (byType[stmt.type]) {
      byType[stmt.type].push(stmt);
    }
  });

  // Report
  console.log('📊 Console Statement Summary:');
  console.log('================================');

  for (const [type, statements] of Object.entries(byType)) {
    if (statements.length > 0) {
      console.log(`\n${type.toUpperCase()}: ${statements.length} statements`);

      const withoutPrefix = statements.filter(
        (s) => !s.hasValidPrefix && type === 'log'
      );
      if (withoutPrefix.length > 0) {
        console.log(`  ⚠️  ${withoutPrefix.length} without valid prefix`);
        if (DEBUG_MODE) {
          withoutPrefix.slice(0, 5).forEach((stmt) => {
            console.log(
              `     ${relative(process.cwd(), stmt.file)}:${stmt.line}`
            );
          });
          if (withoutPrefix.length > 5) {
            console.log(`     ... and ${withoutPrefix.length - 5} more`);
          }
        }
      }
    }
  }

  console.log('\n================================');
  console.log(`Total: ${allStatements.length} console statements`);

  const unprefixedLogs = allStatements.filter(
    (s) => s.type === 'log' && !s.hasValidPrefix
  );

  if (unprefixedLogs.length > 0) {
    console.log(
      `\n⚠️  ${unprefixedLogs.length} console.log statements need prefixes`
    );
    console.log(
      'Run with --fix or use the "prefix" command to add them automatically'
    );
  }

  return allStatements;
}

/**
 * Clean command - remove debug console statements
 */
async function cleanConsoleStatements() {
  console.log('🧹 Cleaning debug console statements...\n');

  const files = await findJavaScriptFiles();
  let totalRemoved = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const newLines = [];
    let removedInFile = 0;

    lines.forEach((line, _index) => {
      // Remove console.log and console.debug statements
      if (line.match(/console\.(log|debug)\s*\(/)) {
        removedInFile++;
        totalRemoved++;
        // Add comment about removal if in debug mode
        if (DEBUG_MODE) {
          newLines.push(`// [REMOVED] ${line.trim()}`);
        }
      } else {
        newLines.push(line);
      }
    });

    if (removedInFile > 0) {
      writeFileSync(file, newLines.join('\n'));
      console.log(
        `  ✅ Removed ${removedInFile} statements from ${relative(process.cwd(), file)}`
      );
    }
  }

  console.log(`\n✨ Removed ${totalRemoved} debug statements total`);
}

/**
 * Prefix command - add required prefixes to console.log statements
 */
async function addPrefixes() {
  console.log('🏷️  Adding prefixes to console.log statements...\n');

  const files = await findJavaScriptFiles();
  let totalFixed = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const newLines = [];
    let fixedInFile = 0;

    lines.forEach((line) => {
      let newLine = line;

      // Match console.log with a string literal
      const match = line.match(/console\.log\s*\(\s*(['"`])([^'"`]*)\1/);
      if (match) {
        const quote = match[1];
        const message = match[2];

        // Check if it needs a prefix
        const hasPrefix = VALID_PREFIXES.some((prefix) =>
          message.startsWith(prefix)
        );

        if (!hasPrefix) {
          // Add "Simulacrum |" prefix
          const newMessage = `Simulacrum | ${message}`;
          newLine = line.replace(
            /console\.log\s*\(\s*(['"`])([^'"`]*)\1/,
            `console.log(${quote}${newMessage}${quote}`
          );
          fixedInFile++;
          totalFixed++;
        }
      }

      newLines.push(newLine);
    });

    if (fixedInFile > 0) {
      writeFileSync(file, newLines.join('\n'));
      console.log(
        `  ✅ Fixed ${fixedInFile} statements in ${relative(process.cwd(), file)}`
      );
    }
  }

  console.log(`\n✨ Added prefixes to ${totalFixed} statements`);
}

/**
 * Validate command - check all console statements meet standards
 */
async function validateConsoleStatements() {
  console.log('✓ Validating console statements...\n');

  const statements = await auditConsoleStatements();

  const issues = [];

  // Check for unprefixed logs
  const unprefixedLogs = statements.filter(
    (s) => s.type === 'log' && !s.hasValidPrefix
  );

  if (unprefixedLogs.length > 0) {
    issues.push(
      `${unprefixedLogs.length} console.log statements missing required prefix`
    );
  }

  // Check for debug statements in production
  const debugStatements = statements.filter((s) => s.type === 'debug');
  if (debugStatements.length > 0) {
    issues.push(
      `${debugStatements.length} console.debug statements should be removed for production`
    );
  }

  // Report
  if (issues.length > 0) {
    console.log('\n❌ Validation Failed:');
    issues.forEach((issue) => console.log(`  - ${issue}`));
    process.exit(1);
  } else {
    console.log('\n✅ All console statements meet standards!');
  }
}

// Main CLI handler
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'audit':
      await auditConsoleStatements();
      break;
    case 'clean':
      await cleanConsoleStatements();
      break;
    case 'prefix':
      await addPrefixes();
      break;
    case 'validate':
      await validateConsoleStatements();
      break;
    default:
      console.log('Console Manager for Simulacrum Module\n');
      console.log('Usage: node scripts/dev/console-manager.js [command]\n');
      console.log('Commands:');
      console.log('  audit    - List all console statements by type');
      console.log('  clean    - Remove non-error/warning console statements');
      console.log('  prefix   - Add "Simulacrum |" prefix to unprefixed logs');
      console.log('  validate - Check all console logs meet standards\n');
      console.log('Set DEBUG=true for verbose output');
  }
}

main().catch(console.error);
