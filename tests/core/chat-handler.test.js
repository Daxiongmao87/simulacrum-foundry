/**
 * ChatHandler Tests
 * Tests for Task-09 (Consolidated AI Response) helper methods
 */

// Mock minimal globals for ChatHandler
global.game = {
    user: { id: 'test-user', name: 'Test User', isGM: false },
    i18n: { localize: (k) => k },
    settings: { get: jest.fn(() => false) }
};

global.ui = {
    notifications: { error: jest.fn() }
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

// Mock ConversationEngine
jest.mock('../../scripts/core/conversation-engine.js', () => ({
    ConversationEngine: jest.fn().mockImplementation(() => ({
        processTurn: jest.fn().mockResolvedValue({ content: 'AI response', role: 'assistant' })
    }))
}));

// Mock ConversationManager
const mockConversationManager = {
    messages: [],
    addMessage: jest.fn(),
    getMessages: jest.fn(() => []),
    clear: jest.fn(),
    updateSystemMessage: jest.fn()
};

describe('ChatHandler', () => {
    let ChatHandler;
    let handler;

    beforeAll(async () => {
        const module = await import('../../scripts/core/chat-handler.js');
        ChatHandler = module.ChatHandler;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockConversationManager.messages = [];
        handler = new ChatHandler(mockConversationManager);
    });

    describe('processUserMessage', () => {
        it('should add user message to conversation', async () => {
            const addSpy = jest.spyOn(handler, 'addMessageToConversation');
            await handler.processUserMessage('Hello AI', { id: 'user1' });
            expect(addSpy).toHaveBeenCalledWith('user', 'Hello AI');
        });

        it('should call onUserMessage callback when provided', async () => {
            const onUserMessage = jest.fn();
            await handler.processUserMessage('Hello', { id: 'user1' }, { onUserMessage });
            expect(onUserMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', content: 'Hello' }));
        });

        it('should handle cancellation errors', async () => {
            const addUISpy = jest.spyOn(handler, 'addMessageToUI').mockImplementation(() => { });
            jest.spyOn(handler, 'addMessageToConversation').mockImplementation(() => {
                const err = new Error('Process was cancelled');
                err.name = 'AbortError';
                throw err;
            });

            const result = await handler.processUserMessage('test', {});
            expect(result.content).toContain('cancelled');
        });

        it('should handle general errors', async () => {
            jest.spyOn(handler, 'addMessageToConversation').mockImplementation(() => {
                throw new Error('Network error');
            });

            const result = await handler.processUserMessage('test', {});
            expect(result.error).toBeDefined();
        });
    });

    describe('handleAIResponse', () => {
        it('should add assistant response to conversation and UI', async () => {
            const addConvSpy = jest.spyOn(handler, 'addMessageToConversation');
            const addUISpy = jest.spyOn(handler, 'addMessageToUI').mockImplementation(() => { });
            jest.spyOn(handler, 'handleAutonomousFlow').mockResolvedValue({ content: 'done' });

            await handler.handleAIResponse({ content: 'AI reply', toolCalls: null });

            expect(addConvSpy).toHaveBeenCalledWith('assistant', 'AI reply', null);
            expect(addUISpy).toHaveBeenCalled();
        });

        it('should handle parse errors', async () => {
            const parseErrorSpy = jest.spyOn(handler, 'handleParseError').mockResolvedValue({ content: 'fixed' });

            await handler.handleAIResponse({ _parseError: true, content: 'bad' });

            expect(parseErrorSpy).toHaveBeenCalled();
        });

        it('should execute tools when present', async () => {
            const toolExecSpy = jest.spyOn(handler, 'handleToolExecution').mockResolvedValue({ content: 'done' });
            jest.spyOn(handler, 'addMessageToConversation');
            jest.spyOn(handler, 'addMessageToUI').mockImplementation(() => { });

            await handler.handleAIResponse({
                content: 'Using tool',
                toolCalls: [{ name: 'test' }]
            });

            expect(toolExecSpy).toHaveBeenCalled();
        });
    });

    describe('handleToolExecution', () => {
        it('should handle tool execution errors', async () => {
            jest.spyOn(handler, '_executeToolLoop').mockRejectedValue(new Error('Tool failed'));
            const addConvSpy = jest.spyOn(handler, 'addMessageToConversation');
            jest.spyOn(handler, 'addMessageToUI').mockImplementation(() => { });

            const result = await handler.handleToolExecution({ content: 'test' }, {});

            expect(result.content).toContain('Tool execution error');
            expect(addConvSpy).toHaveBeenCalled();
        });
    });

    describe('_formatToolCallDisplay (Task-09)', () => {
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

    describe('handleToolResult', () => {
        it('should add tool result to conversation when role is tool', () => {
            const addConvSpy = jest.spyOn(handler, 'addMessageToConversation');
            handler.handleToolResult({ role: 'tool', content: 'result', toolCallId: '123' }, {});
            expect(addConvSpy).toHaveBeenCalledWith('tool', 'result', null, '123');
        });

        it('should add assistant messages to conversation', () => {
            const addConvSpy = jest.spyOn(handler, 'addMessageToConversation');
            jest.spyOn(handler, 'addMessageToUI').mockImplementation(() => { });
            handler.handleToolResult({ role: 'assistant', content: 'AI reply' }, {});
            expect(addConvSpy).toHaveBeenCalledWith('assistant', 'AI reply');
        });
    });
});

