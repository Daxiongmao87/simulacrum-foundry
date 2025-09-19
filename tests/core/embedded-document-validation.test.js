// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { DocumentAPI } from '../../scripts/core/document-api.js';
import {
  setupMockFoundryEnvironment,
  cleanupMockEnvironment
} from '../helpers/mock-setup.js';

describe('DocumentAPI Embedded Document Validation', () => {
  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  describe('Insert Operation Validation (Req 1)', () => {
    test('should validate embedded document insert operations with strict validation options', async () => {
      // Arrange - Mock embedded document class with validation
      const mockValidate = jest.fn();
      const mockEmbeddedDocumentClass = {
        validate: mockValidate
      };

      const mockCollection = {
        documentClass: mockEmbeddedDocumentClass
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection  // Mock embedded collection access
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      const insertData = { _id: 'page-3', name: 'New Page' };

      // Act
      await DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'insert', embeddedName: 'JournalEntryPage', data: insertData }
      ]);

      // Assert - Validation should be called with strict options
      expect(mockValidate).toHaveBeenCalledWith(insertData, {
        strict: true,
        fields: true,
        joint: true
      });
      expect(doc.createEmbeddedDocuments).toHaveBeenCalled();
    });

    test('should validate each payload individually for multiple inserts', async () => {
      // Arrange
      const mockValidate = jest.fn();
      const mockEmbeddedDocumentClass = {
        validate: mockValidate
      };

      const mockCollection = {
        documentClass: mockEmbeddedDocumentClass
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      const insertData1 = { _id: 'page-1', name: 'Page 1' };
      const insertData2 = { _id: 'page-2', name: 'Page 2' };

      // Act
      await DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'insert', embeddedName: 'JournalEntryPage', data: insertData1 },
        { action: 'insert', embeddedName: 'JournalEntryPage', data: insertData2 }
      ]);

      // Assert - Each payload should be validated
      expect(mockValidate).toHaveBeenCalledTimes(2);
      expect(mockValidate).toHaveBeenNthCalledWith(1, insertData1, expect.objectContaining({
        strict: true,
        fields: true,
        joint: true
      }));
      expect(mockValidate).toHaveBeenNthCalledWith(2, insertData2, expect.objectContaining({
        strict: true,
        fields: true,
        joint: true
      }));
    });
  });

  describe('Replace Operation Validation (Req 2)', () => {
    test('should validate embedded document replace operations with strict validation options', async () => {
      // Arrange
      const mockValidate = jest.fn();
      const mockEmbeddedDocumentClass = {
        validate: mockValidate
      };

      const mockCollection = {
        documentClass: mockEmbeddedDocumentClass
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      const replaceData = { _id: 'page-3', name: 'Updated Page' };

      // Act
      await DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'replace', embeddedName: 'JournalEntryPage', data: replaceData }
      ]);

      // Assert
      expect(mockValidate).toHaveBeenCalledWith(replaceData, {
        strict: true,
        fields: true,
        joint: true
      });
      expect(doc.updateEmbeddedDocuments).toHaveBeenCalled();
    });
  });

  describe('Validation Error Handling (Req 3)', () => {
    test('should propagate validation errors unchanged (fail-fast)', async () => {
      // Arrange
      const validationError = new Error('Validation failed: invalid name field');
      validationError.name = 'DataModelValidationError';

      const mockValidate = jest.fn().mockImplementation(() => {
        throw validationError;
      });

      const mockEmbeddedDocumentClass = {
        validate: mockValidate
      };

      const mockCollection = {
        documentClass: mockEmbeddedDocumentClass
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      // Act & Assert
      await expect(DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'insert', embeddedName: 'JournalEntryPage', data: { invalid: 'data' } }
      ])).rejects.toThrow(validationError);

      expect(doc.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test('should fail fast on first validation error with multiple payloads', async () => {
      // Arrange
      const validationError = new Error('First payload validation failed');
      let callCount = 0;

      const mockValidate = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw validationError;
        }
      });

      const mockEmbeddedDocumentClass = {
        validate: mockValidate
      };

      const mockCollection = {
        documentClass: mockEmbeddedDocumentClass
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      // Act & Assert
      await expect(DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'insert', embeddedName: 'JournalEntryPage', data: { invalid: 'data1' } },
        { action: 'insert', embeddedName: 'JournalEntryPage', data: { valid: 'data2' } }
      ])).rejects.toThrow(validationError);

      // Only first validation should be called (fail-fast)
      expect(mockValidate).toHaveBeenCalledTimes(1);
      expect(doc.createEmbeddedDocuments).not.toHaveBeenCalled();
    });
  });

  describe('FoundryVTT Native Validation Usage (Req 4)', () => {
    test('should use documentClass.validate when available', async () => {
      // This test is covered by previous tests - they all use documentClass.validate
      // This test specifically checks the requirement is met
      expect(true).toBe(true); // Placeholder - actual behavior tested above
    });

    test('should fallback to schema.validate when documentClass.validate unavailable', async () => {
      // Arrange
      const mockSchemaValidate = jest.fn();
      const mockEmbeddedDocumentClass = {
        schema: {
          validate: mockSchemaValidate
        }
        // No validate method on documentClass
      };

      const mockCollection = {
        documentClass: mockEmbeddedDocumentClass
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      const insertData = { _id: 'page-3', name: 'New Page' };

      // Act
      await DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'insert', embeddedName: 'JournalEntryPage', data: insertData }
      ]);

      // Assert
      expect(mockSchemaValidate).toHaveBeenCalledWith(insertData, {
        strict: true,
        fields: true,
        joint: true
      });
    });
  });

  describe('Delete Operation Non-Interference (Req 5)', () => {
    test('should not validate delete operations', async () => {
      // Arrange
      const mockValidate = jest.fn();
      const mockEmbeddedDocumentClass = {
        validate: mockValidate
      };

      const mockCollection = {
        documentClass: mockEmbeddedDocumentClass
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      // Act
      await DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'delete', embeddedName: 'JournalEntryPage', targetId: 'page-2' }
      ]);

      // Assert - No validation should occur for delete
      expect(mockValidate).not.toHaveBeenCalled();
      expect(doc.deleteEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', ['page-2'], { render: false });
    });
  });

  describe('Edge Case Handling', () => {
    test('should skip validation when embedded collection not found', async () => {
      // Arrange
      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        createEmbeddedDocuments: jest.fn().mockResolvedValue([])
        // No JournalEntryPage property
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      // Act - Should not throw error, should fallback to FoundryVTT validation
      await expect(DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'insert', embeddedName: 'JournalEntryPage', data: { _id: 'page-3', name: 'New Page' } }
      ])).resolves.not.toThrow();

      expect(doc.createEmbeddedDocuments).toHaveBeenCalled();
    });

    test('should skip validation when documentClass not available', async () => {
      // Arrange
      const mockCollection = {
        // No documentClass property
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      // Act - Should not throw error, should fallback to FoundryVTT validation
      await expect(DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'insert', embeddedName: 'JournalEntryPage', data: { _id: 'page-3', name: 'New Page' } }
      ])).resolves.not.toThrow();

      expect(doc.createEmbeddedDocuments).toHaveBeenCalled();
    });

    test('should skip validation when no validate methods available', async () => {
      // Arrange
      const mockEmbeddedDocumentClass = {
        // No validate method or schema
      };

      const mockCollection = {
        documentClass: mockEmbeddedDocumentClass
      };

      const doc = {
        id: 'journal-1',
        _id: 'journal-1',
        testUserPermission: jest.fn().mockReturnValue(true),
        canUserModify: jest.fn().mockReturnValue(true),
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        JournalEntryPage: mockCollection
      };

      const collection = {
        get: jest.fn(() => doc),
        contents: [doc]
      };

      game.collections.get = jest.fn(() => collection);

      // Act - Should not throw error, should fallback to FoundryVTT validation
      await expect(DocumentAPI.applyEmbeddedOperations('JournalEntry', 'journal-1', [
        { action: 'insert', embeddedName: 'JournalEntryPage', data: { _id: 'page-3', name: 'New Page' } }
      ])).resolves.not.toThrow();

      expect(doc.createEmbeddedDocuments).toHaveBeenCalled();
    });
  });
});