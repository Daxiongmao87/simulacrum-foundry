/**
 * Document Update Tool - Update documents of any type supported by current system
 */

import { BaseTool } from './base-tool.js';
import { DocumentAPI } from '../core/document-api.js';
import { ValidationErrorHandler } from '../utils/validation-errors.js';

class ToolValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

class DocumentUpdateTool extends BaseTool {
  /**
   * Create a new Document Update Tool
   */
  constructor() {
    super('update_document', 'Update documents of any type supported by current system.', {
      type: 'object',
      properties: {
        documentType: {
          type: 'string',
          required: true,
          description: 'Type of document to update'
        },
        documentId: {
          type: 'string',
          required: true,
          description: 'ID of document to update'
        },
        updates: {
          type: 'object',
          required: false,
          description: 'Document updates (will be validated by FoundryVTT)'
        },
        operations: {
          type: 'array',
          required: false,
          description: 'Structured array mutations to apply before updating the document',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'insert | replace | delete' },
              path: { type: 'string', description: 'Dot-notation path to array field (e.g., system.bonds)' },
              index: { type: 'integer', description: 'Array index for insert/replace/delete operations' },
              value: { description: 'Value to insert or replace when applicable' }
            }
          }
        }
      },
      required: ['documentType', 'documentId']
    });
    this.requiresConfirmation = true;
  }

  /**
   * Get confirmation details for document update
   * @param {Object} params - Tool parameters
   * @returns {Object} Confirmation details
   */
  async getConfirmationDetails(params) {
    const detailsPayload = {
      updates: params.updates || {},
      operations: Array.isArray(params.operations) ? params.operations : []
    };

    return {
      type: 'update',
      title: `Update ${params.documentType} Document`,
      details: `Updating ${params.documentType}:${params.documentId} with payload: ${JSON.stringify(detailsPayload, null, 2)}`
    };
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @returns {Object} Tool result
   */
  async execute(params) {
    console.log('[DocumentUpdateTool] Starting execute with params:', JSON.stringify(params, null, 2));
    const normalizedParams = { ...params };
    if (typeof normalizedParams.documentId === 'string') {
      normalizedParams.documentId = normalizedParams.documentId.trim();
    }

    try {
      if (!this.isValidDocumentType(normalizedParams.documentType)) {
        return {
          content: `Document type "${normalizedParams.documentType}" not available in current system`,
          display: `❌ Unknown document type: ${normalizedParams.documentType}`,
          error: {
            message: `Document type "${normalizedParams.documentType}" not available in current system`,
            type: 'UNKNOWN_DOCUMENT_TYPE'
          }
        };
      }

      if (typeof normalizedParams.documentId !== 'string' || normalizedParams.documentId === '') {
        throw new ToolValidationError('Parameter "documentId" must be a non-empty string');
      }

      // Validate image URLs (Task-04)
      if (normalizedParams.updates) this.validateImageUrls(normalizedParams.updates);
      if (normalizedParams.operations) this.validateImageUrls(normalizedParams.operations);

      const { updates, embeddedOperations } = await this.#buildOperationPlan(normalizedParams);

      if (Object.keys(updates).length === 0 && embeddedOperations.length === 0) {
        throw new ToolValidationError('No updates provided. Supply `updates` or `operations`.');
      }

      if (embeddedOperations.length) {
        console.log('[DocumentUpdateTool] Applying embedded operations:', JSON.stringify(embeddedOperations, null, 2));
        await DocumentAPI.applyEmbeddedOperations(
          normalizedParams.documentType,
          normalizedParams.documentId,
          embeddedOperations
        );
      }

      if (Object.keys(updates).length) {
        console.log('[DocumentUpdateTool] About to call DocumentAPI.updateDocument() with updates:', JSON.stringify(updates, null, 2));
        await DocumentAPI.updateDocument(
          normalizedParams.documentType,
          normalizedParams.documentId,
          updates
        );
      }

      const latestDocument = await DocumentAPI.getDocument(
        normalizedParams.documentType,
        normalizedParams.documentId,
        { includeEmbedded: true }
      );

      const message = `Updated ${normalizedParams.documentType}:${normalizedParams.documentId}`;
      const contentPayload = {
        message,
        document: latestDocument
      };

      return {
        content: JSON.stringify(contentPayload, null, 2),
        display: `✅ Updated **${latestDocument.name || latestDocument._id || latestDocument.id}** (${normalizedParams.documentType})`,
        document: latestDocument
      };
    } catch (error) {
      console.log('[DocumentUpdateTool] Caught error in execute():', error.name, error.message);
      if (error instanceof ToolValidationError) {
        return this.#buildValidationErrorResponse(error.message, normalizedParams);
      }
      return ValidationErrorHandler.createToolErrorResponse(
        error,
        'update',
        normalizedParams.documentType,
        normalizedParams.documentId
      );
    }
  }

  async #buildOperationPlan(params) {
    const flatUpdates = this.#normalizeUpdates(params.updates);
    const operations = params.operations;

    const embeddedOperations = [];
    let remainingUpdates = { ...flatUpdates };
    let documentSnapshot = null;
    let docInstance = null;
    let workingDocument = {};
    const embeddedState = new Map();
    const requiresDocument = Object.keys(flatUpdates || {}).length || (Array.isArray(operations) && operations.length);

    if (requiresDocument) {
      console.log('[DocumentUpdateTool] Fetching document for operations');
      documentSnapshot = await DocumentAPI.getDocument(params.documentType, params.documentId, { includeEmbedded: true });
      workingDocument = this.#cloneValue(documentSnapshot);
      docInstance = await DocumentAPI.getDocumentInstance(params.documentType, params.documentId);
      const extraction = this.#extractEmbeddedFieldUpdates(remainingUpdates, docInstance, embeddedState);
      remainingUpdates = extraction.remainingUpdates;
      embeddedOperations.push(...extraction.embeddedOperations);
    }

    if (operations === undefined) {
      return { updates: remainingUpdates, embeddedOperations };
    }

    if (!Array.isArray(operations)) {
      throw new ToolValidationError('Parameter "operations" must be an array when provided');
    }

    if (operations.length === 0) {
      return { updates: remainingUpdates, embeddedOperations };
    }

    const operationResults = {};

    for (let index = 0; index < operations.length; index += 1) {
      const normalized = this.#normalizeOperation(operations[index], index);
      const segments = normalized.path.split('.');
      const collectionKey = segments[0];

      if (docInstance && this.#isEmbeddedCollection(docInstance, collectionKey)) {
        const embeddedOp = this.#prepareEmbeddedOperation(normalized, {
          docInstance,
          collectionKey,
          operationIndex: index,
          embeddedState
        });
        embeddedOperations.push(embeddedOp);
      } else {
        const currentValue = this.#getValueAtPath(workingDocument, normalized.path);

        if (!Array.isArray(currentValue)) {
          throw new ToolValidationError(`Operation ${index + 1}: path "${normalized.path}" does not reference an array`);
        }

        const updatedArray = this.#performArrayOperation(currentValue, normalized, index);
        this.#setValueAtPath(workingDocument, normalized.path, updatedArray);
        operationResults[normalized.path] = updatedArray;
      }
    }

    const mergedUpdates = { ...remainingUpdates, ...operationResults };
    return { updates: mergedUpdates, embeddedOperations };
  }

  #normalizeUpdates(updates) {
    if (updates === undefined) {
      return {};
    }

    if (updates === null || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new ToolValidationError('Parameter "updates" must be an object when provided');
    }

    return { ...updates };
  }

  #normalizeOperation(operation, index) {
    if (!operation || typeof operation !== 'object') {
      throw new ToolValidationError(`Operation ${index + 1} must be an object`);
    }

    const action = typeof operation.action === 'string' ? operation.action.toLowerCase() : null;
    const path = typeof operation.path === 'string' ? operation.path.trim() : '';

    if (!action || !['insert', 'replace', 'delete'].includes(action)) {
      throw new ToolValidationError(`Operation ${index + 1}: unknown action "${operation.action}"`);
    }

    if (!path) {
      throw new ToolValidationError(`Operation ${index + 1}: path is required`);
    }

    const normalized = { action, path };
    const id = typeof operation.id === 'string' ? operation.id.trim() : '';
    if (id) {
      normalized.id = id;
    }

    if (operation.index !== undefined && operation.index !== null) {
      const indexValue = Number(operation.index);
      if (!Number.isInteger(indexValue) || indexValue < 0) {
        throw new ToolValidationError(`Operation ${index + 1}: index must be a non-negative integer`);
      }
      normalized.index = indexValue;
    }

    if (action === 'insert' && normalized.index === undefined) {
      normalized.index = null; // Indicates append
    }

    if ((action === 'delete' || action === 'replace') && !normalized.id && normalized.index === undefined) {
      throw new ToolValidationError(`Operation ${index + 1}: ${action} requires an id or index`);
    }

    if (action === 'insert' || action === 'replace') {
      if (!('value' in operation)) {
        throw new ToolValidationError(`Operation ${index + 1}: value is required for ${action}`);
      }
      normalized.value = this.#cloneValue(operation.value);
    }

    return normalized;
  }

  #isEmbeddedCollection(docInstance, collectionKey) {
    if (!docInstance || !collectionKey) return false;
    const candidate = docInstance[collectionKey];
    return Boolean(candidate && typeof candidate === 'object' && Array.isArray(candidate.contents) && candidate.documentClass);
  }

  #prepareEmbeddedOperation(normalized, { docInstance, collectionKey, operationIndex, embeddedState }) {
    const metadata = this.#extractEmbeddedMetadata(docInstance, collectionKey);
    if (!metadata) {
      throw new ToolValidationError(`Operation ${operationIndex + 1}: path "${normalized.path}" does not reference an embedded collection`);
    }

    const { collection, embeddedName } = metadata;
    const entries = this.#getEmbeddedWorkingSet(embeddedState, collectionKey, collection, operationIndex);
    const operation = {
      action: normalized.action,
      collection: collectionKey,
      embeddedName
    };

    if (normalized.index !== undefined) {
      operation.index = normalized.index;
    }

    if (normalized.action === 'delete') {
      let targetId = normalized.id;
      if (!targetId) {
        if (normalized.index === undefined) {
          throw new ToolValidationError(`Operation ${operationIndex + 1}: delete requires an id or index for embedded collection "${collectionKey}"`);
        }
        targetId = this.#deriveEmbeddedIdFromIndex(entries, normalized.index, operationIndex, collectionKey);
      }
      const removalIndex = entries.findIndex(entry => entry.id === targetId);
      if (removalIndex === -1) {
        throw new ToolValidationError(`Operation ${operationIndex + 1}: embedded id "${targetId}" not found in "${collectionKey}"`);
      }
      entries.splice(removalIndex, 1);
      operation.targetId = targetId;
      return operation;
    }

    if (normalized.action === 'replace') {
      let targetId = normalized.id;
      let targetIndex = normalized.index;
      if (!targetId) {
        if (normalized.index === undefined) {
          throw new ToolValidationError(`Operation ${operationIndex + 1}: replace requires an id or index for embedded collection "${collectionKey}"`);
        }
        targetId = this.#deriveEmbeddedIdFromIndex(entries, normalized.index, operationIndex, collectionKey);
        targetIndex = normalized.index;
      } else {
        const idx = entries.findIndex(entry => entry.id === targetId);
        if (idx === -1) {
          throw new ToolValidationError(`Operation ${operationIndex + 1}: embedded id "${targetId}" not found in "${collectionKey}"`);
        }
        targetIndex = idx;
      }

      const payload = this.#cloneValue(normalized.value);
      if (!payload || typeof payload !== 'object') {
        throw new ToolValidationError(`Operation ${operationIndex + 1}: value must be an object for replace`);
      }
      if (!payload._id) {
        payload._id = targetId;
      }
      if (payload.sort === undefined && targetIndex !== undefined && entries[targetIndex]) {
        payload.sort = entries[targetIndex].sort;
      }
      operation.data = payload;
      operation.targetId = targetId;
      return operation;
    }

    if (normalized.action === 'insert') {
      const payload = this.#cloneValue(normalized.value);
      if (!payload || typeof payload !== 'object') {
        throw new ToolValidationError(`Operation ${operationIndex + 1}: value must be an object for insert`);
      }
      if (!payload._id) {
        payload._id = this.#generateId();
      }
      const insertIndex = normalized.index === null || normalized.index === undefined ? entries.length : normalized.index;
      if (!Number.isInteger(insertIndex) || insertIndex < 0 || insertIndex > entries.length) {
        throw new ToolValidationError(`Operation ${operationIndex + 1}: index ${insertIndex} is out of bounds for embedded collection "${collectionKey}"`);
      }
      const sort = this.#calculateEmbeddedSort(entries, insertIndex);
      if (sort !== undefined && sort !== null) {
        payload.sort = sort;
      }
      entries.splice(insertIndex, 0, { id: payload._id, sort: payload.sort ?? sort ?? insertIndex });
      operation.data = payload;
      operation.index = insertIndex;
      return operation;
    }

    throw new ToolValidationError(`Operation ${operationIndex + 1}: unsupported action "${normalized.action}" for embedded collection "${collectionKey}"`);
  }

  #extractEmbeddedFieldUpdates(updates, docInstance, embeddedState) {
    if (!updates || !Object.keys(updates).length) {
      return { remainingUpdates: updates, embeddedOperations: [] };
    }

    const remainingUpdates = {};
    const embeddedOperations = [];

    for (const [path, value] of Object.entries(updates)) {
      if (typeof path !== 'string') {
        remainingUpdates[path] = value;
        continue;
      }

      const segments = path.split('.');
      if (segments.length < 2) {
        remainingUpdates[path] = value;
        continue;
      }

      const collectionKey = segments[0];
      if (!this.#isEmbeddedCollection(docInstance, collectionKey)) {
        remainingUpdates[path] = value;
        continue;
      }

      const metadata = this.#extractEmbeddedMetadata(docInstance, collectionKey);
      if (!metadata) {
        throw new ToolValidationError(`Path "${path}" does not reference a known embedded collection`);
      }

      const entries = this.#getEmbeddedWorkingSet(embeddedState, collectionKey, metadata.collection, -1);
      const identifier = segments[1];
      let targetId = identifier;
      let targetIndex = entries.findIndex(entry => entry.id === identifier);

      if (targetIndex === -1) {
        if (/^\d+$/.test(identifier)) {
          targetIndex = Number(identifier);
          targetId = this.#deriveEmbeddedIdFromIndex(entries, targetIndex, -1, collectionKey);
        } else {
          throw new ToolValidationError(`Embedded id "${identifier}" not found in collection "${collectionKey}"`);
        }
      }

      const nestedSegments = segments.slice(2);
      if (!nestedSegments.length) {
        throw new ToolValidationError(`Embedded update path "${path}" must target a nested field`);
      }

      let op = embeddedOperations.find(entry => entry.collection === collectionKey && entry.targetId === targetId);
      if (!op) {
        op = {
          action: 'replace',
          collection: collectionKey,
          embeddedName: metadata.embeddedName,
          targetId,
          data: { _id: targetId }
        };
        embeddedOperations.push(op);
      }

      this.#applyNestedValue(op.data, nestedSegments, value);
    }

    return { remainingUpdates, embeddedOperations };
  }

  #applyNestedValue(target, segments, value) {
    let current = target;
    const last = segments.length - 1;
    segments.forEach((segment, idx) => {
      if (idx === last) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          current[segment] = {
            ...(current[segment] && typeof current[segment] === 'object' ? current[segment] : {}),
            ...value
          };
        } else {
          current[segment] = value;
        }
        return;
      }
      if (!current[segment] || typeof current[segment] !== 'object') {
        current[segment] = {};
      }
      current = current[segment];
    });
  }

  #getEmbeddedWorkingSet(embeddedState, collectionKey, collection, operationIndex) {
    if (!embeddedState.has(collectionKey)) {
      const contents = Array.isArray(collection?.contents) ? collection.contents : [];
      const snapshot = contents.map(doc => ({
        id: doc?.id ?? doc?._id,
        sort: typeof doc?.sort === 'number' ? doc.sort : (doc?.sort ?? 0)
      })).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      embeddedState.set(collectionKey, snapshot);
    }
    const entries = embeddedState.get(collectionKey);
    if (!entries) {
      throw new ToolValidationError(`Operation ${operationIndex + 1}: unable to resolve embedded collection "${collectionKey}"`);
    }
    return entries;
  }

  #deriveEmbeddedIdFromIndex(entries, index, operationIndex, collectionKey) {
    if (!Number.isInteger(index)) {
      throw new ToolValidationError(`Operation ${operationIndex + 1}: index must be provided when id is omitted for embedded collection "${collectionKey}"`);
    }
    if (index < 0 || index >= entries.length) {
      throw new ToolValidationError(`Operation ${operationIndex + 1}: index ${index} is out of bounds for embedded collection "${collectionKey}"`);
    }
    return entries[index]?.id;
  }

  #calculateEmbeddedSort(entries, index) {
    if (!entries.length) {
      return 0;
    }
    const sorted = [...entries].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    if (index <= 0) {
      const first = sorted[0]?.sort ?? 0;
      return first - 1000;
    }
    if (index >= sorted.length) {
      const last = sorted[sorted.length - 1]?.sort ?? 0;
      return last + 1000;
    }
    const prev = sorted[index - 1]?.sort ?? 0;
    const next = sorted[index]?.sort ?? prev + 1000;
    if (prev === next) {
      return prev;
    }
    return prev + (next - prev) / 2;
  }

  #extractEmbeddedMetadata(docInstance, collectionKey) {
    if (!docInstance || !collectionKey) return null;
    const collection = docInstance[collectionKey];
    if (!collection || typeof collection !== 'object') return null;
    const embeddedName = collection.documentClass?.documentName
      || collection.documentName
      || collection.constructor?.documentName
      || collection.documentClass?.name;
    if (!embeddedName) return null;
    return { collection, embeddedName };
  }

  #performArrayOperation(currentArray, operation, index) {
    const clonedArray = Array.isArray(currentArray)
      ? this.#cloneValue(currentArray)
      : [];

    if (!Array.isArray(clonedArray)) {
      throw new ToolValidationError(`Operation ${index + 1}: target is not an array`);
    }

    if (operation.action === 'delete') {
      const idx = operation.index;
      if (idx === null || idx === undefined) {
        throw new ToolValidationError(`Operation ${index + 1}: delete requires an index`);
      }
      if (idx < 0 || idx >= clonedArray.length) {
        throw new ToolValidationError(`Operation ${index + 1}: index ${idx} is out of bounds for delete`);
      }
      clonedArray.splice(idx, 1);
      return clonedArray;
    }

    if (operation.action === 'replace') {
      const idx = operation.index;
      if (idx === null || idx === undefined) {
        throw new ToolValidationError(`Operation ${index + 1}: replace requires an index`);
      }
      if (idx < 0 || idx >= clonedArray.length) {
        throw new ToolValidationError(`Operation ${index + 1}: index ${idx} is out of bounds for replace`);
      }
      clonedArray.splice(idx, 1, operation.value);
      return clonedArray;
    }

    // insert
    const insertIndex = operation.index === null ? clonedArray.length : operation.index;
    if (insertIndex < 0 || insertIndex > clonedArray.length) {
      throw new ToolValidationError(`Operation ${index + 1}: index ${insertIndex} is out of bounds for insert`);
    }
    clonedArray.splice(insertIndex, 0, operation.value);
    return clonedArray;
  }

  #getValueAtPath(target, path) {
    const segments = path.split('.');
    let current = target;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }
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

  #cloneValue(value) {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (foundry?.utils?.deepClone) {
      return foundry.utils.deepClone(value);
    }

    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  #generateId() {
    if (foundry?.utils?.randomID) {
      return foundry.utils.randomID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 18);
  }

  #buildValidationErrorResponse(message, params) {
    const hasDocRef = params.documentType && params.documentId;
    const docRef = hasDocRef ? `${params.documentType}:${params.documentId}` : params.documentType || 'document';

    return {
      content: `Validation failed for update ${docRef}: ${message}`,
      display: `❌ Validation Error: ${message}`,
      error: {
        message,
        type: 'VALIDATION_ERROR',
        documentType: params.documentType,
        documentId: params.documentId
      }
    };
  }
}

export { DocumentUpdateTool };
