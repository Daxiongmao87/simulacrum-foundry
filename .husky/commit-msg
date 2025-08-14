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
    const issueJson = execSync(`gh issue view ${issueNumber} --json title,labels,state`, { encoding: 'utf-8' });
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
  
  // 4. Check for feature issue requirements
  const changedFiles = getChangedFiles();
  console.log(`📁 Changed files: ${changedFiles.length} files`);
  
  if (isFeatureIssue(issue)) {
    console.log('🚀 Detected feature issue - checking integration test requirements...');
    
    const hasFeatureChanges = hasFeatureImplementationChanges(changedFiles);
    const hasTestChanges = hasIntegrationTestChanges(changedFiles);
    
    if (hasFeatureChanges && !hasTestChanges) {
      console.error('❌ Feature issue with implementation changes requires integration test updates');
      console.error('💡 Add or modify tests in tests/integration/ directory');
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