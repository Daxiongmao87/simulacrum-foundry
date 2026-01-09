/**
 * Artifact Search Tool - Search compendiums for content
 */

import { BaseTool } from './base-tool.js';

/**
 * Tool to search for artifacts within Foundry VTT compendiums
 */
export class ArtifactSearchTool extends BaseTool {
  constructor() {
    super(
      'search_artifacts',
      "Search for items, actors, or other documents within the game's compendiums (packs). Use this to find specific rules, items, or NPCs.",
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search text (name or content keywords)',
          },
          types: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Document types to include (e.g., "Item", "Actor", "JournalEntry"). Optional.',
          },
        },
        required: ['query'],
      }
    );
  }

  async execute(params) {
    const { query, types } = params;
    const searchTerms = this._getSearchTerms(query);
    const results = [];

    if (!game.packs) {
      return { content: 'Compendiums not available.', display: '❌ Compendiums not available.' };
    }

    try {
      for (const pack of game.packs) {
        if (this._shouldSkipPack(pack, types)) continue;

        const matches = await this._searchPack(pack, searchTerms);
        results.push(...matches);

        if (results.length >= 50) break;
      }

      return this._formatResults(query, results);
    } catch (error) {
      return this.handleError(error);
    }
  }

  _getSearchTerms(query) {
    const stopWords = new Set([
      'search',
      'find',
      'show',
      'get',
      'look',
      'for',
      'a',
      'an',
      'the',
      'in',
      'of',
      'me',
      'compendiums',
      'compendium',
      'packs',
    ]);
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 0 && !stopWords.has(t));
  }

  _shouldSkipPack(pack, types) {
    if (!types || types.length === 0) return false;
    const packType = pack.documentName.toLowerCase();
    const requestedTypes = types.map(t => t.toLowerCase());
    return !requestedTypes.some(
      t => t === packType || t === packType + 's' || packType === t + 's'
    );
  }

  async _searchPack(pack, searchTerms) {
    const index = await pack.getIndex({ fields: ['name', 'img', 'type'] });
    const matches = index.filter(i => {
      const name = (i.name || '').toLowerCase();
      return searchTerms.every(t => name.includes(t));
    });

    return matches.map(match => ({
      name: match.name,
      id: match._id,
      type: match.type || pack.documentName,
      pack: pack.collection,
      uuid: `Compendium.${pack.collection}.${match._id}`,
      img: match.img,
    }));
  }

  _formatResults(query, results) {
    const count = results.length;
    const sliced = results.slice(0, 20);

    let display = `**Found ${count} artifacts matching "${query}"**`;
    if (count > 20) display += ` (Showing top 20)`;
    display += '\n' + sliced.map(r => `- **${r.name}** (${r.type}) [@UUID[${r.uuid}]]`).join('\n');

    return {
      content: JSON.stringify({ query, count, results: sliced }, null, 2),
      display,
    };
  }
}
