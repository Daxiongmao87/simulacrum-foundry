/* eslint-disable complexity */
/**
 * Post-tool verification utilities
 * Handles automatic verification of tool operations like qwen-code
 */

import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { toolRegistry } from './tool-registry.js';

/**
 * Perform post-tool verification like qwen-code (auto-read after create/update)
 */
export async function performPostToolVerification(toolName, args, result, conversationManager) {
  // Only verify document operations that create or modify content
  if (!['create_document', 'update_document'].includes(toolName)) {
    return;
  }

  // Skip verification if result doesn't contain document info
  if (!result || (!result.id && !result.documentId)) {
    return;
  }

  try {
    // Extract document details for verification
    const documentType = args.documentType || result.documentType;
    const documentId = result.id || result.documentId || result._id;

    if (!documentType || !documentId) {
      return; // Can't verify without these details
    }

    // Auto-call read_document to verify the operation
    const verifyArgs = {
      documentType,
      id: documentId,
      process_label: 'Displaying document details',
      plan_label: 'Continuing conversation',
    };

    const verification = await toolRegistry.executeTool('read_document', verifyArgs);

    // Add verification result to conversation for model awareness
    if (verification?.result) {
      const verifyContent =
        verification.result.content ??
        verification.result.display ??
        JSON.stringify(verification.result);
      conversationManager.addMessage(
        'tool',
        `Verification: ${verifyContent}`,
        null,
        'verify_' + documentId
      );
    }
  } catch (verifyErr) {
    // Verification failure shouldn't break the main operation
    try {
      if (isDebugEnabled()) {
        createLogger('AIDiagnostics').info('verification failed', {
          toolName,
          error: verifyErr?.message,
        });
      }
    } catch (e) {
      /* ignore */
    }
  }
}
