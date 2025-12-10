/**
 * ChatHandler Tests
 * Tests for Task-09 (Consolidated AI Response) helper methods
 */

// Mock minimal globals for ChatHandler
global.game = {
    user: { id: 'test-user', name: 'Test User', isGM: false },
    i18n: { localize: (k) => k }
};

global.Hooks = {
    call: jest.fn(() => true),
    callAll: jest.fn()
};

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

// Mock ConversationManager
const mockConversationManager = {
    messages: [],
    addMessage: jest.fn(),
    getMessages: jest.fn(() => []),
    clear: jest.fn()
};

describe('ChatHandler', () => {
    let ChatHandler;

    beforeAll(async () => {
        const module = await import('../../scripts/core/chat-handler.js');
        ChatHandler = module.ChatHandler;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockConversationManager.messages = [];
    });

    describe('_formatToolCallDisplay (Task-09)', () => {
        let handler;

        beforeEach(() => {
            handler = new ChatHandler(mockConversationManager);
        });

        it('should format successful tool call with success icon', () => {
            const toolResult = {
                toolName: 'document-create',
                content: '{"name": "Test Actor", "type": "Actor"}',
                isError: false
            };

            const html = handler._formatToolCallDisplay(toolResult);

            expect(html).toContain('tool-success');
            expect(html).toContain('fa-circle-check');
            expect(html).toContain('Created');
        });

        it('should format failed tool call with failure icon', () => {
            const toolResult = {
                toolName: 'document-read',
                content: 'Error: Document not found',
                isError: true
            };

            const html = handler._formatToolCallDisplay(toolResult);

            expect(html).toContain('tool-failure');
            expect(html).toContain('fa-triangle-exclamation');
            expect(html).toContain('Read');
        });

        it('should extract document name from content', () => {
            const toolResult = {
                toolName: 'document-create',
                content: '{"name": "Goblin King", "type": "Actor"}',
                isError: false
            };

            const html = handler._formatToolCallDisplay(toolResult);

            expect(html).toContain('Goblin King');
            expect(html).toContain('tool-document');
        });
    });

    describe('_getToolActionText (Task-09)', () => {
        let handler;

        beforeEach(() => {
            handler = new ChatHandler(mockConversationManager);
        });

        it('should return correct action text for document-create', () => {
            const result = handler._getToolActionText('document-create', {});
            expect(result).toBe('Created');
        });

        it('should return correct action text for document-read', () => {
            const result = handler._getToolActionText('document-read', {});
            expect(result).toBe('Read');
        });

        it('should return correct action text for document-update', () => {
            const result = handler._getToolActionText('document-update', {});
            expect(result).toBe('Updated');
        });

        it('should return correct action text for document-delete', () => {
            const result = handler._getToolActionText('document-delete', {});
            expect(result).toBe('Deleted');
        });

        it('should include document type when provided', () => {
            const result = handler._getToolActionText('document-create', { documentType: 'Actor' });
            expect(result).toBe('Created Actor');
        });

        it('should handle unknown tools by converting name', () => {
            const result = handler._getToolActionText('custom-tool', {});
            expect(result).toBe('custom tool');
        });
    });

    describe('_extractDocumentInfo (Task-09)', () => {
        let handler;

        beforeEach(() => {
            handler = new ChatHandler(mockConversationManager);
        });

        it('should extract name from JSON content', () => {
            const result = handler._extractDocumentInfo({
                content: '{"name": "Dragon Slayer", "type": "Item"}'
            });
            expect(result).toBe('Dragon Slayer');
        });

        it('should return null for content without name', () => {
            const result = handler._extractDocumentInfo({
                content: '{"type": "Item"}'
            });
            expect(result).toBeNull();
        });

        it('should return null for empty content', () => {
            const result = handler._extractDocumentInfo({
                content: ''
            });
            expect(result).toBeNull();
        });
    });
});
