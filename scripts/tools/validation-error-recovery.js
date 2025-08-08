import { FoundrySchemaExtractor } from "../core/foundry-schema-extractor.js";

/**
 * Handles AI retry when document validation fails.
 * Extracts schema context, builds a detailed prompt, and analyzes error patterns.
 */
export class ValidationErrorRecovery {
  /**
   * @param {Object} aiService - The AI service instance used to reprompt the AI.
   */
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Builds a prompt for the AI to correct invalid document data.
   * @param {string} errorMessage - The validation error message.
   * @param {Object} originalData - The data that failed validation.
   * @param {string} documentType - The type of document being created/updated.
   * @returns {Promise<string>} The prompt string.
   */
  async buildValidationErrorPrompt(errorMessage, originalData, documentType) {
    const schema = await FoundrySchemaExtractor.getDocumentSchema(documentType);
    const formattedSchema = this.formatSchemaForAI(schema);
    const errorAnalysis = this.analyzeErrorPatterns(errorMessage, schema);

    const prompt = `You attempted to create or update a ${documentType} document but the data failed validation.

Error: ${errorMessage}

Original data: ${JSON.stringify(originalData, null, 2)}

Document schema: ${formattedSchema}

${errorAnalysis}

Please provide corrected data that satisfies the schema and explain the changes you made.`;
    return prompt;
  }

  /**
   * Formats a JSON schema into a human‑readable string for AI consumption.
   * @param {Object|null} schema - The JSON schema object.
   * @returns {string}
   */
  formatSchemaForAI(schema) {
    if (!schema) return 'Schema could not be retrieved.';
    
    // Handle FoundryVTT schema objects which have circular references
    const simplified = {};
    for (const [key, field] of Object.entries(schema)) {
      simplified[key] = {
        type: field.constructor.name,
        required: field.required,
        nullable: field.nullable
      };
    }
    
    return JSON.stringify(simplified, null, 2);
  }

  /**
   * Analyzes common validation error patterns to give the AI guidance.
   * @param {string} errorMessage
   * @param {Object|null} schema
   * @returns {string}
   */
  analyzeErrorPatterns(errorMessage, schema) {
    // Basic pattern matching – can be expanded later.
    if (!errorMessage) return '';
    const patterns = [];
    if (/required/.test(errorMessage)) {
      patterns.push('Missing required field(s). Ensure all required properties are present.');
    }
    if (/type/.test(errorMessage)) {
      patterns.push('Field type mismatch. Verify that each field matches the expected type.');
    }
    if (/enum/.test(errorMessage)) {
      patterns.push('Invalid enum value. Use one of the allowed values.');
    }
    if (patterns.length === 0) {
      patterns.push('Review the schema and data for any discrepancies.');
    }
    return patterns.join('\n');
  }
}