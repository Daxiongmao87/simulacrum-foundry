/**
 * Tests for system-prompt-builder.js
 */
import { getDocumentTypesInfo, getAvailableMacrosList, buildSystemPrompt } from '../../scripts/core/system-prompt-builder.js';

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
        getToolSchemas: jest.fn(() => [
            { type: 'function', function: { name: 'test', parameters: { type: 'object' } } }
        ])
    }
}));

describe('getDocumentTypesInfo', () => {
    beforeEach(() => {
        global.game = {
            documentTypes: {},
            collections: new Map()
        };
    });

    afterEach(() => {
        delete global.game;
    });

    it('should return no types message when no document types available', () => {
        const result = getDocumentTypesInfo();
        expect(result).toContain('No document types');
    });

    it('should return formatted document types when available', () => {
        global.game.documentTypes = { Actor: ['npc', 'character'], Item: ['weapon', 'armor'] };
        global.game.collections = new Map([['Actor', {}], ['Item', {}]]);

        const result = getDocumentTypesInfo();
        expect(result).toContain('Actor');
        expect(result).toContain('npc');
        expect(result).toContain('Item');
    });

    it('should handle document types without subtypes', () => {
        global.game.documentTypes = { Scene: [] };
        global.game.collections = new Map([['Scene', {}]]);

        const result = getDocumentTypesInfo();
        expect(result).toContain('Scene');
    });

    it('should handle errors gracefully', () => {
        global.game = null;
        const result = getDocumentTypesInfo();
        // Function handles null game by returning no types message or unavailable
        expect(typeof result).toBe('string');
    });
});

describe('getAvailableMacrosList', () => {
    beforeEach(() => {
        global.game = {
            macros: new Map(),
            packs: new Map()
        };
    });

    afterEach(() => {
        delete global.game;
    });

    it('should return no macros message when none available', async () => {
        const result = await getAvailableMacrosList();
        expect(result).toBe('No macros available.');
    });

    it('should list world macros', async () => {
        const mockMacros = [
            { name: 'Roll Dice', uuid: 'Macro.abc123' },
            { name: 'Combat Tracker', uuid: 'Macro.def456' }
        ];
        // Create mock that behaves like Foundry's collection
        global.game.macros = {
            forEach: (cb) => mockMacros.forEach(cb)
        };

        const result = await getAvailableMacrosList();
        expect(result).toContain('Roll Dice');
        expect(result).toContain('Combat Tracker');
    });

    it('should include module pack macros', async () => {
        global.game.macros.forEach = () => { };
        global.game.packs = new Map([
            ['simulacrum.simulacrum-macros', {
                getIndex: jest.fn().mockResolvedValue([
                    { name: 'Module Macro', uuid: 'Compendium.simulacrum.macro1' }
                ])
            }]
        ]);

        const result = await getAvailableMacrosList();
        expect(result).toContain('Module Macro');
    });
});

describe('buildSystemPrompt', () => {
    beforeEach(() => {
        global.game = {
            documentTypes: { Actor: ['npc'] },
            collections: new Map([['Actor', {}]]),
            macros: [],
            packs: new Map(),
            settings: {
                get: jest.fn((module, key) => {
                    if (key === 'legacyMode') return false;
                    if (key === 'customSystemPrompt') return '';
                    return null;
                })
            },
            i18n: {
                localize: (key) => `[${key}]`,
                format: (key, data) => `[${key}] ${JSON.stringify(data)}`
            }
        };
        global.game.macros.forEach = () => { };

        // Suppress console for clean test output
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        delete global.game;
        jest.restoreAllMocks();
    });

    it('should build prompt in standard mode', async () => {
        const result = await buildSystemPrompt();
        expect(result).toContain('SIMULACRUM.SystemPrompt.Standard.Identity');
        expect(result).toContain('Actor');
    });

    it('should build prompt in legacy mode', async () => {
        global.game.settings.get.mockImplementation((module, key) => {
            if (key === 'legacyMode') return true;
            return '';
        });

        const result = await buildSystemPrompt();
        expect(result).toContain('SIMULACRUM.SystemPrompt.Legacy');
    });

    it('should append custom system prompt when provided', async () => {
        global.game.settings.get.mockImplementation((module, key) => {
            if (key === 'legacyMode') return false;
            if (key === 'customSystemPrompt') return 'Custom instructions here';
            return '';
        });

        const result = await buildSystemPrompt();
        expect(result).toContain('Custom instructions here');
    });

    it('should include available macros section in standard mode', async () => {
        const result = await buildSystemPrompt();
        expect(result).toContain('Available Macros');
    });
});
