import { Tool } from './tool-registry.js';
import { SimulacrumSettings } from '../settings.js';

export class GetUserPreferencesTool extends Tool {
  constructor() {
    super(
      'getUserPreferences',
      'Returns user settings, permissions, active character, and Simulacrum-specific configuration for the specified or current user',
      {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description:
              'Specific user ID to get preferences for (optional, defaults to current user)',
          },
        },
        additionalProperties: false,
      }
    );
  }

  shouldConfirmExecute() {
    // Reading user preferences is safe and doesn't need confirmation
    return false;
  }

  async execute(params) {
    try {
      const { userId } = params;

      // Determine target user
      let targetUser;
      if (userId) {
        targetUser = game.users.get(userId);
        if (!targetUser) {
          return {
            success: false,
            error: {
              message: `User not found: ${userId}`,
              code: 'USER_NOT_FOUND',
            },
          };
        }
      } else {
        targetUser = game.user;
      }

      // Build user preferences (filter sensitive information)
      const userPreferences = {
        user: {
          id: targetUser.id,
          name: targetUser.name,
          role: Object.keys(CONST.USER_ROLES)[targetUser.role],
          isGM: targetUser.isGM,
          active: targetUser.active,
          color: targetUser.color,
        },
        permissions: {
          canCreateActors: targetUser.can('ACTOR_CREATE'),
          canCreateItems: targetUser.can('ITEM_CREATE'),
          canCreateJournals: targetUser.can('JOURNAL_CREATE'),
          canCreateScenes: targetUser.can('SCENE_CREATE'),
          hasSimulacrumAccess:
            SimulacrumSettings.hasSimulacrumPermission(targetUser),
        },
        simulacrumSettings: {},
        coreSettings: {},
      };

      // Simulacrum-specific settings (only if user has access)
      if (SimulacrumSettings.hasSimulacrumPermission(targetUser)) {
        // Only include non-sensitive settings
        userPreferences.simulacrumSettings = {
          modelName: game.settings.get('simulacrum', 'modelName'),
          contextLength: game.settings.get('simulacrum', 'contextLength'),
          allowDeletion: game.settings.get('simulacrum', 'allowDeletion'),
          allowAssistantGM: game.settings.get('simulacrum', 'allowAssistantGM'),
          gremlinMode: game.settings.get('simulacrum', 'gremlinMode'),
          // Note: Exclude apiEndpoint and systemPrompt for security
        };
      }

      // Core user settings (non-sensitive)
      try {
        userPreferences.coreSettings = {
          language: game.settings.get('core', 'language'),
          animateRolls: game.settings.get('core', 'animateRolls'),
          chatBubbles: game.settings.get('core', 'chatBubbles'),
          leftClickDeselect: game.settings.get('core', 'leftClickDeselect'),
        };
      } catch {
        // Some settings may not be accessible, continue without them
        userPreferences.coreSettings = {};
      }

      // Active character for this user
      if (targetUser.character) {
        userPreferences.activeCharacter = {
          id: targetUser.character.id,
          name: targetUser.character.name,
          type: targetUser.character.type,
        };
      }

      return {
        success: true,
        result: userPreferences,
      };
    } catch {
      return {
        success: false,
        error: {
          message: `Failed to get user preferences: ${error.message}`,
          code: 'USER_PREFERENCES_FAILED',
        },
      };
    }
  }
}
