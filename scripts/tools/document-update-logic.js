/* eslint-disable complexity, max-lines, max-len */
/**
 * Logic helper for Document Update Tool
 * Handles complex embedded operation logic
 */
import { ToolValidationError } from '../utils/tool-validation-error.js';

export class DocumentUpdateLogic {
  /**
   * Clone a value safely
   */
  static cloneValue(value) {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (foundry?.utils?.deepClone) {
      return foundry.utils.deepClone(value);
    }

    if (typeof structuredClone === 'function') {
      // eslint-disable-next-line no-undef
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  static generateId() {
    if (foundry?.utils?.randomID) {
      return foundry.utils.randomID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 18);
  }

  /**
   * Validate if a string is a valid 16-character alphanumeric ID
   * @param {string} id - The ID to validate
   * @returns {boolean} True if valid, false otherwise
   */
  static isValidId(id) {
    if (typeof id !== 'string') return false;
    return /^[a-zA-Z0-9]{16}$/.test(id);
  }

  static extractEmbeddedMetadata(docInstance, collectionKey) {
    if (!docInstance || !collectionKey) return null;
    const collection = docInstance[collectionKey];
    if (!collection || typeof collection !== 'object') return null;
    const embeddedName =
      collection.documentClass?.documentName ||
      collection.documentName ||
      collection.constructor?.documentName ||
      collection.documentClass?.name;
    if (!embeddedName) return null;
    return { collection, embeddedName };
  }

  static isEmbeddedCollection(docInstance, collectionKey) {
    if (!docInstance || !collectionKey) return false;
    const candidate = docInstance[collectionKey];
    return Boolean(
      candidate &&
      typeof candidate === 'object' &&
      Array.isArray(candidate.contents) &&
      candidate.documentClass
    );
  }

  static getEmbeddedWorkingSet(embeddedState, collectionKey, collection, operationIndex) {
    if (!embeddedState.has(collectionKey)) {
      const contents = Array.isArray(collection?.contents) ? collection.contents : [];
      const snapshot = contents
        .map(doc => ({
          id: doc?.id ?? doc?._id,
          sort: typeof doc?.sort === 'number' ? doc.sort : (doc?.sort ?? 0),
        }))
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      embeddedState.set(collectionKey, snapshot);
    }
    const entries = embeddedState.get(collectionKey);
    if (!entries) {
      const idxOp = operationIndex !== -1 ? `Operation ${operationIndex + 1}: ` : '';
      throw new ToolValidationError(
        `${idxOp}unable to resolve embedded collection "${collectionKey}"`
      );
    }
    return entries;
  }

  static deriveEmbeddedIdFromIndex(entries, index, operationIndex, collectionKey) {
    const idxOp = operationIndex !== -1 ? `Operation ${operationIndex + 1}: ` : '';
    if (!Number.isInteger(index)) {
      throw new ToolValidationError(
        `${idxOp}index must be provided when id is omitted for embedded collection "${collectionKey}"`
      );
    }
    if (index < 0 || index >= entries.length) {
      throw new ToolValidationError(
        `${idxOp}index ${index} is out of bounds for embedded collection "${collectionKey}"`
      );
    }
    return entries[index]?.id;
  }

  static calculateEmbeddedSort(entries, index) {
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

  static prepareEmbeddedOperation(normalized, params) {
    const { docInstance, collectionKey, operationIndex, embeddedState } = params;
    const metadata = this.extractEmbeddedMetadata(docInstance, collectionKey);
    if (!metadata) {
      throw new ToolValidationError(
        `Operation ${operationIndex + 1}: path "${normalized.path}" does not reference an embedded collection`
      );
    }

    const { collection, embeddedName } = metadata;
    const entries = this.getEmbeddedWorkingSet(
      embeddedState,
      collectionKey,
      collection,
      operationIndex
    );
    const operation = {
      action: normalized.action,
      collection: collectionKey,
      embeddedName,
    };

    if (normalized.index !== undefined) {
      operation.index = normalized.index;
    }

    const ctx = { normalized, entries, operationIndex, collectionKey, operation };

    if (normalized.action === 'delete') {
      return this._prepareEmbeddedDelete(ctx);
    }
    if (normalized.action === 'replace') {
      return this._prepareEmbeddedReplace(ctx);
    }
    if (normalized.action === 'insert') {
      return this._prepareEmbeddedInsert(ctx);
    }

    throw new ToolValidationError(
      `Operation ${operationIndex + 1}: unsupported action "${normalized.action}" for collection "${collectionKey}"`
    );
  }

  static _prepareEmbeddedDelete({ normalized, entries, operationIndex, collectionKey, operation }) {
    let targetId = normalized.id;
    if (!targetId) {
      if (normalized.index === undefined) {
        throw new ToolValidationError(
          `Operation ${operationIndex + 1}: delete requires id/index for "${collectionKey}"`
        );
      }
      targetId = this.deriveEmbeddedIdFromIndex(
        entries,
        normalized.index,
        operationIndex,
        collectionKey
      );
    }
    const removalIndex = entries.findIndex(entry => entry.id === targetId);
    if (removalIndex === -1) {
      throw new ToolValidationError(
        `Operation ${operationIndex + 1}: embedded id "${targetId}" not found in "${collectionKey}"`
      );
    }
    entries.splice(removalIndex, 1);
    operation.targetId = targetId;
    return operation;
  }

  /**
   * Handle embedded replace logic
   */
  // eslint-disable-next-line complexity
  static _prepareEmbeddedReplace({
    normalized,
    entries,
    operationIndex,
    collectionKey,
    operation,
  }) {
    let targetId = normalized.id;
    let targetIndex = normalized.index;

    if (!targetId) {
      if (normalized.index === undefined) {
        throw new ToolValidationError(
          `Operation ${operationIndex + 1}: replace requires id/index for "${collectionKey}"`
        );
      }
      targetId = this.deriveEmbeddedIdFromIndex(
        entries,
        normalized.index,
        operationIndex,
        collectionKey
      );
      targetIndex = normalized.index;
    } else {
      const idx = entries.findIndex(entry => entry.id === targetId);
      if (idx === -1) {
        throw new ToolValidationError(
          `Operation ${operationIndex + 1}: embedded id "${targetId}" not found in "${collectionKey}"`
        );
      }
      targetIndex = idx;
    }

    const payload = this.cloneValue(normalized.value);
    if (!payload || typeof payload !== 'object') {
      throw new ToolValidationError(`Operation ${operationIndex + 1}: value must be an object`);
    }
    if (!payload._id) {
      payload._id = targetId;
    }
    const existing = targetIndex !== undefined ? entries[targetIndex] : null;
    if (payload.sort === undefined && existing) {
      payload.sort = existing.sort;
    }
    operation.data = payload;
    operation.targetId = targetId;
    return operation;
  }

  static _prepareEmbeddedInsert({ normalized, entries, operationIndex, collectionKey, operation }) {
    const payload = this.cloneValue(normalized.value);
    if (!payload || typeof payload !== 'object') {
      throw new ToolValidationError(`Operation ${operationIndex + 1}: value must be an object`);
    }
    if (!payload._id || !this.isValidId(payload._id)) {
      payload._id = this.generateId();
    }

    const idx = this._calculateInsertIndex(
      normalized.index,
      entries.length,
      operationIndex,
      collectionKey
    );

    const sort = this.calculateEmbeddedSort(entries, idx);
    if (sort !== undefined && sort !== null) {
      payload.sort = sort;
    }

    entries.splice(idx, 0, { id: payload._id, sort: payload.sort ?? sort ?? idx });
    operation.data = payload;
    operation.index = idx;
    return operation;
  }

  static _calculateInsertIndex(index, length, operationIndex, collectionKey) {
    let idx = index;
    if (idx === null || idx === undefined) idx = length;

    if (!Number.isInteger(idx) || idx < 0 || idx > length) {
      throw new ToolValidationError(
        `Operation ${operationIndex + 1}: index ${idx} is out of bounds for collection "${collectionKey}"`
      );
    }
    return idx;
  }

  // eslint-disable-next-line complexity
  static extractEmbeddedFieldUpdates(updates, docInstance, embeddedState) {
    if (!updates || !Object.keys(updates).length) {
      return { remainingUpdates: updates, embeddedOperations: [] };
    }

    const remainingUpdates = {};
    const embeddedOperations = [];

    for (const [path, value] of Object.entries(updates)) {
      if (typeof path !== 'string' || path.split('.').length < 2) {
        remainingUpdates[path] = value;
        continue;
      }
      const segments = path.split('.');
      const collectionKey = segments[0];

      if (!this.isEmbeddedCollection(docInstance, collectionKey)) {
        remainingUpdates[path] = value;
        continue;
      }

      this._processEmbeddedUpdate({
        path,
        value,
        segments,
        collectionKey,
        docInstance,
        embeddedState,
        embeddedOperations,
      });
    }

    return { remainingUpdates, embeddedOperations };
  }

  // eslint-disable-next-line complexity
  static _processEmbeddedUpdate(params) {
    const { path, value, segments, collectionKey, docInstance, embeddedState, embeddedOperations } =
      params;
    const nestedSegments = segments.slice(2);
    if (!nestedSegments.length) {
      throw new ToolValidationError(`Embedded update path "${path}" must target a nested field`);
    }

    let targetId = segments[1];
    const metadata = this.extractEmbeddedMetadata(docInstance, collectionKey);

    // Resolve index to ID if possible
    if (metadata && metadata.collection) {
      const index = parseInt(targetId);
      if (!isNaN(index) && Array.isArray(metadata.collection.contents)) {
        // Determine if it's an index by checking if such ID exists?
        // Foundry logic usually prioritizes ID match, then index.
        // Here we simplify: if targetId looks like pure integer, try index lookup.
        const entry = metadata.collection.contents[index];
        if (entry && (entry.id || entry._id)) {
          targetId = entry.id || entry._id;
        }
      }
    }

    let op = embeddedOperations.find(
      entry => entry.collection === collectionKey && entry.targetId === targetId
    );
    if (!op) {
      this.getEmbeddedWorkingSet(embeddedState, collectionKey, docInstance[collectionKey], -1);
      op = {
        action: 'replace',
        collection: collectionKey,
        embeddedName: metadata.embeddedName,
        targetId,
        data: { _id: targetId },
      };
      embeddedOperations.push(op);
    }

    this._applyNestedValue(op.data, nestedSegments, value);
  }

  static _applyNestedValue(target, segments, value) {
    let current = target;
    const last = segments.length - 1;
    segments.forEach((segment, idx) => {
      if (idx === last) {
        /* eslint-disable max-depth */
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          current[segment] = {
            ...(current[segment] && typeof current[segment] === 'object' ? current[segment] : {}),
            ...value,
          };
        } else {
          current[segment] = value;
        }
        /* eslint-enable max-depth */
        return;
      }
      if (!current[segment] || typeof current[segment] !== 'object') {
        current[segment] = {};
      }
      current = current[segment];
    });
  }

  static performArrayOperation(currentArray, operation, index) {
    const clonedArray = Array.isArray(currentArray) ? this.cloneValue(currentArray) : [];
    if (!Array.isArray(clonedArray)) {
      throw new ToolValidationError(`Operation ${index + 1}: target is not an array`);
    }

    if (operation.action === 'delete') {
      return this._performArrayDelete(clonedArray, operation, index);
    }
    if (operation.action === 'replace') {
      return this._performArrayReplace(clonedArray, operation, index);
    }
    // insert
    return this._performArrayInsert(clonedArray, operation, index);
  }

  static _performArrayDelete(array, operation, index) {
    const idx = operation.index;
    if (idx === null || idx === undefined) {
      throw new ToolValidationError(`Operation ${index + 1}: delete requires an index`);
    }
    if (idx < 0 || idx >= array.length) {
      throw new ToolValidationError(
        `Operation ${index + 1}: index ${idx} is out of bounds for delete`
      );
    }
    array.splice(idx, 1);
    return array;
  }

  static _performArrayReplace(array, operation, index) {
    const idx = operation.index;
    if (idx === null || idx === undefined) {
      throw new ToolValidationError(`Operation ${index + 1}: replace requires an index`);
    }
    if (idx < 0 || idx >= array.length) {
      throw new ToolValidationError(
        `Operation ${index + 1}: index ${idx} is out of bounds for replace`
      );
    }
    array.splice(idx, 1, operation.value);
    return array;
  }

  static _performArrayInsert(array, operation, index) {
    const insertIndex = operation.index === null ? array.length : operation.index;
    if (insertIndex < 0 || insertIndex > array.length) {
      throw new ToolValidationError(
        `Operation ${index + 1}: index ${insertIndex} is out of bounds for insert`
      );
    }
    array.splice(insertIndex, 0, operation.value);
    return array;
  }

  // eslint-disable-next-line complexity
  static normalizeOperation(operation, index) {
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
    if (id) normalized.id = id;

    if (operation.index !== undefined && operation.index !== null) {
      const idx = Number(operation.index);
      if (!Number.isInteger(idx) || idx < 0) {
        throw new ToolValidationError(
          `Operation ${index + 1}: index must be a non-negative integer`
        );
      }
      normalized.index = idx;
    }

    if (action === 'insert' && normalized.index === undefined) {
      normalized.index = null; // Indicates append
    }

    if (
      (action === 'delete' || action === 'replace') &&
      !normalized.id &&
      normalized.index === undefined
    ) {
      throw new ToolValidationError(`Operation ${index + 1}: ${action} requires an id or index`);
    }

    if (action === 'insert' || action === 'replace') {
      if (!('value' in operation)) {
        throw new ToolValidationError(`Operation ${index + 1}: value is required for ${action}`);
      }
      normalized.value = this.cloneValue(operation.value);
    }
    return normalized;
  }
}
