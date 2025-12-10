/**
 * Tests for ArtifactSearchTool
 */
import { ArtifactSearchTool } from '../../scripts/tools/artifact-search.js';

// Mock game.packs
global.game = {
    packs: []
};

describe('ArtifactSearchTool', () => {
    let tool;

    beforeEach(() => {
        tool = new ArtifactSearchTool();
        global.game.packs = [];
    });

    describe('constructor', () => {
        it('should set tool name and description', () => {
            expect(tool.name).toBe('search_artifacts');
            expect(tool.description).toContain('Search');
        });
    });

    describe('_getSearchTerms', () => {
        it('should split query into search terms', () => {
            const terms = tool._getSearchTerms('goblin warrior');
            expect(terms).toContain('goblin');
            expect(terms).toContain('warrior');
        });

        it('should filter out stop words', () => {
            const terms = tool._getSearchTerms('search for the goblin');
            expect(terms).not.toContain('search');
            expect(terms).not.toContain('for');
            expect(terms).not.toContain('the');
            expect(terms).toContain('goblin');
        });

        it('should lowercase all terms', () => {
            const terms = tool._getSearchTerms('GOBLIN KING');
            expect(terms).toContain('goblin');
            expect(terms).toContain('king');
        });
    });

    describe('_shouldSkipPack', () => {
        const mockPack = { documentName: 'Actor' };

        it('should not skip when no types specified', () => {
            expect(tool._shouldSkipPack(mockPack, [])).toBe(false);
            expect(tool._shouldSkipPack(mockPack, null)).toBe(false);
        });

        it('should not skip when pack matches type', () => {
            expect(tool._shouldSkipPack(mockPack, ['Actor'])).toBe(false);
            expect(tool._shouldSkipPack(mockPack, ['actor'])).toBe(false);
        });

        it('should not skip when type is plural of pack name', () => {
            expect(tool._shouldSkipPack(mockPack, ['Actors'])).toBe(false);
        });

        it('should skip when pack does not match requested types', () => {
            expect(tool._shouldSkipPack(mockPack, ['Item'])).toBe(true);
        });
    });

    describe('_formatResults', () => {
        it('should format empty results', () => {
            const result = tool._formatResults('test', []);
            expect(result.display).toContain('Found 0 artifacts');
        });

        it('should format results with count', () => {
            const results = [
                { name: 'Goblin', type: 'Actor', uuid: 'Compendium.core.goblin' }
            ];
            const result = tool._formatResults('goblin', results);
            expect(result.display).toContain('Found 1 artifacts');
            expect(result.display).toContain('Goblin');
        });

        it('should truncate to 20 results', () => {
            const results = Array(25).fill(0).map((_, i) => ({
                name: `Item ${i}`, type: 'Item', uuid: `uuid-${i}`
            }));
            const result = tool._formatResults('item', results);
            expect(result.display).toContain('Showing top 20');
            expect(result.content).toContain('"count": 25');
        });
    });

    describe('execute', () => {
        it('should return error when packs not available', async () => {
            global.game.packs = null;
            const result = await tool.execute({ query: 'test' });
            expect(result.content).toContain('not available');
        });

        it('should search packs and return results', async () => {
            global.game.packs = [
                {
                    documentName: 'Actor',
                    collection: 'core.monsters',
                    getIndex: jest.fn().mockResolvedValue([
                        { _id: 'abc123', name: 'Goblin', type: 'npc' }
                    ])
                }
            ];

            const result = await tool.execute({ query: 'goblin' });
            expect(result.display).toContain('Goblin');
        });

        it('should filter by types', async () => {
            global.game.packs = [
                {
                    documentName: 'Actor',
                    collection: 'core.monsters',
                    getIndex: jest.fn().mockResolvedValue([])
                },
                {
                    documentName: 'Item',
                    collection: 'core.items',
                    getIndex: jest.fn().mockResolvedValue([
                        { _id: 'xyz789', name: 'Sword', type: 'weapon' }
                    ])
                }
            ];

            const result = await tool.execute({ query: 'sword', types: ['Item'] });
            expect(result.display).toContain('Sword');
        });
    });
});
