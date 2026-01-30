/**
 * Document Update Tool - Update documents of any type supported by current system
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';
import { ValidationErrorHandler } from '../utils/validation-errors.js';
import { createLogger, isDebugEnabled } from '../utils/logger.js';
import { DocumentUpdateLogic } from './document-update-logic.js';
import { ToolValidationError } from '../utils/tool-validation-error.js';
import { documentReadRegistry } from '../utils/document-read-registry.js';

class DocumentUpdateTool extends BaseTool {
  /**
   * Validate that the document has been read before modification
   * @param {string} documentType - Document type
   * @param {string} documentId - Document ID
   * @throws {Error} If document not read or stale
   */
  async #enforceReadBeforeModify(documentType, documentId, pack) {
    const opts = { includeEmbedded: true };
    if (pack) opts.pack = pack;
    const currentDoc = await DocumentAPI.getDocument(documentType, documentId, opts);
    if (!currentDoc) {
      const error = new Error(`Document @UUID[${documentType}.${documentId}] not found`);
      error.code = 'DOCUMENT_NOT_FOUND';
      throw error;
    }
    const currentData = currentDoc?.toObject?.() ?? currentDoc;
    documentReadRegistry.requireReadForModification(documentType, documentId, currentData);
  }

  constructor() {
    super(
      'update_document',
      'Update documents of any type supported by current system.',
      {
        type: 'object',
        properties: {
          documentType: {
            type: 'string',
            description: 'The type/class of document (Actor, Item, JournalEntry, etc.)',
          },
          documentId: {
            type: 'string',
            description: 'The ID of the document to update',
          },
          updates: {
            type: 'object',
            description: 'Object key/value document data to merge-update (dot notation supported)',
            additionalProperties: true,
          },
          operations: {
            type: 'array',
            description: 'Ordered list of operations for arrays/embedded collections',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['insert', 'replace', 'delete'] },
                path: { type: 'string', description: 'Path to array or embedded collection' },
                index: { type: 'integer', description: 'Index for array operations' },
                id: { type: 'string', description: 'ID for embedded collection operations' },
                value: {
                  type: 'object',
                  description: 'Value to insert/replace (not needed for delete)',
                },
              },
              required: ['action', 'path'],
            },
          },
          pack: {
            type: 'string',
            description: 'Compendium Pack ID if updating in a compendium (e.g. "simulacrum.simulacrum-tools")',
          },
        },
        required: ['documentType', 'documentId'],
      },
      true
    );
    this.logger = createLogger('DocumentUpdateTool');
  }

  // eslint-disable-next-line no-unused-vars
  getConfirmationDetails(params) {
    return {
      title: `Update ${params.documentType}`,
      html: `
        <div class="simulacrum-confirmation">
          <p><strong>Type:</strong> ${params.documentType}</p>
          <p><strong>ID:</strong> ${params.documentId}</p>
          <div class="code-preview">
            ${params.updates ? `<strong>Updates:</strong><pre>${JSON.stringify(params.updates, null, 2)}</pre>` : ''}
            ${params.operations ? `<strong>Operations:</strong><pre>${JSON.stringify(params.operations, null, 2)}</pre>` : ''}
          </div>
        </div>
      `,
    };
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @returns {Object} Tool result
   */
  async execute(params) {
    if (isDebugEnabled()) {
      this.logger.info('Starting execute with params:', params);
    }
    const normalizedParams = { ...params };
    if (typeof normalizedParams.documentId === 'string') {
      normalizedParams.documentId = normalizedParams.documentId.trim();
    }

    try {
      this._validateBasicParams(normalizedParams);
      const { documentType, documentId, pack } = normalizedParams;

      // Check if pack is locked before attempting update
      if (pack) {
        const packCollection = game.packs.get(pack);
        if (!packCollection) {
          return {
            content: `Compendium pack "${pack}" not found`,
            display: `Pack not found: ${pack}`,
            error: { message: `pack "${pack}" not found`, type: 'PACK_NOT_FOUND' },
          };
        }
        if (packCollection.locked) {
          return {
            content: `Compendium pack "${pack}" is locked. Use compendium_config to unlock it first.`,
            display: `Pack is locked: ${pack}`,
            error: { message: `pack "${pack}" is locked`, type: 'PACK_LOCKED' },
          };
        }
        if (packCollection.documentName !== documentType) {
          return {
            content: `Pack "${pack}" contains ${packCollection.documentName} documents, but you specified ${documentType}`,
            display: `Type mismatch: Pack contains ${packCollection.documentName}`,
            error: { message: `Type mismatch`, type: 'TYPE_MISMATCH' },
          };
        }
      }

      await this.#enforceReadBeforeModify(documentType, documentId, pack);

      if (normalizedParams.updates) await this.validateImageUrls(normalizedParams.updates);
      if (normalizedParams.operations) await this.validateImageUrls(normalizedParams.operations);

      const plan = await this.#buildOperationPlan(normalizedParams);
      const { updates, embeddedOperations } = plan;

      if (Object.keys(updates).length === 0 && embeddedOperations.length === 0) {
        throw new ToolValidationError('No updates provided. Supply `updates` or `operations`.');
      }

      await this.#applyOperations(normalizedParams, updates, embeddedOperations);

      return await this.#buildSuccessResponse(normalizedParams);
    } catch (error) {
      return this.#handleExecuteError(error, normalizedParams);
    }
  }

  #handleExecuteError(error, params) {
    if (isDebugEnabled()) this.logger.info('Caught error in execute():', error.name, error.message);
    if (error instanceof ToolValidationError) {
      return this.#buildValidationErrorResponse(error.message, params);
    }
    const readErrors = ['DOCUMENT_NOT_READ', 'DOCUMENT_STALE', 'DOCUMENT_NOT_FOUND'];
    if (readErrors.includes(error.code)) {
      return {
        content: error.message,
        display: `${error.message}`,
        error: {
          message: error.message,
          type: error.code,
          documentType: params.documentType,
          documentId: params.documentId,
        },
      };
    }
    return ValidationErrorHandler.createToolErrorResponse(
      error,
      'update',
      params.documentType,
      params.documentId
    );
  }

  _validateBasicParams(params) {
    if (!this.isValidDocumentType(params.documentType)) {
      throw new ToolValidationError(
        `Document type "${params.documentType}" not available in current system`
      );
    }
    if (typeof params.documentId !== 'string' || params.documentId === '') {
      throw new ToolValidationError('Parameter "documentId" must be a non-empty string');
    }
  }

  async #applyOperations(params, updates, embeddedOperations) {
    if (embeddedOperations.length) {
      if (isDebugEnabled()) this.logger.info('Applying embedded operations:', embeddedOperations);
      await DocumentAPI.applyEmbeddedOperations(
        params.documentType,
        params.documentId,
        embeddedOperations
      );
    }

    if (Object.keys(updates).length) {
      if (isDebugEnabled())
        this.logger.info('Calling DocumentAPI.updateDocument() with updates:', updates);
      await DocumentAPI.updateDocument(params.documentType, params.documentId, updates, { pack: params.pack });
    }
  }

  async #buildSuccessResponse(params) {
    const opts = { includeEmbedded: true };
    if (params.pack) opts.pack = params.pack;
    const latestDocument = await DocumentAPI.getDocument(params.documentType, params.documentId, opts);
    const id = latestDocument.name || latestDocument._id || latestDocument.id;

    // Update the registry with the new document state so subsequent edits don't fail
    const data = typeof latestDocument?.toObject === 'function' ? latestDocument.toObject() : latestDocument;
    documentReadRegistry.registerRead(params.documentType, params.documentId, data);

    return {
      content: JSON.stringify(
        {
          message: `Updated @UUID[${params.documentType}.${params.documentId}]`,
          document: latestDocument,
        },
        null,
        2
      ),
      display: `Updated **${id}** (${params.documentType})`,
      document: latestDocument,
    };
  }

  async #buildOperationPlan(params) {
    const flatUpdates = this.#normalizeUpdates(params.updates);
    const operations = params.operations;
    const embeddedOperations = [];
    let remainingUpdates = { ...flatUpdates };
    const embeddedState = new Map();

    const requiresDocument =
      Object.keys(flatUpdates || {}).length || (Array.isArray(operations) && operations.length);

    let workingDocument = {};
    let docInstance = null;

    if (requiresDocument) {
      if (isDebugEnabled()) this.logger.info('Fetching document for operations');
      const documentSnapshot = await DocumentAPI.getDocument(
        params.documentType,
        params.documentId,
        { includeEmbedded: true, pack: params.pack }
      );
      workingDocument = DocumentUpdateLogic.cloneValue(documentSnapshot);
      // Note: getDocumentInstance might not support pack yet? check API. 
      // Re-checked API: getDocumentInstance looks like it only supports collections.
      // However, for updates (merging objects), workingDocument (snapshot) is the most critical part.
      // docInstance is used for isEmbeddedCollection checks.
      // Ideally we shouldn't fail if docInstance is missing for compendium?
      // Or we should update getDocumentInstance too? 
      // For now, let's try to fetch it, but if it fails (because it only looks in collections), 
      // we might have issues with embedded operations logic.
      // But standard updates rely on workingDocument.

      // Let's modify getDocumentInstance call or accept that embedded logic might be limited for packs.
      // Actually DocumentAPI.getDocumentInstance logic is: Resolves collection -> collection.get(). 
      // So it strictly requires World collection.
      // We should probably skip getDocumentInstance for packs and rely on schema introspection if possible,
      // OR update DocumentAPI to return a dummy instance or the real one if Pack supports it.
      // Pack.getDocument(id) returns a Document instance!

      // FIX: We need to bypass DocumentAPI.getDocumentInstance for packs if it doesn't support them,
      // or duplicate the packing logic there.
      // Since I can't easily modify DocumentAPI again right now to add getDocumentInstance pack support without risking more scope creep,
      // I will conditionally fetch the instance directly from the pack if pack is present.

      if (params.pack) {
        const packObj = game.packs.get(params.pack);
        if (packObj) {
          docInstance = await packObj.getDocument(params.documentId);
        }
      } else {
        docInstance = await DocumentAPI.getDocumentInstance(params.documentType, params.documentId);
      }

      const extraction = DocumentUpdateLogic.extractEmbeddedFieldUpdates(
        remainingUpdates,
        docInstance,
        embeddedState
      );
      remainingUpdates = extraction.remainingUpdates;
      embeddedOperations.push(...extraction.embeddedOperations);
    }

    if (operations?.length) {
      if (!Array.isArray(operations)) {
        throw new ToolValidationError('Parameter "operations" must be an array when provided');
      }
      const opResults = this.#processOperations({
        operations,
        docInstance,
        workingDocument,
        embeddedState,
        embeddedOperations,
      });
      remainingUpdates = { ...remainingUpdates, ...opResults };
    }

    return { updates: remainingUpdates, embeddedOperations };
  }

  #processOperations({
    operations,
    docInstance,
    workingDocument,
    embeddedState,
    embeddedOperations,
  }) {
    const operationResults = {};
    for (let index = 0; index < operations.length; index += 1) {
      const normalized = DocumentUpdateLogic.normalizeOperation(operations[index], index);
      const segments = normalized.path.split('.');
      const collectionKey = segments[0];

      if (docInstance && DocumentUpdateLogic.isEmbeddedCollection(docInstance, collectionKey)) {
        const embeddedOp = DocumentUpdateLogic.prepareEmbeddedOperation(normalized, {
          docInstance,
          collectionKey,
          operationIndex: index,
          embeddedState,
        });
        embeddedOperations.push(embeddedOp);
      } else {
        const currentValue = this.#getValueAtPath(workingDocument, normalized.path);
        if (!Array.isArray(currentValue)) {
          throw new ToolValidationError(
            `Operation ${index + 1}: path "${normalized.path}" does not reference an array`
          );
        }
        const updatedArray = DocumentUpdateLogic.performArrayOperation(
          currentValue,
          normalized,
          index
        );
        this.#setValueAtPath(workingDocument, normalized.path, updatedArray);
        operationResults[normalized.path] = updatedArray;
      }
    }
    return operationResults;
  }

  #normalizeUpdates(updates) {
    if (updates === undefined) return {};
    if (updates === null || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new ToolValidationError('Parameter "updates" must be an object when provided');
    }
    return { ...updates };
  }

  #getValueAtPath(target, path) {
    const segments = path.split('.');
    let current = target;
    for (const segment of segments) {
      if (current === null || current === undefined) return undefined;
      current = current[segment];
    }
    return current;
  }

  #setValueAtPath(target, path, value) {
    const segments = path.split('.');
    const lastSegment = segments.pop();
    let current = target;
    for (const segment of segments) {
      if (!current[segment] || typeof current[segment] !== 'object') {
        current[segment] = {};
      }
      current = current[segment];
    }
    current[lastSegment] = value;
  }

  #buildValidationErrorResponse(message, params) {
    const docRef =
      params.documentType && params.documentId
        ? `@UUID[${params.documentType}.${params.documentId}]`
        : params.documentType || 'document';

    return {
      content: `Validation failed for update ${docRef}: ${message}`,
      display: `Validation Error: ${message}`,
      error: {
        message,
        type: 'VALIDATION_ERROR',
        documentType: params.documentType,
        documentId: params.documentId,
      },
    };
  }
}

export { DocumentUpdateTool };
