/**
 * Tests for macros.js
 */
import { SIMULACRUM_MACRO_DEFINITIONS, ensureSimulacrumMacros } from '../scripts/macros.js';

// Mock logger
jest.mock('../scripts/utils/logger.js', () => ({
    createLogger: () => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }),
    isDebugEnabled: () => false
}));

describe('SIMULACRUM_MACRO_DEFINITIONS', () => {
    it('should export macro definitions array', () => {
        expect(Array.isArray(SIMULACRUM_MACRO_DEFINITIONS)).toBe(true);
        expect(SIMULACRUM_MACRO_DEFINITIONS.length).toBeGreaterThan(0);
    });

    it('should have Clear Chat macro', () => {
        const clearMacro = SIMULACRUM_MACRO_DEFINITIONS.find(m => m.name.includes('Clear'));
        expect(clearMacro).toBeDefined();
        expect(clearMacro.type).toBe('script');
    });

    it('should have Open Assistant macro', () => {
        const openMacro = SIMULACRUM_MACRO_DEFINITIONS.find(m => m.name.includes('Open'));
        expect(openMacro).toBeDefined();
    });

    it('should have Reset Settings macro', () => {
        const resetMacro = SIMULACRUM_MACRO_DEFINITIONS.find(m => m.name.includes('Reset'));
        expect(resetMacro).toBeDefined();
    });
});

describe('ensureSimulacrumMacros', () => {
    beforeEach(() => {
        global.game = {
            folders: {
                find: jest.fn().mockReturnValue(null)
            },
            macros: {
                some: jest.fn().mockReturnValue(true)
            }
        };
        global.Folder = {
            create: jest.fn().mockResolvedValue({ id: 'folder123' })
        };
        global.Macro = {
            create: jest.fn().mockResolvedValue({})
        };
    });

    afterEach(() => {
        delete global.game;
        delete global.Folder;
        delete global.Macro;
    });

    it('should not create macros if they already exist', async () => {
        global.game.macros.some.mockReturnValue(true);

        await ensureSimulacrumMacros();

        expect(global.Macro.create).not.toHaveBeenCalled();
    });

    it('should create folder and macros if they do not exist', async () => {
        global.game.macros.some.mockReturnValue(false);

        await ensureSimulacrumMacros();

        expect(global.Folder.create).toHaveBeenCalled();
        expect(global.Macro.create).toHaveBeenCalled();
    });

    it('should use existing folder if found', async () => {
        global.game.folders.find.mockReturnValue({ id: 'existingFolder' });
        global.game.macros.some.mockReturnValue(false);

        await ensureSimulacrumMacros();

        // Folder.create should only be called once (not for every macro)
        expect(global.Folder.create).not.toHaveBeenCalled();
    });

    it('should handle macro creation errors gracefully', async () => {
        global.game.macros.some.mockReturnValue(false);
        global.Macro.create.mockRejectedValue(new Error('Creation failed'));

        // Should not throw
        await expect(ensureSimulacrumMacros()).resolves.not.toThrow();
    });
});
