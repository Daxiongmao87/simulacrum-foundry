#!/usr/bin/env node

/**
 * Commit message validation hook for Simulacrum project
 * 
 * This hook validates the actual commit message content including:
 * 1. GitHub issue reference (#N)
 * 2. Issue must be open
 * 3. Issue must have labels (NO LABELLESS ISSUES)
 * 4. Feature issues must have integration test changes
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Get GitHub issue details using gh CLI
 */
function getGitHubIssue(issueNumber) {
  try {
    const issueJson = execSync(`gh issue view ${issueNumber} --json title,body,labels,state`, { encoding: 'utf-8' });
    return JSON.parse(issueJson);
  } catch (error) {
    console.error(`❌ Failed to fetch GitHub issue #${issueNumber}: ${error.message}`);
    process.exit(1);
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
 * Get static guidance for test types
 */
function getTestTypeGuidance(testType) {
  const guidance = {
    unit: {
      why: "Unit tests verify individual functions work correctly in isolation. They catch bugs early, run fast, and ensure your code logic is solid.",
      example: "Test that your new function handles edge cases, error conditions, and expected inputs correctly.",
      template: "tests/unit/v13/sample.test.js",
      run: "npm run test:unit"
    }
  };
  return guidance[testType] || {};
}

/**
 * Detect required test types from GitHub issue content
 */
function detectTestRequirementsFromGitHubIssue(issue) {
  if (!issue) {
    return [];
  }
  
  const requiredTests = [];
  
  // First, check labels (most reliable indicator)
  if (issue.labels && Array.isArray(issue.labels)) {
    for (const label of issue.labels) {
      const labelName = label.name ? label.name.toLowerCase() : '';
      
      // Check for unit test labels
      if (labelName.match(/unit[\s-]?test(?:s|ing)?/gi)) {
        if (!requiredTests.includes('unit')) {
          requiredTests.push('unit');
        }
      }
    }
  }
  
  // Then check title and body with improved patterns (if we have them)
  if (issue.title || issue.body) {
    const content = ((issue.title || '') + ' ' + (issue.body || '')).toLowerCase();
    
    // Check for unit test requirements - improved pattern
    if (content.match(/unit[\s-]?test(?:s|ing)?/gi)) {
      if (!requiredTests.includes('unit')) {
        requiredTests.push('unit');
      }
    }
  }
  
  return requiredTests;
}

/**
 * Validate that staged files contain required test modifications
 */
function validateStagedTestFiles(requiredTestTypes, stagedFiles) {
  const missingTestTypes = [];
  
  for (const testType of requiredTestTypes) {
    if (testType === 'unit') {
      const hasTestFiles = stagedFiles.some(file => {
        const pattern = `tests/unit/`;
        return file.startsWith(pattern) && file.endsWith('.test.js');
      });
      
      if (!hasTestFiles) {
        missingTestTypes.push(testType);
      }
    }
  }
  
  return missingTestTypes;
}

/**
 * Check if issue is a feature issue based on labels
 */
function isFeatureIssue(issue) {
  const featureLabels = ['enhancement', 'feature', 'new feature', 'tool', 'story'];
  return issue.labels.some(label => 
    featureLabels.some(featureLabel => 
      label.name.toLowerCase().includes(featureLabel)
    )
  );
}

/**
 * Get list of changed files in this commit
 */
function getChangedFiles() {
  try {
    const changedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(file => file.length > 0);
    return changedFiles;
  } catch (error) {
    console.error('❌ Failed to get changed files:', error.message);
    process.exit(1);
  }
}

/**
 * Check if integration tests have been modified
 */
function hasIntegrationTestChanges(changedFiles) {
  return changedFiles.some(file => 
    file.startsWith('tests/integration/') && file.endsWith('.test.js')
  );
}

/**
 * Check if changes include feature implementation files
 */
function hasFeatureImplementationChanges(changedFiles) {
  const implementationPatterns = [
    'scripts/core/',
    'scripts/tools/',
    'scripts/chat/',
    'scripts/main.js',
    'scripts/settings.js'
  ];
  
  return changedFiles.some(file => 
    implementationPatterns.some(pattern => file.startsWith(pattern))
  );
}

/**
 * Validate integration test patterns and naming conventions
 */
function validateIntegrationTestPatterns(changedFiles) {
  const integrationTestFiles = changedFiles.filter(file => 
    file.startsWith('tests/integration/') && file.endsWith('.test.js')
  );
  
  const warnings = [];
  const errors = [];
  
  for (const testFile of integrationTestFiles) {
    const fileName = testFile.split('/').pop();
    
    // Check naming conventions
    if (!fileName.includes('-user-workflow.test.js') && 
        !fileName.includes('-api-integration.test.js')) {
      warnings.push(`${testFile}: Consider using naming convention '*-user-workflow.test.js' (Level 1) or '*-api-integration.test.js' (Level 2)`);
    }
    
    // Check for proper test type indicators
    if (fileName.includes('-user-workflow.test.js')) {
      console.log(`✅ Level 1 User Workflow Test detected: ${fileName}`);
    } else if (fileName.includes('-api-integration.test.js')) {
      console.log(`📋 Level 2 API Integration Test detected: ${fileName}`);
    } else {
      warnings.push(`${testFile}: Unclear test type - recommend '*-user-workflow.test.js' or '*-api-integration.test.js'`);
    }
  }
  
  return { warnings, errors };
}

/**
 * Read test file content to validate patterns (if file exists in staged changes)
 */
function validateIntegrationTestContent(changedFiles) {
  const integrationTestFiles = changedFiles.filter(file => 
    file.startsWith('tests/integration/') && file.endsWith('.test.js')
  );
  
  const warnings = [];
  const errors = [];
  
  for (const testFile of integrationTestFiles) {
    try {
      // Get staged content of the file
      const content = execSync(`git show :${testFile}`, { encoding: 'utf-8' });
      
      // Check for user workflow indicators
      const hasUserWorkflowPattern = content.includes('page.click(') || 
                                    content.includes('page.type(') || 
                                    content.includes('page.waitForSelector(');
      
      const hasDirectAPIPattern = content.includes('page.evaluate(') && 
                                 content.includes('game.simulacrum.');
      
      const hasTestMetadata = content.includes('export const testMetadata');
      const hasUserWorkflowFlag = content.includes('userWorkflow: true') || 
                                 content.includes('userWorkflow: false');
      
      // Validate Level 1 tests (user workflow)
      if (testFile.includes('-user-workflow.test.js')) {
        if (!hasUserWorkflowPattern) {
          errors.push(`${testFile}: Level 1 user workflow test should include UI interactions (page.click, page.type, etc.)`);
        }
        
        if (hasDirectAPIPattern && !hasUserWorkflowPattern) {
          errors.push(`${testFile}: Level 1 test should focus on user interactions, not direct API calls`);
        }
      }
      
      // Validate Level 2 tests (API integration)
      if (testFile.includes('-api-integration.test.js')) {
        if (hasUserWorkflowPattern && !hasDirectAPIPattern) {
          warnings.push(`${testFile}: Level 2 API test has UI interactions - consider if this should be Level 1 user workflow test`);
        }
      }
      
      // Check for required metadata
      if (!hasTestMetadata) {
        warnings.push(`${testFile}: Missing 'export const testMetadata' - see tests/docs/integration-testing-patterns.md`);
      }
      
      if (hasTestMetadata && !hasUserWorkflowFlag) {
        warnings.push(`${testFile}: Missing 'userWorkflow: true/false' in testMetadata`);
      }
      
      // Check for anti-patterns
      if (content.includes('aiService.sendMessage(') && hasUserWorkflowPattern) {
        warnings.push(`${testFile}: Mixing UI interactions with direct API calls - consider separating into Level 1 and Level 2 tests`);
      }
      
    } catch (error) {
      // File might be new or have other issues - skip content validation
      console.log(`⚠️  Could not validate content of ${testFile} (likely new file)`);
    }
  }
  
  return { warnings, errors };
}

/**
 * Main validation logic
 */
function validateCommitMessage() {
  console.log('🔍 Validating commit message...');
  
  // Read commit message from file passed as argument
  const commitMsgFile = process.argv[2];
  if (!commitMsgFile) {
    console.error('❌ No commit message file provided');
    process.exit(1);
  }
  
  const commitMessage = readFileSync(commitMsgFile, 'utf-8').trim();
  console.log(`📝 Commit message: "${commitMessage}"`);
  
  // 0. Check for banned content in commit message
  const bannedPatterns = [/claude/gi];
  for (const pattern of bannedPatterns) {
    if (pattern.test(commitMessage)) {
      console.error('❌ Banned content detected in commit message');
      process.exit(1);
    }
  }
  
  // 1. Check for GitHub issue reference
  const issueNumber = extractIssueNumber(commitMessage);
  if (!issueNumber) {
    console.error('❌ Commit message must reference a GitHub issue (e.g., "Fix validation bug (#123)")');
    console.error('💡 Use format: "Description of change (#issue-number)"');
    process.exit(1);
  }
  
  console.log(`🔗 Found GitHub issue reference: #${issueNumber}`);
  
  // 2. Fetch and validate GitHub issue
  const issue = getGitHubIssue(issueNumber);
  
  if (issue.state.toLowerCase() !== 'open') {
    console.error(`❌ GitHub issue #${issueNumber} is not open (state: ${issue.state})`);
    process.exit(1);
  }
  
  console.log(`📋 Issue: "${issue.title}" (${issue.state})`);
  
  // 3. MANDATORY: Check for GitHub issue labels  
  if (!issue.labels || issue.labels.length === 0) {
    console.error(`❌ GitHub issue #${issueNumber} has no labels`);
    console.error('💡 ALL issues must have at least one label for proper categorization');
    console.error('🏷️  Available labels: bug, enhancement, documentation, question, etc.');
    console.error('📋 Add labels using: gh issue edit ' + issueNumber + ' --add-label "label-name"');
    process.exit(1);
  }
  
  console.log(`🏷️  Issue labels: ${issue.labels.map(l => l.name).join(', ')}`);
  
  // 4. Get changed files for validation
  const changedFiles = getChangedFiles();
  console.log(`📁 Changed files: ${changedFiles.length} files`);
  
  // 5. Check GitHub issue-based test requirements
  console.log('🧪 Checking GitHub issue-based test requirements...');
  const requiredTestTypes = detectTestRequirementsFromGitHubIssue(issue);
  if (requiredTestTypes.length > 0) {
    console.log(`🧪 Detected required test types: ${requiredTestTypes.join(', ')}`);
    
    const missingTestTypes = validateStagedTestFiles(requiredTestTypes, changedFiles);
    console.log(`📁 Checking ${changedFiles.length} staged files for test modifications...`);
    
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

      // Add detailed guidance for each missing test type
      errorMessage += `\n\n📚 Test Implementation Guide:\n`;
      for (const testType of missingTestTypes) {
        const guide = getTestTypeGuidance(testType);
        const typeName = testType.charAt(0).toUpperCase() + testType.slice(1);
        
        // Discover available test version directories
        let whereInfo = '';
        try {
          const versionDirs = execSync(`ls tests/${testType}/ 2>/dev/null || echo ""`, { encoding: 'utf-8' }).trim();
          if (versionDirs) {
            const versions = versionDirs.split('\n').filter(v => v.trim());
            whereInfo = `tests/${testType}/${versions.join('/ or tests/' + testType + '/')}/`;
          } else {
            whereInfo = `tests/${testType}/<version>/`;
          }
        } catch (e) {
          whereInfo = `tests/${testType}/<version>/`;
        }
        
        errorMessage += `\n━━━ ${typeName} Tests ━━━`;
        errorMessage += `\n  WHY: ${guide.why}`;
        errorMessage += `\n  EXAMPLE: ${guide.example}`;
        errorMessage += `\n  WHERE: ${whereInfo}`;
        errorMessage += `\n  TEMPLATE: ${guide.template}`;
        errorMessage += `\n  NAMING: ${issueNumber.toString().padStart(3, '0')}-descriptive-name.test.js`;
        errorMessage += `\n  RUN: ${guide.run}`;
        errorMessage += `\n`;
      }

      errorMessage += `\n💡 Quick Start:`;
      errorMessage += `\n  1. Copy the template file for your test type`;
      errorMessage += `\n  2. Name it: ${issueNumber.toString().padStart(3, '0')}-descriptive-name.test.js`;
      errorMessage += `\n  3. Write tests for the changes you made`;
      errorMessage += `\n  4. Stage: git add tests/...`;
      errorMessage += `\n  5. Commit again`;
      errorMessage += `\n\n✅ After creating the required test files, stage them and commit again.`;
      
      console.error('');
      console.error('🚨 GITHUB ISSUE-BASED TEST REQUIREMENTS NOT MET - COMMIT BLOCKED! 🚨');
      console.error('');
      console.error(errorMessage);
      console.error('');
      process.exit(1);
    }
    
    console.log('✅ All required test types have corresponding staged test files');
  } else {
    console.log('⚠️ No test requirements found in GitHub issue content');
  }
  
  // 6. Validate integration test patterns
  const hasTestChanges = hasIntegrationTestChanges(changedFiles);
  if (hasTestChanges) {
    console.log('🧪 Validating integration test patterns...');
    
    // Validate naming conventions
    const patternValidation = validateIntegrationTestPatterns(changedFiles);
    
    // Validate test content
    const contentValidation = validateIntegrationTestContent(changedFiles);
    
    // Display warnings
    const allWarnings = [...patternValidation.warnings, ...contentValidation.warnings];
    if (allWarnings.length > 0) {
      console.log('\n⚠️  Integration Test Warnings:');
      allWarnings.forEach(warning => console.log(`   ${warning}`));
      console.log('\n💡 See tests/docs/integration-testing-patterns.md for best practices');
    }
    
    // Check for errors that block commit
    const allErrors = [...patternValidation.errors, ...contentValidation.errors];
    if (allErrors.length > 0) {
      console.error('\n❌ Integration Test Validation Errors:');
      allErrors.forEach(error => console.error(`   ${error}`));
      console.error('\n📚 Guidelines:');
      console.error('   • Level 1 (*-user-workflow.test.js): Test complete user interactions through UI');
      console.error('   • Level 2 (*-api-integration.test.js): Test component interactions via APIs');
      console.error('   • Include testMetadata with userWorkflow: true/false');
      console.error('   • See tests/docs/integration-testing-patterns.md');
      console.error('');
      process.exit(1);
    }
    
    if (allWarnings.length === 0 && allErrors.length === 0) {
      console.log('✅ Integration test patterns validated');
    }
  }

  // 7. Check for feature issue requirements
  if (isFeatureIssue(issue)) {
    console.log('🚀 Detected feature issue - checking integration test requirements...');
    
    const hasFeatureChanges = hasFeatureImplementationChanges(changedFiles);
    const hasTestChanges = hasIntegrationTestChanges(changedFiles);
    
    if (hasFeatureChanges && !hasTestChanges) {
      console.error('❌ Feature issue with implementation changes requires integration test updates');
      console.error('💡 Add or modify tests in tests/integration/ directory');
      console.error('📚 Prefer Level 1 user workflow tests (*-user-workflow.test.js) for new features');
      console.error(`📋 Issue labels: ${issue.labels.map(l => l.name).join(', ')}`);
      console.error('🔧 Changed implementation files:');
      changedFiles
        .filter(file => hasFeatureImplementationChanges([file]))
        .forEach(file => console.error(`     - ${file}`));
      process.exit(1);
    }
    
    if (hasTestChanges) {
      console.log('✅ Integration test changes detected for feature issue');
    }
  }
  
  console.log('✅ Commit message validation passed!');
  console.log(`🎉 Ready to commit changes for issue #${issueNumber}`);
}

// Execute validation
validateCommitMessage();