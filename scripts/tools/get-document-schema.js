import { Tool } from './tool-registry.js';
import { FoundrySchemaExtractor } from '../core/foundry-schema-extractor.js';

/**
 * Tool for extracting document schemas to help AI understand required fields.
 * This tool exposes the FoundrySchemaExtractor functionality to the AI service.
 */
export class GetDocumentSchemaTool extends Tool {
  constructor() {
    super(
      'get_document_schema',
      'Retrieves the schema for a specific document type to understand required fields and structure',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description:
              'Type of document to get schema for (e.g., Actor, Item, Scene, etc.)',
          },
        },
        required: ['documentType'],
      }
    );
  }

  async execute(params) {
    try {
      const { documentType } = params;

      // Extract schema using the existing FoundrySchemaExtractor
      const schema =
        await FoundrySchemaExtractor.getDocumentSchema(documentType);

      if (!schema) {
        return {
          success: false,
          error: {
            message: `No schema found for document type: ${documentType}`,
            code: 'SCHEMA_NOT_FOUND',
          },
        };
      }

      // Convert schema to a more readable format for AI
      const readableSchema = this.formatSchemaForAI(schema);

      return {
        success: true,
        result: {
          documentType,
          schema: readableSchema,
          fieldCount: Object.keys(readableSchema.fields || {}).length,
          // Note: rawSchema removed to prevent circular reference errors in JSON serialization
        },
      };
    } catch (error) {
      console.error(
        `Simulacrum | GetDocumentSchemaTool: Failed to get schema for ${params.documentType}:`,
        error
      );
      return {
        success: false,
        error: {
          message: `Failed to get schema for ${params.documentType}: ${error.message}`,
          code: 'SCHEMA_EXTRACTION_FAILED',
        },
      };
    }
  }

  /**
   * Formats a Foundry schema into a more readable format for AI consumption.
   * @param {Object} schema - The raw Foundry schema object
   * @returns {Object} Formatted schema with field descriptions
   */
  formatSchemaForAI(schema) {
    const formatted = {
      fields: {},
      summary: {
        totalFields: 0,
        requiredFields: [],
        optionalFields: [],
        imageFields: [],
      },
    };

    for (const [fieldName, field] of Object.entries(schema)) {
      try {
        const fieldInfo = {
          type: field.constructor.name,
          required: field.required || false,
          nullable: field.nullable || false,
          initial: field.initial,
        };

        // Detect image/file fields
        if (this.isImageField(fieldName, fieldInfo)) {
          fieldInfo.isImageField = true;
          formatted.summary.imageFields.push(fieldName);
        }

        // Add to appropriate lists
        if (fieldInfo.required) {
          formatted.summary.requiredFields.push(fieldName);
        } else {
          formatted.summary.optionalFields.push(fieldName);
        }

        formatted.fields[fieldName] = fieldInfo;
        formatted.summary.totalFields++;
      } catch (error) {
        console.warn(
          `Simulacrum | Error processing field ${fieldName}:`,
          error
        );
      }
    }

    return formatted;
  }

  /**
   * Determines if a field is likely an image/file field based on naming patterns.
   * @param {string} fieldName - The field name
   * @param {Object} fieldInfo - Field information
   * @returns {boolean} True if likely an image field
   */
  isImageField(fieldName, fieldInfo) {
    const imageFieldNames = [
      'img',
      'image',
      'avatar',
      'token',
      'texture',
      'icon',
      'portrait',
      'artwork',
      'background',
      'cover',
      'thumbnail',
    ];

    const fieldNameLower = fieldName.toLowerCase();
    return imageFieldNames.some((pattern) => fieldNameLower.includes(pattern));
  }

  /**
   * This tool provides read-only schema information, so no confirmation needed.
   * @returns {boolean} False - no confirmation needed
   */
  shouldConfirmExecute() {
    return false;
  }
}
