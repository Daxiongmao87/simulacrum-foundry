import { hasPermission } from '../settings.js';
import { Tool } from './tool-registry.js';

export class GetWorldInfoTool extends Tool {
  constructor() {
    super(
      'getWorldInfo',
      'Returns comprehensive information about the current world',
      {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    );
  }
  
  shouldConfirmExecute() {
    // Reading world info is safe and doesn't need confirmation
    return false;
  }
  
  async execute(params) {
    try {
      // Get world information
      const worldData = {
        worldTitle: game.world.title || 'Unknown World',
        worldId: game.world.id,
        system: {
          id: game.system.id,
          title: game.system.title,
          version: game.system.version
        },
        foundryVersion: game.version,
        activeScene: null,
        players: [],
        collections: {},
        settings: {
          coreVersion: game.settings.get('core', 'version'),
          language: game.settings.get('core', 'language')
        }
      };
      
      // Active scene information
      if (game.scenes.viewed) {
        worldData.activeScene = {
          id: game.scenes.viewed.id,
          name: game.scenes.viewed.name,
          active: game.scenes.viewed.active,
          navigation: game.scenes.viewed.navigation
        };
      }
      
      // Player information (filter sensitive data)
      worldData.players = game.users.contents
        .filter(user => user.active)
        .map(user => ({
          id: user.id,
          name: user.name,
          role: Object.keys(CONST.USER_ROLES)[user.role],
          active: user.active,
          isGM: user.isGM
        }));
      
      // Collection counts
      for (const [key, collection] of game.collections.entries()) {
        worldData.collections[key] = {
          size: collection.size,
          documentName: collection.documentName
        };
      }
      
      // Active modules (non-sensitive info only)
      worldData.activeModules = Array.from(game.modules.entries())
        .filter(([id, module]) => module.active)
        .map(([id, module]) => ({
          id: id,
          title: module.title,
          version: module.version
        }));
      
      return {
        success: true,
        result: worldData
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to get world info: ${error.message}`,
          code: 'WORLD_INFO_FAILED'
        }
      };
    }
  }
}