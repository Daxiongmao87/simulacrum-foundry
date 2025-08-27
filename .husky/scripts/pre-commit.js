#!/usr/bin/env node

// CRITICAL: Pre-commit validation - BLOCKS commit if violations found
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { basename } from 'path';

console.log('🔒 CRITICAL: Scanning for sensitive data...');
console.log('⚠️  NOTE: Git submodules are completely ignored by all pre-commit checks');

const SENSITIVE_DATA_PATTERNS = [
  { pattern: /[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/g, description: 'FoundryVTT License Key' },
  { pattern: /(?:api[_-]?key|apikey)["\\s]*[:=]["\\s]*[a-zA-Z0-9_\\-]{16,}/gi, description: 'API Key' },
  { pattern: /sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/g, description: 'OpenAI API Key' },
  { pattern: /sk-ant-[a-zA-Z0-9\\-_]{95,}/g, description: 'Anthropic API Key' }
];

// 🚨 CLAUDE ATTRIBUTION DETECTION - BLOCKS SELF-PROMOTION
const CLAUDE_PATTERNS = [
  /🤖\s*Generated\s+with\s+\[Claude\s+Code\]/gi,
  /Generated\s+with\s+\[Claude\s+Code\]/gi,
  /claude\.ai\/code/gi,
  /Co-Authored-By:\s*Claude/gi,
  /Co-Authored-By:\s*.*@anthropic\.com/gi,
  /noreply@anthropic\.com/gi
];

/**
 * Detect staged test files for targeted test execution
 * @returns {Object} Object with arrays of staged integration and regression test files
 */
function getStagedTestFiles() {
  try {
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' }).trim().split('\n').filter(f => f.length > 0);
    
    return {
      integrationTests: stagedFiles.filter(file => 
        file.startsWith('tests/integration/') && file.endsWith('.test.js')
      ),
      regressionTests: stagedFiles.filter(file => 
        file.startsWith('tests/regression/') && file.endsWith('.test.js')  
      )
    };
  } catch (error) {
    console.warn('⚠️ Failed to detect staged test files:', error.message);
    return { integrationTests: [], regressionTests: [] };
  }
}



async function main() {
try {
  // 🚨 FIRST: Check commit message for Claude attribution
  console.log('🔍 Checking commit message for Claude attribution...');
  try {
    const commitMsg = execSync('git log -1 --pretty=format:%B', { encoding: 'utf-8' });
    
    for (const pattern of CLAUDE_PATTERNS) {
      if (pattern.test(commitMsg)) {
        console.error('');
        console.error('🚨 CLAUDE ATTRIBUTION DETECTED - COMMIT BLOCKED! 🚨');
        console.error('');
        console.error('📝 Commit Message:');
        console.error(commitMsg);
        console.error('');
        console.error('🚨 Remove Claude/Anthropic attribution before committing');
        console.error('💡 Just commit the code - no need to credit the AI tool');
        process.exit(1);
      }
    }
    console.log('✅ Commit message clean - no Claude attribution');
  } catch (e) {
    console.warn('⚠️  Could not read commit message, continuing...');
  }

  const changedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' }).trim().split('\n').filter(f => f.length > 0);
  
  // Filter out submodule files completely
  const submoduleFiles = changedFiles.filter(file => file.startsWith('scripts/fimlib/'));
  if (submoduleFiles.length > 0) {
    console.log(`⚠️  Ignoring ${submoduleFiles.length} submodule files: ${submoduleFiles.join(', ')}`);
  }
  
  const nonSubmoduleFiles = changedFiles.filter(file => !file.startsWith('scripts/fimlib/'));

  // 🚨 SECOND: Check staged files for Claude attribution
  console.log('🔍 Checking staged files for Claude attribution...');
  for (const file of nonSubmoduleFiles) {
    try {
      const stagedContent = execSync(`git diff --cached -- "${file}"`, { encoding: 'utf-8' });
      const addedLines = stagedContent.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.substring(1));
      
      // Check for Claude attribution in added lines
      for (const line of addedLines) {
        for (const pattern of CLAUDE_PATTERNS) {
          if (pattern.test(line)) {
            console.error('');
            console.error('🚨 CLAUDE ATTRIBUTION DETECTED IN FILE - COMMIT BLOCKED! 🚨');
            console.error('');
            console.error(`📁 File: ${file}`);
            console.error(`💥 Content: ${line.trim()}`);
            console.error('');
            console.error('🚨 Remove Claude/Anthropic attribution before committing');
            console.error('💡 Just write the code - no need to credit the AI tool');
            process.exit(1);
          }
        }
      }
      
      // Check for sensitive data in added lines
      for (const line of addedLines) {
        for (const {pattern, description} of SENSITIVE_DATA_PATTERNS) {
          const matches = line.match(pattern);
          if (matches) {
            console.error('');
            console.error('🚨 CRITICAL SECURITY VIOLATION: SENSITIVE DATA DETECTED! 🚨');
            console.error('');
            console.error(`📁 File: ${file}`);
            console.error(`🏷️  Type: ${description}`);
            console.error(`💥 Content: ${line.trim()}`);
            console.error(`🎯 Detected: ${matches.join(', ')}`);
            console.error('');
            console.error('🚨 COMMIT BLOCKED - REMOVE SENSITIVE DATA FIRST');
            console.error('💡 Use environment variables instead: ${FOUNDRY_LICENSE_KEY}');
            process.exit(1);
          }
        }
      }
    } catch (e) {
      // Skip unreadable files
    }
  }

  console.log('✅ No sensitive data or Claude attribution detected');
  
  // Run lint-staged if no violations found
  console.log('📋 Running code formatting...');
  execSync('npx lint-staged', { stdio: 'inherit' });
  
  // Check for console statement violations (warning only for now)
  // NOTE: Submodules are completely ignored by console validation
  console.log('🔍 Checking console statements (excluding submodules)...');
  try {
    execSync('npm run console:validate', { stdio: 'inherit' });
  } catch (e) {
    console.warn('⚠️  Console validation failed - consider fixing before next commit');
    console.warn('💡 Run "npm run console:prefix" to auto-fix prefix issues');
    // Don't block commit for now, just warn
  }
  
  // Run ESLint to check for errors (warnings won't block)
  // NOTE: Submodules are completely ignored by ESLint
  console.log('📋 Running ESLint checks (excluding submodules)...');
  try {
    execSync('npx eslint scripts/**/*.js tests/**/*.js tools/**/*.js --max-warnings 250', { stdio: 'inherit' });
  } catch (e) {
    if (e.status === 1) {
      console.error('❌ ESLint found errors that must be fixed');
      console.error('💡 Run "npm run lint:fix" to auto-fix some issues');
      process.exit(1);
    }
  }
  
  // 🧪 FOURTH: Run tests based on staged files
  console.log('🧪 Running tests...');
  
  const stagedTests = getStagedTestFiles();
  let testsFailed = false;
  
  // Always run ALL unit tests (fast, comprehensive coverage)
  console.log('📋 Running unit tests...');
  try {
    execSync('npm run test:unit', { stdio: 'inherit' });
    console.log('✅ Unit tests passed');
  } catch (error) {
    console.error('❌ Unit tests failed');
    testsFailed = true;
  }
  
  // Run ONLY staged integration tests (if any)
  if (stagedTests.integrationTests.length > 0) {
    console.log(`📋 Running ${stagedTests.integrationTests.length} staged integration test(s)...`);
    for (const testFile of stagedTests.integrationTests) {
      const testName = basename(testFile, '.test.js');
      console.log(`🧪 Running integration test: ${testName}`);
      try {
        execSync(`node tests/run-tests.js --integration-test ${testName}`, { stdio: 'inherit' });
        console.log(`✅ Integration test passed: ${testName}`);
      } catch (error) {
        console.error(`❌ Integration test failed: ${testName}`);
        testsFailed = true;
      }
    }
  } else {
    console.log('📋 No staged integration tests to run');
  }
  
  // Run ONLY staged regression tests (if any)  
  if (stagedTests.regressionTests.length > 0) {
    console.log(`📋 Running ${stagedTests.regressionTests.length} staged regression test(s)...`);
    for (const testFile of stagedTests.regressionTests) {
      const testName = basename(testFile, '.test.js');
      console.log(`🧪 Running regression test: ${testName}`);
      try {
        execSync(`node tests/run-tests.js --regression-test ${testName}`, { stdio: 'inherit' });
        console.log(`✅ Regression test passed: ${testName}`);
      } catch (error) {
        console.error(`❌ Regression test failed: ${testName}`);
        testsFailed = true;
      }
    }
  } else {
    console.log('📋 No staged regression tests to run');
  }
  
  // Block commit if any tests failed
  if (testsFailed) {
    console.error('');
    console.error('🚨 TESTS FAILED - COMMIT BLOCKED! 🚨');
    console.error('');
    console.error('Fix the failing tests before committing.');
    process.exit(1);
  }
  
  console.log('✅ All tests passed');
  
  // 🎉 ALL CHECKS PASSED - GitHub issue-based test validation complete
  console.log('✅ All pre-commit checks passed - ready to commit');
  
} catch (error) {
  console.error('❌ Pre-commit validation failed:', error.message);
  process.exit(1);
}
}

// Execute main function
main().catch(error => {
  console.error('❌ Pre-commit validation failed:', error.message);
  process.exit(1);
});