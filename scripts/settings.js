import { ToolPermissionsConfig } from './settings/tool-permissions-config.js';
import { SettingsManagementConfig } from './settings/settings-management-config.js';

export class SimulacrumSettings {
  /**
   * Fetches available models and their context windows from the configured API endpoint.
   * Stores the result in a game setting.
   * @returns {Promise<void>}
   */
  static async fetchModelsAndContextWindows() {
    const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
    const apiKey = game.settings.get('simulacrum', 'apiKey');

    try {
      // Use the new ModelDetector system that supports both Ollama and OpenAI
      const modelDetector = game.simulacrum?.ModelDetector
        ? new game.simulacrum.ModelDetector()
        : null;
      if (!modelDetector) {
        game.simulacrum?.logger?.warn(
          'ModelDetector not available, falling back to empty models'
        );
        await game.settings.set('simulacrum', 'availableModels', []);
        return;
      }

      const detection = await modelDetector.detectModels(apiEndpoint, apiKey);

      if (detection.detectable && detection.models.length > 0) {
        // Convert detected models to the format expected by settings system
        const availableModels = [];

        for (const model of detection.models) {
          let contextWindow = 32000; // Default

          // For Ollama models, try to get actual context window
          if (detection.type === 'ollama') {
            try {
              const contextWindowDetector = game.simulacrum
                ?.ContextWindowDetector
                ? new game.simulacrum.ContextWindowDetector()
                : null;
              if (contextWindowDetector) {
                contextWindow = await contextWindowDetector.getContextWindow(
                  apiEndpoint,
                  model.id
                );
              }
            } catch (error) {
              game.simulacrum?.logger?.warn(
                `Failed to get context window for ${model.id}:`,
                error
              );
            }
          }

          availableModels.push({
            id: model.id,
            contextWindow: contextWindow,
          });
        }

        await game.settings.set(
          'simulacrum',
          'availableModels',
          availableModels
        );
        ui.notifications.info(
          `Simulacrum: Successfully fetched ${availableModels.length} available models from ${detection.type} API.`
        );
        game.simulacrum?.logger?.debug(
          'Available models fetched:',
          availableModels
        );
      } else {
        game.simulacrum?.logger?.warn(
          'No models detected or API not accessible'
        );
        await game.settings.set('simulacrum', 'availableModels', []);
      }
    } catch (error) {
      const errorMessage =
        error && typeof error === 'object' && 'message' in error
          ? error.message
          : String(error);
      game.simulacrum?.logger?.error('Error fetching models:', error);
      game.simulacrum?.logger?.error(`Failed to fetch models: ${errorMessage}`);
      await game.settings.set('simulacrum', 'availableModels', []); // Clear models on error
    }
  }

  static async register() {
    // Register a setting to store available models and their context windows
    game.settings.register('simulacrum', 'availableModels', {
      scope: 'world',
      config: false, // Not directly configurable by user, populated by fetchModelsAndContextWindows
      type: Array,
      default: [],
    });

    // OpenAI API endpoint
    game.settings.register('simulacrum', 'apiEndpoint', {
      name: 'SIMULACRUM.SettingApiEndpointName',
      hint: 'SIMULACRUM.SettingApiEndpointHint',
      scope: 'world',
      config: true,
      type: String,
      default: 'http://localhost:11434/v1',
      onChange: async (value) => {
        if (value && !value.includes('/v1')) {
          ui.notifications.warn('SIMULACRUM.SettingApiEndpointWarn');
        }
        // Re-fetch models if API endpoint changes
        await SimulacrumSettings.fetchModelsAndContextWindows();
        // Re-render settings config to update model/context length fields
        ui.settings.render(true);
      },
    });

    // API Key
    game.settings.register('simulacrum', 'apiKey', {
      name: 'SIMULACRUM.SettingApiKeyName',
      hint: 'SIMULACRUM.SettingApiKeyHint',
      scope: 'world',
      config: true,
      type: String,
      default: '',
    });

    // Model Name
    const availableModels = game.settings.get('simulacrum', 'availableModels');
    const modelChoices = { custom: 'SIMULACRUM.CustomModelOption' }; // Always allow custom
    availableModels.forEach((model) => {
      modelChoices[model.id] = model.id;
    });

    game.settings.register('simulacrum', 'modelName', {
      name: 'SIMULACRUM.SettingModelNameName',
      hint: 'SIMULACRUM.SettingModelNameHint',
      scope: 'world',
      config: true,
      type: String,
      choices: modelChoices,
      default: availableModels.length > 0 ? availableModels[0].id : 'custom',
      onChange: async (value) => {
        const selectedModel = availableModels.find(
          (model) => model.id === value
        );
        if (selectedModel) {
          await game.settings.set(
            'simulacrum',
            'contextLength',
            selectedModel.contextWindow
          );
        }
        // Re-render settings config to update context length field and input type
        ui.settings.render(true);
      },
    });

    // Context Length
    game.settings.register('simulacrum', 'contextLength', {
      name: 'SIMULACRUM.SettingContextLengthName',
      hint: 'SIMULACRUM.SettingContextLengthHint',
      scope: 'world',
      config: true,
      type: Number,
      default: 32000,
      range: {
        min: 1024,
        max: 128000,
        step: 1024,
      },
      onChange: (value) => {
        if (value < 1024) {
          ui.notifications.warn('SIMULACRUM.SettingContextLengthWarn');
        }
      },
    });

    // Allow Deletion
    game.settings.register('simulacrum', 'allowDeletion', {
      name: 'SIMULACRUM.SettingAllowDeletionName',
      hint: 'SIMULACRUM.SettingAllowDeletionHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
    });

    // Allow Assistant GM usage
    game.settings.register('simulacrum', 'allowAssistantGM', {
      name: 'SIMULACRUM.SettingAllowAssistantGMName',
      hint: 'SIMULACRUM.SettingAllowAssistantGMHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
    });

    // System Prompt
    game.settings.register('simulacrum', 'systemPrompt', {
      name: 'SIMULACRUM.SettingSystemPromptName',
      hint: 'SIMULACRUM.SettingSystemPromptHint',
      scope: 'world',
      config: true,
      type: String,
      default: '',
      filePicker: false,
    });

    // Tool Permissions
    game.settings.register('simulacrum', 'toolPermissions', {
      name: 'SIMULACRUM.SettingToolPermissionsName',
      hint: 'SIMULACRUM.SettingToolPermissionsHint',
      scope: 'world',
      config: false, // Set to false as we'll use a custom button
      type: Object,
      default: {},
    });

    // Context Items Storage
    game.settings.register('simulacrum', 'contextItems', {
      scope: 'world',
      config: false,
      type: Array,
      default: [],
    });

    // Register a custom menu for tool permissions
    game.settings.registerMenu('simulacrum', 'toolPermissionsMenu', {
      name: 'SIMULACRUM.ToolPermissionsMenuName',
      label: 'SIMULACRUM.ToolPermissionsMenuLabel',
      hint: 'SIMULACRUM.ToolPermissionsMenuHint',
      icon: 'fas fa-tools',
      type: ToolPermissionsConfig,
      restricted: true, // Only GMs can access this
    });

    // Register a custom menu for settings management
    game.settings.registerMenu('simulacrum', 'settingsManagementMenu', {
      name: 'SIMULACRUM.SettingsManagementMenuName',
      label: 'SIMULACRUM.SettingsManagementMenuLabel',
      hint: 'SIMULACRUM.SettingsManagementMenuHint',
      icon: 'fas fa-cogs',
      type: SettingsManagementConfig,
      restricted: true, // Only GMs can access this
    });

    // Gremlin Mode
    game.settings.register('simulacrum', 'gremlinMode', {
      name: 'SIMULACRUM.SettingGremlinModeName',
      hint: 'SIMULACRUM.SettingGremlinModeHint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        // Revert if user lacks permission
        if (!SimulacrumSettings.hasPermission(game.user)) {
          ui.notifications.warn('Only GM/Assistant GM can modify Gremlin mode');
          game.settings.set('simulacrum', 'gremlinMode', !value);
        }
      },
    });

    // Register a hook to convert the systemPrompt setting to a textarea and handle dynamic model/context length inputs
    Hooks.on('renderSettingsConfig', (app, html) => {
      // Handle systemPrompt as textarea
      const systemPromptSetting = html.find('[name="simulacrum.systemPrompt"]');
      if (systemPromptSetting.length) {
        const currentValue = systemPromptSetting.val();
        const textarea = $('<textarea>')
          .attr('name', 'simulacrum.systemPrompt')
          .attr('rows', '5')
          .val(currentValue);
        systemPromptSetting.replaceWith(textarea);
      }

      // Handle dynamic modelName and contextLength inputs
      const modelNameSetting = html.find('[name="simulacrum.modelName"]');
      const contextLengthSetting = html.find(
        '[name="simulacrum.contextLength"]'
      );

      if (modelNameSetting.length && contextLengthSetting.length) {
        const currentModel = modelNameSetting.val();
        const availableModels = game.settings.get(
          'simulacrum',
          'availableModels'
        );

        // If current model is 'custom' or no models are available, make contextLength editable
        if (currentModel === 'custom' || availableModels.length === 0) {
          contextLengthSetting.prop('readonly', false);
          contextLengthSetting.attr('type', 'number'); // Ensure it's a number input
        } else {
          contextLengthSetting.prop('readonly', true);
          contextLengthSetting.attr('type', 'text'); // Display as text when read-only
        }

        // If no models are available, change modelName to text input
        if (availableModels.length === 0) {
          const currentModelValue = modelNameSetting.val();
          const textInput = $('<input>')
            .attr('type', 'text')
            .attr('name', 'simulacrum.modelName')
            .val(currentModelValue);
          modelNameSetting.replaceWith(textInput);
        }
      }
    });

    // Note: fetchModelsAndContextWindows will be called from main.js ready hook
  }

  static hasPermission(user) {
    // GM always has access
    if (user.role === CONST.USER_ROLES.GAMEMASTER) {
      return true;
    }

    // Assistant GM only if explicitly enabled
    if (user.role === CONST.USER_ROLES.ASSISTANT) {
      return game.settings.get('simulacrum', 'allowAssistantGM');
    }

    // All other roles denied
    return false;
  }

  /**
   * Alias for hasPermission to match legacy naming.
   */
  static hasSimulacrumPermission(user) {
    return this.hasPermission(user);
  }

  /**
   * Get the current tool permissions.
   * @returns {object}
   */
  static getToolPermissions() {
    return game.settings.get('simulacrum', 'toolPermissions') || {};
  }

  /**
   * Set the tool permissions.
   * @param {object} permissions
   * @returns {Promise<void>}
   */
  static async setToolPermissions(permissions) {
    await game.settings.set('simulacrum', 'toolPermissions', permissions);
  }

  /**
   * Get the current API endpoint.
   * @returns {string}
   */
  static getApiEndpoint() {
    return game.settings.get('simulacrum', 'apiEndpoint');
  }
}
