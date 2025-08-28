#!/usr/bin/env node

/**
 * Commit message validation hook for Simulacrum project
 * 
 * This hook validates the commit message content for basic quality standards.
 */

import { readFileSync } from 'fs';

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
  
  // Check for banned content in commit message
  const bannedPatterns = [/claude/gi];
  for (const pattern of bannedPatterns) {
    if (pattern.test(commitMessage)) {
      console.error('❌ Banned content detected in commit message');
      process.exit(1);
    }
  }
  
  // Basic validation - ensure commit message is not empty
  if (!commitMessage || commitMessage.length < 3) {
    console.error('❌ Commit message too short - provide a meaningful description');
    process.exit(1);
  }
  
  console.log('✅ Commit message validation passed!');
  console.log('🎉 Ready to commit changes');
}

// Execute validation
validateCommitMessage();