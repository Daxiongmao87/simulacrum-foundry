// import { SimulacrumSettings } from '../settings.js'; // Available for future use
import { Tool } from './tool-registry.js';

export class GetSceneInfoTool extends Tool {
  constructor() {
    super(
      'getSceneInfo',
      'Returns detailed scene information including dimensions, background, tokens, lighting settings, journal notes, walls, and terrain features',
      {
        type: 'object',
        properties: {
          sceneId: {
            type: 'string',
            description: 'Specific scene ID to get info for (optional)',
          },
        },
        additionalProperties: false,
      }
    );
  }

  shouldConfirmExecute() {
    // Reading scene info is safe and doesn't need confirmation
    return false;
  }

  async execute(params) {
    try {
      const { sceneId } = params;

      // Determine which scene to analyze
      let targetScene;
      if (sceneId) {
        targetScene = game.scenes.get(sceneId);
        if (!targetScene) {
          return {
            success: false,
            error: {
              message: `Scene not found: ${sceneId}`,
              code: 'SCENE_NOT_FOUND',
            },
          };
        }
      } else {
        targetScene = game.scenes.viewed;
        if (!targetScene) {
          return {
            success: false,
            error: {
              message: 'No active scene found',
              code: 'NO_ACTIVE_SCENE',
            },
          };
        }
      }

      // Build scene information
      const sceneData = {
        scene: {
          id: targetScene.id,
          name: targetScene.name,
          active: targetScene.active,
          navigation: targetScene.navigation,
          dimensions: {
            width: targetScene.width,
            height: targetScene.height,
            size: targetScene.grid?.size || 100,
            distance: targetScene.grid?.distance || 5,
            units: targetScene.grid?.units || 'ft',
          },
          background: {
            src: targetScene.background?.src || null,
            offsetX: targetScene.background?.offsetX || 0,
            offsetY: targetScene.background?.offsetY || 0,
          },
        },
        tokens: [],
        lighting: {
          globalLight: targetScene.globalLight,
          darkness: targetScene.darkness,
          lightCount: targetScene.lights?.size || 0,
        },
        weather: targetScene.weather || null,
        notes: [],
      };

      // Token information
      if (targetScene.tokens) {
        sceneData.tokens = targetScene.tokens.contents.map((token) => ({
          id: token.id,
          name: token.name,
          actorId: token.actorId,
          actorName: token.actor?.name || 'Unknown',
          position: {
            x: token.x,
            y: token.y,
            elevation: token.elevation || 0,
          },
          hidden: token.hidden,
          disposition: token.disposition,
        }));
      }

      // Journal notes
      if (targetScene.notes) {
        sceneData.notes = targetScene.notes.contents.map((note) => ({
          id: note.id,
          entryId: note.entryId,
          pageId: note.pageId,
          text: note.label || note.text,
          position: {
            x: note.x,
            y: note.y,
          },
          icon: note.texture?.src || null,
        }));
      }

      // Walls and terrain (basic info)
      sceneData.walls = {
        count: targetScene.walls?.size || 0,
      };

      sceneData.terrain = {
        count: targetScene.terrain?.size || 0,
      };

      return {
        success: true,
        result: sceneData,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to get scene info: ${error.message}`,
          code: 'SCENE_INFO_FAILED',
        },
      };
    }
  }
}
