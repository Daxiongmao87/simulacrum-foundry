/**
 * Tests for hook-manager.js
 */
import {
    SimulacrumHooks,
    emitHook,
    emitProcessStatus,
    emitProcessCancelled,
    emitRetryStatus,
    emitDocumentChanged,
    emitToolExecuted,
    emitErrorOccurred
} from '../../scripts/core/hook-manager.js';

describe('SimulacrumHooks', () => {
    it('should export hook name constants', () => {
        expect(SimulacrumHooks.PROCESS_STATUS).toBe('simulacrum:processStatus');
        expect(SimulacrumHooks.PROCESS_CANCELLED).toBe('simulacrum:processCancelled');
        expect(SimulacrumHooks.RETRY_STATUS).toBe('simulacrum:retryStatus');
        expect(SimulacrumHooks.DOCUMENT_CHANGED).toBe('simulacrum:documentChanged');
        expect(SimulacrumHooks.TOOL_EXECUTED).toBe('simulacrum:toolExecuted');
        expect(SimulacrumHooks.ERROR_OCCURRED).toBe('simulacrum:errorOccurred');
    });

    it('should be frozen object', () => {
        expect(Object.isFrozen(SimulacrumHooks)).toBe(true);
    });
});

describe('emitHook', () => {
    beforeEach(() => {
        global.Hooks = { call: jest.fn() };
    });

    afterEach(() => {
        delete global.Hooks;
    });

    it('should call Hooks.call with hook name and payload', () => {
        emitHook('test:hook', { data: 'value' });
        expect(global.Hooks.call).toHaveBeenCalledWith('test:hook', { data: 'value' });
    });

    it('should handle missing Hooks global gracefully', () => {
        delete global.Hooks;
        expect(() => emitHook('test:hook', {})).not.toThrow();
    });

    it('should handle Hooks.call errors gracefully', () => {
        global.Hooks.call.mockImplementation(() => { throw new Error('Hook error'); });
        expect(() => emitHook('test:hook', {})).not.toThrow();
    });
});

describe('emitProcessStatus', () => {
    beforeEach(() => {
        global.Hooks = { call: jest.fn() };
    });

    afterEach(() => {
        delete global.Hooks;
    });

    it('should emit start state with label and toolName', () => {
        emitProcessStatus('start', 'call123', 'Processing...', 'read_document');
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.PROCESS_STATUS,
            { state: 'start', callId: 'call123', label: 'Processing...', toolName: 'read_document' }
        );
    });

    it('should use default toolName when not provided', () => {
        emitProcessStatus('start', 'call123', 'Processing...');
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.PROCESS_STATUS,
            expect.objectContaining({ toolName: 'process' })
        );
    });

    it('should emit end state with only callId', () => {
        emitProcessStatus('end', 'call123');
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.PROCESS_STATUS,
            { state: 'end', callId: 'call123' }
        );
    });
});

describe('emitProcessCancelled', () => {
    beforeEach(() => {
        global.Hooks = { call: jest.fn() };
    });

    afterEach(() => {
        delete global.Hooks;
    });

    it('should emit cancelled event with empty payload', () => {
        emitProcessCancelled();
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.PROCESS_CANCELLED,
            {}
        );
    });
});

describe('emitRetryStatus', () => {
    beforeEach(() => {
        global.Hooks = { call: jest.fn() };
    });

    afterEach(() => {
        delete global.Hooks;
    });

    it('should emit start state with label', () => {
        emitRetryStatus('start', 'retry123', 'Retry attempt 1');
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.RETRY_STATUS,
            { state: 'start', callId: 'retry123', label: 'Retry attempt 1' }
        );
    });

    it('should emit end state', () => {
        emitRetryStatus('end', 'retry123');
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.RETRY_STATUS,
            { state: 'end', callId: 'retry123' }
        );
    });
});

describe('emitDocumentChanged', () => {
    beforeEach(() => {
        global.Hooks = { call: jest.fn() };
    });

    afterEach(() => {
        delete global.Hooks;
    });

    it('should emit document changed with type, action, and document', () => {
        const mockDoc = { id: 'doc123', name: 'Test' };
        emitDocumentChanged('Actor', 'create', mockDoc);
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.DOCUMENT_CHANGED,
            { type: 'Actor', action: 'create', document: mockDoc }
        );
    });
});

describe('emitToolExecuted', () => {
    beforeEach(() => {
        global.Hooks = { call: jest.fn() };
    });

    afterEach(() => {
        delete global.Hooks;
    });

    it('should emit tool executed with toolName, params, and result', () => {
        emitToolExecuted('read_document', { id: '123' }, { content: 'data' });
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.TOOL_EXECUTED,
            { toolName: 'read_document', params: { id: '123' }, result: { content: 'data' } }
        );
    });
});

describe('emitErrorOccurred', () => {
    beforeEach(() => {
        global.Hooks = { call: jest.fn() };
    });

    afterEach(() => {
        delete global.Hooks;
    });

    it('should emit error with message and context', () => {
        const error = new Error('Test error');
        emitErrorOccurred(error, 'tool-execution');
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.ERROR_OCCURRED,
            { message: 'Test error', context: 'tool-execution', error }
        );
    });

    it('should handle null error gracefully', () => {
        emitErrorOccurred(null, 'test-context');
        expect(global.Hooks.call).toHaveBeenCalledWith(
            SimulacrumHooks.ERROR_OCCURRED,
            expect.objectContaining({ message: 'null', context: 'test-context' })
        );
    });
});
