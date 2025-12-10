/**
 * Tests for ExecuteMacroTool
 */
import { ExecuteMacroTool } from '../../scripts/tools/execute-macro.js';

// Reset mocks
beforeEach(() => {
    global.game = {
        user: { isGM: true },
        macros: {
            getName: jest.fn()
        },
        packs: []
    };
    global.fromUuid = jest.fn();
});

afterEach(() => {
    delete global.game;
    delete global.fromUuid;
});

describe('ExecuteMacroTool', () => {
    let tool;

    beforeEach(() => {
        tool = new ExecuteMacroTool();
    });

    describe('constructor', () => {
        it('should set tool name and description', () => {
            expect(tool.name).toBe('execute_macro');
            expect(tool.description).toContain('Macro');
        });
    });

    describe('getParameterSchema', () => {
        it('should return schema', () => {
            const schema = tool.getParameterSchema();
            expect(schema).toBeDefined();
        });
    });

    describe('execute', () => {
        it('should throw when user is not GM', async () => {
            global.game.user.isGM = false;

            await expect(tool.execute({ name: 'TestMacro' }))
                .rejects.toThrow('Permission denied');
        });

        it('should find and execute macro by UUID', async () => {
            const mockMacro = {
                name: 'TestMacro',
                execute: jest.fn().mockResolvedValue('Macro result')
            };
            global.fromUuid.mockResolvedValue(mockMacro);

            const result = await tool.execute({ uuid: 'Macro.abc123' });

            expect(global.fromUuid).toHaveBeenCalledWith('Macro.abc123');
            expect(mockMacro.execute).toHaveBeenCalled();
            expect(result.message).toContain('Successfully executed');
        });

        it('should find macro by name in world macros', async () => {
            const mockMacro = {
                name: 'WorldMacro',
                execute: jest.fn().mockResolvedValue(null)
            };
            global.game.macros.getName.mockReturnValue(mockMacro);

            const result = await tool.execute({ name: 'WorldMacro' });

            expect(global.game.macros.getName).toHaveBeenCalledWith('WorldMacro');
            expect(result.message).toContain('WorldMacro');
        });

        it('should search compendiums when macro not in world', async () => {
            global.game.macros.getName.mockReturnValue(null);

            const mockDoc = {
                name: 'PackMacro',
                execute: jest.fn().mockResolvedValue('pack result')
            };

            global.game.packs = [
                {
                    documentName: 'Macro',
                    getIndex: jest.fn().mockResolvedValue([
                        { _id: 'pack123', name: 'PackMacro' }
                    ]),
                    getDocument: jest.fn().mockResolvedValue(mockDoc)
                }
            ];

            const result = await tool.execute({ name: 'PackMacro' });

            expect(mockDoc.execute).toHaveBeenCalled();
            expect(result.result).toBe('pack result');
        });

        it('should throw when macro not found', async () => {
            global.game.macros.getName.mockReturnValue(null);
            global.game.packs = [];

            await expect(tool.execute({ name: 'NonExistentMacro' }))
                .rejects.toThrow('Macro not found');
        });

        it('should throw when macro execution fails', async () => {
            const mockMacro = {
                name: 'FailingMacro',
                execute: jest.fn().mockRejectedValue(new Error('Macro error'))
            };
            global.game.macros.getName.mockReturnValue(mockMacro);

            await expect(tool.execute({ name: 'FailingMacro' }))
                .rejects.toThrow('Error executing macro');
        });

        it('should pass args to macro execution', async () => {
            const mockMacro = {
                name: 'ArgsTest',
                execute: jest.fn().mockResolvedValue('done')
            };
            global.game.macros.getName.mockReturnValue(mockMacro);

            await tool.execute({ name: 'ArgsTest', args: { key: 'value' } });

            expect(mockMacro.execute).toHaveBeenCalledWith({ key: 'value' });
        });

        it('should skip non-Macro compendiums when searching', async () => {
            global.game.macros.getName.mockReturnValue(null);

            const mockMacroPack = {
                documentName: 'Macro',
                getIndex: jest.fn().mockResolvedValue([
                    { _id: 'abc', name: 'FoundMacro' }
                ]),
                getDocument: jest.fn().mockResolvedValue({
                    name: 'FoundMacro',
                    execute: jest.fn().mockResolvedValue(null)
                })
            };

            global.game.packs = [
                { documentName: 'Actor', getIndex: jest.fn() },
                mockMacroPack
            ];

            await tool.execute({ name: 'FoundMacro' });

            // Should not call getIndex on Actor pack
            expect(global.game.packs[0].getIndex).not.toHaveBeenCalled();
            expect(mockMacroPack.getIndex).toHaveBeenCalled();
        });
    });
});
