/**
 * Tests for correction.js
 */
import { appendEmptyContentCorrection, appendToolFailureCorrection } from '../../scripts/core/correction.js';

describe('appendEmptyContentCorrection', () => {
    let mockConversationManager;

    beforeEach(() => {
        mockConversationManager = {
            addMessage: jest.fn()
        };
    });

    it('should do nothing when conversationManager is null', () => {
        appendEmptyContentCorrection(null, {});
        // No error should occur
    });

    it('should add assistant and system messages', () => {
        appendEmptyContentCorrection(mockConversationManager, {
            content: 'Empty response error'
        });

        expect(mockConversationManager.addMessage).toHaveBeenCalledTimes(2);
        expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
            'assistant',
            expect.stringContaining('No valid response'),
            undefined
        );
        expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
            'system',
            expect.stringContaining('natural-language content')
        );
    });

    it('should preserve tool_calls from raw response', () => {
        const toolCalls = [{ id: '1', function: { name: 'test' } }];
        appendEmptyContentCorrection(mockConversationManager, {
            raw: {
                choices: [{ message: { role: 'assistant', content: null, tool_calls: toolCalls } }]
            },
            content: 'Error'
        });

        expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
            'assistant',
            expect.any(String),
            toolCalls
        );
    });

    it('should fallback to errorResponse.toolCalls when raw is missing', () => {
        const toolCalls = [{ id: '2', function: { name: 'fallback' } }];
        appendEmptyContentCorrection(mockConversationManager, {
            toolCalls,
            content: 'Error'
        });

        expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
            'assistant',
            expect.any(String),
            toolCalls
        );
    });
});

describe('appendToolFailureCorrection', () => {
    let mockConversationManager;

    beforeEach(() => {
        mockConversationManager = {
            addMessage: jest.fn()
        };
    });

    it('should do nothing when conversationManager is null', () => {
        appendToolFailureCorrection(null, {});
        // No error should occur
    });

    it('should add assistant and system messages', () => {
        appendToolFailureCorrection(mockConversationManager, {});

        expect(mockConversationManager.addMessage).toHaveBeenCalledTimes(2);
        expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
            'assistant',
            expect.stringContaining('tool call failed')
        );
        expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
            'system',
            expect.stringContaining('invalid or malformed arguments')
        );
    });

    it('should include function name when available from candidates', () => {
        appendToolFailureCorrection(mockConversationManager, {
            _originalResponse: {
                candidates: [
                    {
                        content: {
                            parts: [
                                { functionCall: { name: 'read_document' } }
                            ]
                        }
                    }
                ]
            }
        });

        expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
            'assistant',
            expect.stringContaining('read_document')
        );
    });

    it('should handle missing functionCall gracefully', () => {
        appendToolFailureCorrection(mockConversationManager, {
            _originalResponse: {
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Just text' }]
                        }
                    }
                ]
            }
        });

        expect(mockConversationManager.addMessage).toHaveBeenCalledWith(
            'assistant',
            expect.stringContaining('failed because the provider reported malformed arguments')
        );
    });
});
