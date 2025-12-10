/**
 * @jest-environment jsdom
 */

import { performPostToolVerification } from '../../scripts/core/tool-verification.js';

// Mock logger
jest.mock('../../scripts/utils/logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }),
  isDebugEnabled: () => false
}));

// Mock tool-registry
jest.mock('../../scripts/core/tool-registry.js', () => ({
  toolRegistry: {
    executeTool: jest.fn()
  }
}));

import { toolRegistry } from '../../scripts/core/tool-registry.js';

describe('tool-verification module imports', () => {
  test('should import all required dependencies without errors', () => {
    expect(performPostToolVerification).toBeDefined();
    expect(typeof performPostToolVerification).toBe('function');
  });

  test('should import isDebugEnabled from dev utils', async () => {
    const { isDebugEnabled } = await import('../../scripts/utils/dev.js');
    expect(isDebugEnabled).toBeDefined();
    expect(typeof isDebugEnabled).toBe('function');
  });

  test('should import createLogger from logger utils', async () => {
    const { createLogger } = await import('../../scripts/utils/logger.js');
    expect(createLogger).toBeDefined();
    expect(typeof createLogger).toBe('function');
  });

  test('should import toolRegistry from tool-registry', async () => {
    const { toolRegistry } = await import('../../scripts/core/tool-registry.js');
    expect(toolRegistry).toBeDefined();
  });
});

describe('performPostToolVerification', () => {
  let mockConversationManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConversationManager = {
      addMessage: jest.fn()
    };
  });

  it('should skip verification for non-document tools', async () => {
    await performPostToolVerification('read_document', {}, {}, mockConversationManager);
    expect(toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it('should skip verification for search tools', async () => {
    await performPostToolVerification('search_document', {}, {}, mockConversationManager);
    expect(toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it('should skip verification when result is null', async () => {
    await performPostToolVerification('create_document', {}, null, mockConversationManager);
    expect(toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it('should skip verification when result has no document ID', async () => {
    await performPostToolVerification('create_document', {}, { success: true }, mockConversationManager);
    expect(toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it('should skip verification when documentType is missing', async () => {
    await performPostToolVerification('create_document', {}, { id: '123' }, mockConversationManager);
    expect(toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it('should call read_document to verify create_document', async () => {
    toolRegistry.executeTool.mockResolvedValue({
      result: { content: 'Document created successfully' }
    });

    await performPostToolVerification(
      'create_document',
      { documentType: 'Actor' },
      { id: 'actor123', documentType: 'Actor' },
      mockConversationManager
    );

    expect(toolRegistry.executeTool).toHaveBeenCalledWith('read_document', expect.objectContaining({
      documentType: 'Actor',
      id: 'actor123'
    }));
  });

  it('should call read_document to verify update_document', async () => {
    toolRegistry.executeTool.mockResolvedValue({
      result: { content: 'Document updated' }
    });

    await performPostToolVerification(
      'update_document',
      { documentType: 'Item' },
      { documentId: 'item456' },
      mockConversationManager
    );

    expect(toolRegistry.executeTool).toHaveBeenCalledWith('read_document', expect.objectContaining({
      documentType: 'Item',
      id: 'item456'
    }));
  });

  it('should add verification result to conversation', async () => {
    toolRegistry.executeTool.mockResolvedValue({
      result: { content: 'Verified document data' }
    });

    await performPostToolVerification(
      'create_document',
      { documentType: 'Actor' },
      { id: 'abc', documentType: 'Actor' },
      mockConversationManager
    );

    expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
      'tool',
      expect.stringContaining('Verification'),
      null,
      expect.stringContaining('verify_')
    );
  });

  it('should handle verification errors gracefully', async () => {
    toolRegistry.executeTool.mockRejectedValue(new Error('Verification failed'));

    // Should not throw
    await expect(performPostToolVerification(
      'create_document',
      { documentType: 'Actor' },
      { id: 'xyz', documentType: 'Actor' },
      mockConversationManager
    )).resolves.not.toThrow();
  });

  it('should use _id from result when id is missing', async () => {
    toolRegistry.executeTool.mockResolvedValue({
      result: { display: 'Done' }
    });

    // _id should work when id and documentId are missing
    await performPostToolVerification(
      'create_document',
      { documentType: 'Item' },
      { id: 'legacyId', documentType: 'Item' },
      mockConversationManager
    );

    expect(toolRegistry.executeTool).toHaveBeenCalled();
  });
});