// SPDX-License-Identifier: MIT
import { DocumentAPI } from '../../scripts/core/document-api.js';
import { setupMockFoundryEnvironment, cleanupMockEnvironment, setupMockPermissions } from '../helpers/mock-setup.js';

describe('DocumentAPI branch coverage', () => {
  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    // Stabilize collections so permission mocks apply to fetched docs
    const originalGet = global.game.collections.get;
    const cache = new Map();
    global.game.collections.get = jest.fn((type) => {
      if (!cache.has(type)) cache.set(type, originalGet(type));
      return cache.get(type);
    });
  });

  afterEach(() => cleanupMockEnvironment());

  test('listDocuments filters to empty when read permission denied', async () => {
    setupMockPermissions('player', { read: false });
    const list = await DocumentAPI.listDocuments('Actor', { filters: { name: 'Test' }, permission: 'READ' });
    expect(list).toEqual([]);
  });

  test('getDocument throws when read permission denied', async () => {
    setupMockPermissions('player', { read: false });
    await expect(DocumentAPI.getDocument('Actor', 'actor1')).rejects.toThrow('Permission denied');
  });

  test('updateDocument throws when owner permission denied', async () => {
    setupMockPermissions('player', { update: false, owner: false });
    await expect(DocumentAPI.updateDocument('Actor', 'actor1', { name: 'Nope' })).rejects.toThrow('Permission denied');
  });

  test('deleteDocument throws when owner permission denied', async () => {
    setupMockPermissions('player', { delete: false, owner: false });
    await expect(DocumentAPI.deleteDocument('Actor', 'actor1')).rejects.toThrow('Permission denied');
  });
});

