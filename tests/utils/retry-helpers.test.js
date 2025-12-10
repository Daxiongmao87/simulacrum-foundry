/**
 * Tests for retry-helpers.js
 */
import {
    isToolCallFailure,
    buildRetryLabel,
    getRetryDelayMs,
    delayWithSignal,
    buildGenericFailureMessage
} from '../../scripts/utils/retry-helpers.js';
import { AI_ERROR_CODES } from '../../scripts/core/ai-client.js';

describe('isToolCallFailure', () => {
    it('should return true for tool call failure error code', () => {
        expect(isToolCallFailure({ errorCode: AI_ERROR_CODES.TOOL_CALL_FAILURE })).toBe(true);
    });

    it('should return false for other error codes', () => {
        expect(isToolCallFailure({ errorCode: AI_ERROR_CODES.RATE_LIMIT })).toBe(false);
    });

    it('should return false for null response', () => {
        expect(isToolCallFailure(null)).toBe(false);
    });

    it('should return false for response without errorCode', () => {
        expect(isToolCallFailure({ content: 'Hello' })).toBe(false);
    });
});

describe('buildRetryLabel', () => {
    it('should build label with attempt and max attempts', () => {
        expect(buildRetryLabel(1, 3)).toBe('Retrying request (attempt 1 of 3)...');
        expect(buildRetryLabel(2, 5)).toBe('Retrying request (attempt 2 of 5)...');
    });
});

describe('getRetryDelayMs', () => {
    it('should return 0 for negative attempt index', () => {
        expect(getRetryDelayMs(-1)).toBe(0);
    });

    it('should return delay from schedule for valid index', () => {
        expect(getRetryDelayMs(0)).toBe(1000);
        expect(getRetryDelayMs(1)).toBe(2000);
    });

    it('should return last delay for index beyond schedule length', () => {
        expect(getRetryDelayMs(5)).toBe(2000);
    });

    it('should use custom delay schedule', () => {
        expect(getRetryDelayMs(0, [500, 1000, 2000])).toBe(500);
        expect(getRetryDelayMs(2, [500, 1000, 2000])).toBe(2000);
    });
});

describe('delayWithSignal', () => {
    it('should resolve immediately for 0 delay', async () => {
        const start = Date.now();
        await delayWithSignal(0, null);
        expect(Date.now() - start).toBeLessThan(50);
    });

    it('should throw immediately for 0 delay if signal is aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        try {
            delayWithSignal(0, controller.signal);
            fail('Expected to throw');
        } catch (e) {
            expect(e.message).toContain('cancelled');
        }
    });

    it('should resolve after delay', async () => {
        const start = Date.now();
        await delayWithSignal(100, null);
        expect(Date.now() - start).toBeGreaterThanOrEqual(95);
    });

    it('should throw if signal is aborted before delay', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(delayWithSignal(100, controller.signal)).rejects.toThrow('cancelled');
    });

    it('should throw if signal is aborted during delay', async () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 50);
        await expect(delayWithSignal(200, controller.signal)).rejects.toThrow('cancelled');
    });
});

describe('buildGenericFailureMessage', () => {
    it('should return object with role, content, and display', () => {
        const result = buildGenericFailureMessage();
        expect(result.role).toBe('assistant');
        expect(result.content).toContain('Unable to generate');
        expect(result.display).toContain('❌');
    });
});
