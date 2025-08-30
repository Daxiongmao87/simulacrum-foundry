/**
 * @file WorkflowEnforcer
 * @module simulacrum/core/workflow-enforcer
 * @description Enforces mandatory document creation workflow by tracking tool usage.
 */

/**
 * Enforces the mandatory 5-step document creation workflow.
 * Tracks which prerequisite tools have been used to prevent skipping steps.
 */
export class WorkflowEnforcer {
  constructor() {
    this.reset();
  }

  /**
   * Resets the workflow state for a new document creation session.
   */
  reset() {
    this.usedTools = new Set();
    this.currentDocumentType = null;
    this.hasSchema = false;
    this.hasImages = false;
    this.hasContext = false;
  }

  /**
   * Records that a tool has been used in the current workflow.
   * @param {string} toolName - The name of the tool that was used.
   * @param {object} params - The parameters passed to the tool.
   */
  recordToolUsage(toolName, params) {
    this.usedTools.add(toolName);

    switch (toolName) {
      case 'get_document_schema':
        this.hasSchema = true;
        this.currentDocumentType = params.documentType;
        break;
      case 'list_images':
        this.hasImages = true;
        break;
      case 'search_documents':
        this.hasContext = true;
        break;
    }
  }

  /**
   * Validates whether the create_document tool can be executed based on workflow compliance.
   * @param {object} params - The parameters for the create_document tool.
   * @returns {{isValid: boolean, errors: string[]}} - Validation result.
   */
  validateDocumentCreation(params) {
    const errors = [];

    // Check if documentType matches what was used in schema retrieval
    if (
      this.currentDocumentType &&
      params.documentType !== this.currentDocumentType
    ) {
      errors.push(
        `Document type mismatch: schema was retrieved for "${this.currentDocumentType}" but creating "${params.documentType}"`
      );
    }

    // Check workflow compliance
    if (!this.hasSchema) {
      errors.push(
        'WORKFLOW VIOLATION: Must use get_document_schema tool before creating documents'
      );
    }

    if (!this.hasImages) {
      errors.push(
        'WORKFLOW VIOLATION: Must use list_images tool to find valid image paths before creating documents'
      );
    }

    if (!this.hasContext) {
      errors.push(
        'WORKFLOW VIOLATION: Must use search_documents tool to research existing context before creating documents'
      );
    }

    // Validate parameter structure
    if (!params.documentType) {
      errors.push(
        'Parameter "documentType" is required and cannot be undefined'
      );
    }

    if (!params.data) {
      errors.push('Parameter "data" is required and cannot be undefined');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Gets the workflow completion status.
   * @returns {object} - Status of each workflow step.
   */
  getWorkflowStatus() {
    return {
      hasSchema: this.hasSchema,
      hasImages: this.hasImages,
      hasContext: this.hasContext,
      currentDocumentType: this.currentDocumentType,
      usedTools: Array.from(this.usedTools),
    };
  }
}
