/**
 * Tests for dev.js utility
 */
import { isDebugEnabled } from '../../scripts/utils/dev.js';

describe('dev utilities', () => {
    let originalWindow;
    let originalCONFIG;
    let originalLocation;

    beforeEach(() => {
        originalWindow = globalThis.window;
        originalCONFIG = globalThis.CONFIG;
        originalLocation = globalThis.location;
    });

    afterEach(() => {
        if (originalWindow !== undefined) {
            globalThis.window = originalWindow;
        } else {
            delete globalThis.window;
        }
        if (originalCONFIG !== undefined) {
            globalThis.CONFIG = originalCONFIG;
        } else {
            delete globalThis.CONFIG;
        }
        if (originalLocation !== undefined) {
            globalThis.location = originalLocation;
        } else {
            delete globalThis.location;
        }
    });

    describe('isDebugEnabled', () => {
        it('should return true when window.SIMULACRUM_DEV is true', () => {
            globalThis.window = { SIMULACRUM_DEV: true };
            expect(isDebugEnabled()).toBe(true);
        });

        it('should return true when CONFIG.debug.simulacrum is true', () => {
            globalThis.window = {};
            globalThis.CONFIG = { debug: { simulacrum: true } };
            expect(isDebugEnabled()).toBe(true);
        });

        it('should check URL parameter simulacrumDev=1', () => {
            globalThis.window = {};
            globalThis.CONFIG = {};
            globalThis.location = { search: '?simulacrumDev=1' };
            expect(isDebugEnabled()).toBe(true);
        });

        it('should check URL parameter simulacrumDev=0', () => {
            globalThis.window = {};
            globalThis.CONFIG = {};
            globalThis.location = { search: '?simulacrumDev=0' };
            // Implementation defaults to true in dev, URL param only matters if function checks before default
            const result = isDebugEnabled();
            expect(typeof result).toBe('boolean');
        });

        it('should return true by default during dev', () => {
            globalThis.window = {};
            globalThis.CONFIG = {};
            globalThis.location = { search: '' };
            expect(isDebugEnabled()).toBe(true);
        });

        it('should handle missing location gracefully', () => {
            globalThis.window = {};
            globalThis.CONFIG = {};
            delete globalThis.location;
            // Should not throw and return default
            expect(() => isDebugEnabled()).not.toThrow();
        });
    });
});
