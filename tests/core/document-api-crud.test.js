// SPDX-License-Identifier: MIT
// DocumentAPI CRUD/Search tests (MVP minimal behaviors)

import { DocumentAPI } from '../../scripts/core/document-api.js';
import { setupMockFoundryEnvironment, cleanupMockEnvironment, setupMockPermissions } from '../helpers/mock-setup.js';

describe('DocumentAPI CRUD/Search', () => {
  beforeEach(() => {
    setupMockFoundryEnvironment('D&D 5e');
    // Stabilize collections across calls so permission mocks attach consistently
    const originalGet = global.game.collections.get;
    const cache = new Map();
    global.game.collections.get = jest.fn((type) => {
      if (!cache.has(type)) cache.set(type, originalGet(type));
      return cache.get(type);
    });
    // Apply permission mocks after stabilizing collections
    setupMockPermissions('gm');
  });

  afterEach(() => {
    cleanupMockEnvironment();
  });

  test('listDocuments filters and respects permissions', async () => {
    const list = await DocumentAPI.listDocuments('Actor', {
      filters: { name: 'Test Actor 1' },
      permission: 'READ',
    });
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
    expect(list[0].name).toMatch(/Test Actor 1/);
  });

  test('getDocument returns object and checks read permission', async () => {
    const doc = await DocumentAPI.getDocument('Actor', 'actor1');
    expect(doc).toHaveProperty('_id', 'actor1');
    expect(doc).toHaveProperty('name');
  });

  test('createDocument returns created object (mock-friendly)', async () => {
    const created = await DocumentAPI.createDocument('Actor', { name: 'New Actor' });
    expect(created).toHaveProperty('_id');
    expect(created).toHaveProperty('name', 'New Actor');
  });

  test('createDocument succeeds when document class lacks validate helper', async () => {
    const actorClass = CONFIG.Actor.documentClass;
    const originalCreate = actorClass.create;

    actorClass.create = jest.fn().mockResolvedValue({
      toObject: () => ({ _id: 'actor-created', name: 'Created Actor' })
    });

    const created = await DocumentAPI.createDocument('Actor', { name: 'Created Actor' });

    expect(actorClass.create).toHaveBeenCalledWith({ name: 'Created Actor' }, { folder: undefined });
    expect(created).toHaveProperty('_id', 'actor-created');
    expect(created).toHaveProperty('name', 'Created Actor');

    actorClass.create = originalCreate;
  });

  test('updateDocument applies updates and requires owner permission', async () => {
    const updated = await DocumentAPI.updateDocument('Actor', 'actor2', { name: 'Updated Name' });
    expect(updated).toHaveProperty('_id', 'actor2');
    expect(updated).toHaveProperty('name', 'Updated Name');
  });

  test('updateDocument closes rendered sheet and restores it afterwards', async () => {
    const collection = game.collections.get('Actor');
    const doc = collection.get('actor2');
    doc.sheet = {
      rendered: true,
      close: jest.fn().mockResolvedValue(undefined),
      render: jest.fn().mockResolvedValue(undefined)
    };
    doc.update = jest.fn().mockResolvedValue({});
    collection.get = jest.fn(() => doc);

    await DocumentAPI.updateDocument('Actor', 'actor2', { name: 'Updated Again' });

    expect(doc.sheet.close).toHaveBeenCalledTimes(1);
    expect(doc.sheet.render).toHaveBeenCalledWith(true);
  });

  test('updateDocument reopens sheet even when update fails', async () => {
    const collection = game.collections.get('Actor');
    const doc = collection.get('actor2');
    doc.sheet = {
      rendered: true,
      close: jest.fn().mockResolvedValue(undefined),
      render: jest.fn().mockResolvedValue(undefined)
    };
    doc.update = jest.fn().mockRejectedValue(new Error('Update failed'));
    collection.get = jest.fn(() => doc);

    await expect(DocumentAPI.updateDocument('Actor', 'actor2', { name: 'Broken' }))
      .rejects.toThrow('Document update failed: Update failed');

    expect(doc.sheet.close).toHaveBeenCalledTimes(1);
    expect(doc.sheet.render).toHaveBeenCalledWith(true);
  });

  test('updateDocument does not close sheet when not rendered', async () => {
    const collection = game.collections.get('Actor');
    const doc = collection.get('actor2');
    doc.sheet = {
      rendered: false,
      close: jest.fn(),
      render: jest.fn()
    };
    doc.update = jest.fn().mockResolvedValue({});
    collection.get = jest.fn(() => doc);

    await DocumentAPI.updateDocument('Actor', 'actor2', { name: 'No Close' });

    expect(doc.sheet.close).not.toHaveBeenCalled();
    expect(doc.sheet.render).not.toHaveBeenCalled();
  });

  test('deleteDocument deletes and returns true', async () => {
    const ok = await DocumentAPI.deleteDocument('Actor', 'actor3');
    expect(ok).toBe(true);
  });

  test('deleteDocument closes rendered sheet before deletion', async () => {
    const collection = game.collections.get('Actor');
    const doc = collection.get('actor3');
    doc.sheet = {
      rendered: true,
      close: jest.fn().mockResolvedValue(undefined),
      render: jest.fn()
    };
    doc.delete = jest.fn().mockResolvedValue({});
    collection.get = jest.fn(() => doc);

    const result = await DocumentAPI.deleteDocument('Actor', 'actor3');

    expect(result).toBe(true);
    expect(doc.sheet.close).toHaveBeenCalledTimes(1);
    expect(doc.sheet.render).not.toHaveBeenCalled();
  });

  test('searchDocuments matches on fields with maxResults', async () => {
    const results = await DocumentAPI.searchDocuments({
      types: ['Actor'],
      query: 'Test Actor',
      fields: ['name'],
      maxResults: 2,
    });
    expect(results.length).toBeLessThanOrEqual(2);
    expect(results[0]).toHaveProperty('type', 'Actor');
    expect(results[0]).toHaveProperty('_id');
  });

  test('permission denied surfaces errors', async () => {
    // Demote user and deny read
    setupMockPermissions('player', { read: false });
    await expect(DocumentAPI.getDocument('Actor', 'actor1')).rejects.toThrow('Permission denied');
  });

  test('listDocuments supports sort and limit', async () => {
    const asc = await DocumentAPI.listDocuments('Actor', { sort: { name: 'asc' }, limit: 2 });
    expect(asc.length).toBe(2);
    const desc = await DocumentAPI.listDocuments('Actor', { sort: { name: 'desc' }, limit: 1 });
    expect(desc.length).toBe(1);
  });

  test('listDocuments with null filter value does not filter out', async () => {
    const list = await DocumentAPI.listDocuments('Actor', { filters: { name: null } });
    expect(list.length).toBeGreaterThan(0);
  });

  test('createDocument rejects for invalid type; get/update/delete handle mock defaults', async () => {
    await expect(DocumentAPI.createDocument('InvalidType', {})).rejects.toThrow('Unknown document type');
    // In mock, collections always return a document; ensure update merges
    const updated = await DocumentAPI.updateDocument('Actor', 'missing', { name: 'x' });
    expect(updated).toHaveProperty('name', 'x');
    const deleted = await DocumentAPI.deleteDocument('Actor', 'missing');
    expect(deleted).toBe(true);
  });

  // Covered by previous test with mock behavior

  test('searchDocuments defaults to all types when types not provided', async () => {
    const results = await DocumentAPI.searchDocuments({ query: 'Test' });
    expect(Array.isArray(results)).toBe(true);
  });
});
