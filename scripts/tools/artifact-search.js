/**
 * Artifact Search Tool - Search compendiums for content
 */

import { BaseTool } from './base-tool.js';

/**
 * Tool to search for artifacts within Foundry VTT compendiums
 */
export class ArtifactSearchTool extends BaseTool {
    constructor() {
        super('search_artifacts', 'Search for items, actors, or other documents within the game\'s compendiums (packs). Use this to find specific rules, items, or NPCs.', {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search text (name or content keywords)'
                },
                types: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Document types to include (e.g., "Item", "Actor", "JournalEntry"). Optional.'
                }
            },
            required: ['query']
        });
    }

    async execute(params) {
        const { query, types } = params;
        // Basic stop words to ignore if the AI passes a full sentence
        const stopWords = new Set(['search', 'find', 'show', 'get', 'look', 'for', 'a', 'an', 'the', 'in', 'of', 'me', 'compendiums', 'compendium', 'packs']);
        const searchTerms = query.toLowerCase()
            .split(/\s+/)
            .filter(t => t.length > 0 && !stopWords.has(t));
        const results = [];

        // Safety check for game.packs
        if (!game.packs) {
            return {
                content: "Compendiums not available.",
                display: "❌ Compendiums not available."
            };
        }

        try {
            // Iterate over all packs
            for (const pack of game.packs) {
                // Filter by type if requested (Case Insensitive)
                if (types && types.length > 0) {
                    const packType = pack.documentName.toLowerCase();
                    const requestedTypes = types.map(t => t.toLowerCase());
                    // Check for exact match or crude singular/plural match (e.g. 'items' matches 'item')
                    const match = requestedTypes.some(t => t === packType || t === packType + 's' || packType === t + 's');
                    if (!match) continue;
                }

                // Get index (ensure it is loaded)
                // We request common fields usually needed for identification
                const index = await pack.getIndex({ fields: ['name', 'img', 'type'] });

                // Search index
                const matches = index.filter(i => {
                    const name = (i.name || '').toLowerCase();
                    return searchTerms.every(t => name.includes(t));
                });

                for (const match of matches) {
                    results.push({
                        name: match.name,
                        id: match._id,
                        type: match.type || pack.documentName, // match.type might be subtype (e.g. 'spell')
                        pack: pack.collection,
                        uuid: `Compendium.${pack.collection}.${match._id}`,
                        img: match.img
                    });
                }

                // Limit global results to prevent massive return
                if (results.length >= 50) break;
            }

            const count = results.length;
            const sliced = results.slice(0, 20); // Return top 20

            let display = `**Found ${count} artifacts matching "${query}"**`;
            if (count > 20) display += ` (Showing top 20)`;
            display += '\n' + sliced.map(r => `- **${r.name}** (${r.type}) [@UUID[${r.uuid}]]`).join('\n');

            const content = JSON.stringify({
                query,
                count,
                results: sliced
            }, null, 2);

            return {
                content,
                display
            };

        } catch (error) {
            return this.handleError(error);
        }
    }
}
