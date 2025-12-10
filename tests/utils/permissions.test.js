// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { PermissionManager } from '../../scripts/utils/permissions.js';
import {
  setupMockFoundryEnvironment,
  cleanupMockEnvironment,
  setupMockPermissions,
  createParameterizedSystemTests
} from '../helpers/mock-setup.js';

// Setup FoundryVTT constants
function setupConstants() {
  global.CONST = {
    USER_ROLES: {
      PLAYER: 1,
      TRUSTED: 2,
      ASSISTANT: 3,
      GAMEMASTER: 4,
    },
    DOCUMENT_OWNERSHIP_LEVELS: {
      NONE: 0,
      LIMITED: 1,
      OBSERVER: 2,
      OWNER: 3,
    },
  };
}

// Parameterized permission tests across all game systems
describe.each(createParameterizedSystemTests())(
  'PermissionManager - canListDocuments with %s system',
  (systemName, systemConfig) => {
    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      setupConstants();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    test('GM should always be able to list documents', () => {
      setupMockPermissions('gm');
      const documentTypes = Object.keys(systemConfig.documentTypes);

      documentTypes.forEach(docType => {
        expect(PermissionManager.canListDocuments(global.game.user, docType)).toBe(true);
      });
    });

    test('Player should be able to list documents if they have permission', () => {
      setupMockPermissions('player');
      const documentTypes = Object.keys(systemConfig.documentTypes);

      documentTypes.forEach(docType => {
        // Players can typically list documents (viewing is usually allowed)
        expect(PermissionManager.canListDocuments(global.game.user, docType)).toBe(true);
      });
    });

    test('Observer should be able to list documents', () => {
      setupMockPermissions('observer');
      const documentTypes = Object.keys(systemConfig.documentTypes);

      documentTypes.forEach(docType => {
        expect(PermissionManager.canListDocuments(global.game.user, docType)).toBe(true);
      });
    });

    test('should handle systems with no document types', () => {
      if (Object.keys(systemConfig.documentTypes).length === 0) {
        setupMockPermissions('gm');
        // Even GMs shouldn't be able to list non-existent document types
        expect(PermissionManager.canListDocuments(global.game.user, 'NonExistentType')).toBe(false);
      }
    });
  }
);

// Parameterized document read permission tests
describe.each(createParameterizedSystemTests())(
  'PermissionManager - canReadDocument with %s system',
  (systemName, systemConfig) => {
    let mockDocument;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      setupConstants();

      // Create mock document using first available document type
      const documentTypes = Object.keys(systemConfig.documentTypes);
      const docType = documentTypes.length > 0 ? documentTypes[0] : 'TestDoc';

      mockDocument = {
        _id: 'test-doc-id',
        documentName: docType,
        name: 'Test Document',
        canUserModify: jest.fn(),
        testUserPermission: jest.fn()
      };
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    test('GM should always be able to read any document', () => {
      const mockPermissions = setupMockPermissions('gm');
      mockDocument.canUserModify = mockPermissions.canUserModify;
      mockDocument.testUserPermission = mockPermissions;

      expect(PermissionManager.canReadDocument(global.game.user, mockDocument)).toBe(true);
    });

    test('Player should be able to read documents they have permission for', () => {
      const mockCanModify = setupMockPermissions('player', { read: true });
      mockDocument.canUserModify = mockCanModify;
      mockDocument.testUserPermission = mockCanModify;

      expect(PermissionManager.canReadDocument(global.game.user, mockDocument)).toBe(true);
    });

    test('Player should not be able to read restricted documents', () => {
      const mockCanModify = setupMockPermissions('player', { read: false });
      mockDocument.canUserModify = mockCanModify;
      mockDocument.testUserPermission = mockCanModify;

      expect(PermissionManager.canReadDocument(global.game.user, mockDocument)).toBe(false);
    });

    test('Observer should be able to read documents', () => {
      const mockCanModify = setupMockPermissions('observer', { read: true });
      mockDocument.canUserModify = mockCanModify;
      mockDocument.testUserPermission = mockCanModify;

      expect(PermissionManager.canReadDocument(global.game.user, mockDocument)).toBe(true);
    });
  }
);

// Parameterized document creation permission tests
describe.each(createParameterizedSystemTests())(
  'PermissionManager - canCreateDocument with %s system',
  (systemName, systemConfig) => {
    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      setupConstants();
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    test('GM should always be able to create documents', () => {
      setupMockPermissions('gm');
      const documentTypes = Object.keys(systemConfig.documentTypes);

      documentTypes.forEach(docType => {
        expect(PermissionManager.canCreateDocument(global.game.user, docType, {})).toBe(true);
      });
    });

    test('Player creation permissions should be configurable', () => {
      setupMockPermissions('player', { create: true });
      const documentTypes = Object.keys(systemConfig.documentTypes);

      documentTypes.forEach(docType => {
        expect(PermissionManager.canCreateDocument(global.game.user, docType, {})).toBe(true);
      });
    });

    test('Player should not be able to create documents when restricted', () => {
      setupMockPermissions('player', { create: false });
      const documentTypes = Object.keys(systemConfig.documentTypes);

      documentTypes.forEach(docType => {
        expect(PermissionManager.canCreateDocument(global.game.user, docType, {})).toBe(false);
      });
    });

    test('Observer should not be able to create documents', () => {
      setupMockPermissions('observer');
      const documentTypes = Object.keys(systemConfig.documentTypes);

      documentTypes.forEach(docType => {
        expect(PermissionManager.canCreateDocument(global.game.user, docType, {})).toBe(false);
      });
    });
  }
);

// Parameterized document update permission tests
describe.each(createParameterizedSystemTests())(
  'PermissionManager - canUpdateDocument with %s system',
  (systemName, systemConfig) => {
    let mockDocument;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      setupConstants();

      const documentTypes = Object.keys(systemConfig.documentTypes);
      const docType = documentTypes.length > 0 ? documentTypes[0] : 'TestDoc';

      mockDocument = {
        _id: 'test-doc-id',
        documentName: docType,
        name: 'Test Document',
        canUserModify: jest.fn(),
        testUserPermission: jest.fn()
      };
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    test('GM should always be able to update any document', () => {
      const mockPermissions = setupMockPermissions('gm');
      mockDocument.canUserModify = mockPermissions.canUserModify;
      mockDocument.testUserPermission = mockPermissions;

      expect(PermissionManager.canUpdateDocument(global.game.user, mockDocument, {})).toBe(true);
    });

    test('Player should be able to update documents they own', () => {
      const mockPermissions = setupMockPermissions('player', { update: true });
      mockDocument.canUserModify = mockPermissions.canUserModify;
      mockDocument.testUserPermission = mockPermissions;

      expect(PermissionManager.canUpdateDocument(global.game.user, mockDocument, {})).toBe(true);
    });

    test('Player should not be able to update documents they do not own', () => {
      const mockPermissions = setupMockPermissions('player', { update: false });
      mockDocument.canUserModify = mockPermissions.canUserModify;
      mockDocument.testUserPermission = mockPermissions;

      expect(PermissionManager.canUpdateDocument(global.game.user, mockDocument, {})).toBe(false);
    });

    test('Observer should not be able to update documents', () => {
      const mockCanModify = setupMockPermissions('observer', { update: false });
      mockDocument.canUserModify = mockCanModify;
      mockDocument.testUserPermission = mockCanModify;

      expect(PermissionManager.canUpdateDocument(global.game.user, mockDocument, {})).toBe(false);
    });
  }
);

// Parameterized document deletion permission tests
describe.each(createParameterizedSystemTests())(
  'PermissionManager - canDeleteDocument with %s system',
  (systemName, systemConfig) => {
    let mockDocument;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      setupConstants();

      const documentTypes = Object.keys(systemConfig.documentTypes);
      const docType = documentTypes.length > 0 ? documentTypes[0] : 'TestDoc';

      mockDocument = {
        _id: 'test-doc-id',
        documentName: docType,
        name: 'Test Document',
        canUserModify: jest.fn()
      };
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    test('GM should always be able to delete any document', () => {
      const mockPermissions = setupMockPermissions('gm');
      mockDocument.canUserModify = mockPermissions.canUserModify;
      mockDocument.testUserPermission = mockPermissions;

      expect(PermissionManager.canDeleteDocument(global.game.user, mockDocument)).toBe(true);
    });

    test('Player deletion permissions should be configurable', () => {
      const mockPermissions = setupMockPermissions('player', { delete: true });
      mockDocument.canUserModify = mockPermissions.canUserModify;
      mockDocument.testUserPermission = mockPermissions;

      expect(PermissionManager.canDeleteDocument(global.game.user, mockDocument)).toBe(true);
    });

    test('Player should not be able to delete documents by default', () => {
      const mockPermissions = setupMockPermissions('player', { delete: false });
      mockDocument.canUserModify = mockPermissions.canUserModify;
      mockDocument.testUserPermission = mockPermissions;

      expect(PermissionManager.canDeleteDocument(global.game.user, mockDocument)).toBe(false);
    });

    test('Observer should not be able to delete documents', () => {
      const mockPermissions = setupMockPermissions('observer');
      mockDocument.canUserModify = mockPermissions.canUserModify;
      mockDocument.testUserPermission = mockPermissions;

      expect(PermissionManager.canDeleteDocument(global.game.user, mockDocument)).toBe(false);
    });
  }
);

// Parameterized document filtering tests
describe.each(createParameterizedSystemTests())(
  'PermissionManager - filterByPermission with %s system',
  (systemName, systemConfig) => {
    let documents;

    beforeEach(() => {
      setupMockFoundryEnvironment(systemName);
      setupConstants();

      // Create test documents using available document types
      const documentTypes = Object.keys(systemConfig.documentTypes);
      documents = documentTypes.slice(0, 3).map((docType, index) => ({
        _id: `doc${index + 1}`,
        documentName: docType,
        name: `Test ${docType} ${index + 1}`,
        canUserModify: jest.fn()
      }));
    });

    afterEach(() => {
      cleanupMockEnvironment();
    });

    test('GM should see all documents', async () => {
      const mockCanModify = setupMockPermissions('gm');
      documents.forEach(doc => {
        doc.canUserModify = mockCanModify;
        doc.testUserPermission = mockCanModify; // Add the missing method
      });

      const filtered = await PermissionManager.filterByPermission(global.game.user, documents, 'READ');
      expect(filtered.length).toBe(documents.length);
    });

    test('Player should only see documents they have permission for', async () => {
      const mockCanModify = setupMockPermissions('player');

      // Set up mixed permissions
      documents.forEach((doc, index) => {
        const hasPermission = index % 2 === 0; // Every other document
        doc.canUserModify = jest.fn().mockReturnValue(hasPermission);
        doc.testUserPermission = jest.fn().mockReturnValue(hasPermission);
      });

      const filtered = await PermissionManager.filterByPermission(global.game.user, documents, 'READ');
      const expectedCount = Math.ceil(documents.length / 2);
      expect(filtered.length).toBe(expectedCount);
    });

    test('should return empty array if no documents are provided', async () => {
      setupMockPermissions('player');
      const filtered = await PermissionManager.filterByPermission(global.game.user, [], 'READ');
      expect(filtered).toEqual([]);
    });

    test('should handle permission checking errors gracefully', async () => {
      setupMockPermissions('player');

      // Mock one document to throw an error during permission check
      if (documents.length > 0) {
        documents[0].canUserModify = jest.fn().mockImplementation(() => {
          throw new Error('Permission check failed');
        });
        documents[0].testUserPermission = jest.fn().mockImplementation(() => {
          throw new Error('Permission check failed');
        });

        const filtered = await PermissionManager.filterByPermission(global.game.user, documents, 'READ');
        // Should continue processing other documents despite the error
        expect(Array.isArray(filtered)).toBe(true);
      }
    });
  }
);