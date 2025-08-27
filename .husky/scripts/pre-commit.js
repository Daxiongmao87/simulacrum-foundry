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

/**
 * Extract GitHub issue number from commit message
 */
function extractIssueNumber(commitMessage) {
  const issueMatch = commitMessage.match(/#(\d+)/);
  return issueMatch ? parseInt(issueMatch[1]) : null;
}

/**
 * Get GitHub issue details using gh CLI
 */
function getGitHubIssue(issueNumber) {
  try {
    const issueJson = execSync(`gh issue view ${issueNumber} --json title,body,labels,state`, { encoding: 'utf-8' });
    return JSON.parse(issueJson);
  } catch (error) {
    console.warn(`⚠️ Failed to fetch GitHub issue #${issueNumber}: ${error.message}`);
    return null;
  }
}

/**
 * Get commit message from git
 */
function getCommitMessage() {
  try {
    // Try to get commit message from git log (most recent commit being prepared)
    const commitMsg = execSync('git log -1 --pretty=format:%B 2>/dev/null', { encoding: 'utf-8' });
    return commitMsg || null;
  } catch (e) {
    // If no commits exist yet, try to read from .git/COMMIT_EDITMSG
    try {
      const msgContent = execSync('cat .git/COMMIT_EDITMSG 2>/dev/null', { encoding: 'utf-8' });
      return msgContent.trim() || null;
    } catch (e2) {
      return null;
    }
  }
}

/**
 * Detect required test types from GitHub issue content
 */
function detectTestRequirementsFromGitHubIssue(issue) {
  if (!issue || !issue.title || !issue.body) {
    return [];
  }
  
  const content = (issue.title + ' ' + issue.body).toLowerCase();
  const requiredTests = [];
  
  // Check for unit test requirements
  if (content.match(/unit\s+test/gi)) {
    requiredTests.push('unit');
  }
  
  // Check for integration test requirements  
  if (content.match(/integration\s+test/gi)) {
    requiredTests.push('integration');
  }
  
  // Check for regression test requirements
  if (content.match(/regression\s+test/gi)) {
    requiredTests.push('regression');
  }
  
  return requiredTests;
}

/**
 * Validate that staged files contain required test modifications
 */
function validateStagedTestFiles(requiredTestTypes, stagedFiles) {
  const missingTestTypes = [];
  
  for (const testType of requiredTestTypes) {
    const hasTestFiles = stagedFiles.some(file => {
      const pattern = `tests/${testType}/`;
      return file.startsWith(pattern) && file.endsWith('.test.js');
    });
    
    if (!hasTestFiles) {
      missingTestTypes.push(testType);
    }
  }
  
  return missingTestTypes;
}

/**
 * Validate test requirements from GitHub issue
 */
async function validateTestRequirementsFromGitHubIssue() {
  // Get commit message to extract issue number
  const commitMessage = getCommitMessage();
  if (!commitMessage) {
    return {
      passed: true,
      skipped: true,
      reason: 'No commit message available'
    };
  }
  
  // Extract GitHub issue number
  const issueNumber = extractIssueNumber(commitMessage);
  if (!issueNumber) {
    return {
      passed: true,
      skipped: true,  
      reason: 'No GitHub issue reference found in commit message'
    };
  }
  
  console.log(`🔗 Found GitHub issue reference: #${issueNumber}`);
  
  // Fetch GitHub issue
  const issue = getGitHubIssue(issueNumber);
  if (!issue) {
    return {
      passed: true,
      skipped: true,
      reason: `Could not fetch GitHub issue #${issueNumber}`
    };
  }
  
  console.log(`📋 Analyzing issue: "${issue.title}"`);
  
  // Detect required test types from issue content
  const requiredTestTypes = detectTestRequirementsFromGitHubIssue(issue);
  if (requiredTestTypes.length === 0) {
    return {
      passed: true,
      skipped: true,
      reason: 'No test requirements found in GitHub issue content'
    };
  }
  
  console.log(`🧪 Detected required test types: ${requiredTestTypes.join(', ')}`);
  
  // Get staged files
  const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(f => f.length > 0);
    
  console.log(`📁 Checking ${stagedFiles.length} staged files for test modifications...`);
  
  // Validate staged files contain required test modifications
  const missingTestTypes = validateStagedTestFiles(requiredTestTypes, stagedFiles);
  
  if (missingTestTypes.length > 0) {
    // Get the repo URL for issue link
    let repoUrl = '';
    try {
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
      repoUrl = remoteUrl.replace(/.*github\.com[:/]/, '').replace(/\.git$/, '');
    } catch (e) {
      repoUrl = 'your-repo';
    }
    
    let errorMessage = `GitHub issue #${issueNumber} requires the following test types, but no matching test file modifications were found in staged files:`;
    errorMessage += `\n\n🚨 Missing test types: ${missingTestTypes.join(', ')}`;
    errorMessage += `\n\n📋 Required by issue: "${issue.title}"`;
    errorMessage += `\n🔗 Issue URL: https://github.com/${repoUrl}/issues/${issueNumber}`;
    errorMessage += `\n\n📁 Please create or modify test files in:`;
    
    // Dynamically discover available test version directories for missing types
    for (const testType of missingTestTypes) {
      try {
        const versionDirs = execSync(`ls tests/${testType}/ 2>/dev/null || echo ""`, { encoding: 'utf-8' }).trim();
        if (versionDirs) {
          const versions = versionDirs.split('\n').filter(v => v.trim());
          errorMessage += `\n  • ${testType.charAt(0).toUpperCase() + testType.slice(1)}: tests/${testType}/${versions.join('/ or tests/' + testType + '/')}/`;
        } else {
          errorMessage += `\n  • ${testType.charAt(0).toUpperCase() + testType.slice(1)}: tests/${testType}/<version>/`;
        }
      } catch (e) {
        errorMessage += `\n  • ${testType.charAt(0).toUpperCase() + testType.slice(1)}: tests/${testType}/<version>/`;
      }
    }
    
    errorMessage += `\n\n✅ After creating the required test files, stage them and commit again.`;
    
    return {
      passed: false,
      errorMessage
    };
  }
  
  console.log(`✅ All required test types have corresponding staged test files`);
  return {
    passed: true
  };
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
  
  // 🧪 THIRD: Check GitHub issue-based test requirements
  console.log('🧪 Checking GitHub issue-based test requirements...');
  const testValidationResult = await validateTestRequirementsFromGitHubIssue();
  if (!testValidationResult.passed) {
    console.error('');
    console.error('🚨 GITHUB ISSUE-BASED TEST REQUIREMENTS NOT MET - COMMIT BLOCKED! 🚨');
    console.error('');
    console.error(testValidationResult.errorMessage);
    console.error('');
    process.exit(1);
  } else if (testValidationResult.skipped) {
    console.log('⚠️ Test requirement validation skipped:', testValidationResult.reason);
  } else {
    console.log('✅ GitHub issue-based test requirements satisfied');
  }
  
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