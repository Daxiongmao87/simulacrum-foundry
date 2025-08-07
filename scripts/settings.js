import { ToolPermissionsConfig } from "./settings/tool-permissions-config.js";
import { SettingsManagementConfig } from "./settings/settings-management-config.js";

export class SimulacrumSettings {

    static register() {
        // OpenAI API endpoint
        game.settings.register('simulacrum', 'apiEndpoint', {
            name: 'SIMULACRUM.SettingApiEndpointName',
            hint: 'SIMULACRUM.SettingApiEndpointHint',
            scope: 'world',
            config: true,
            type: String,
            default: 'http://localhost:11434/v1',
            onChange: value => {
                if (value && !value.includes('/v1')) {
                    ui.notifications.warn('SIMULACRUM.SettingApiEndpointWarn');
                }
            }
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
        game.settings.register('simulacrum', 'modelName', {
            name: 'SIMULACRUM.SettingModelNameName',
            hint: 'SIMULACRUM.SettingModelNameHint',
            scope: 'world',
            config: true,
            type: String,
            default: 'gpt-4',
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
                step: 1024
            },
            onChange: value => {
                if (value < 1024) {
                    ui.notifications.warn('SIMULACRUM.SettingContextLengthWarn');
                }
            }
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
            restricted: true // Only GMs can access this
        });

        // Register a custom menu for settings management
        game.settings.registerMenu('simulacrum', 'settingsManagementMenu', {
            name: 'SIMULACRUM.SettingsManagementMenuName',
            label: 'SIMULACRUM.SettingsManagementMenuLabel',
            hint: 'SIMULACRUM.SettingsManagementMenuHint',
            icon: 'fas fa-cogs',
            type: SettingsManagementConfig,
            restricted: true // Only GMs can access this
        });

        // YOLO Mode
        game.settings.register('simulacrum', 'yoloMode', {
            name: 'SIMULACRUM.SettingYoloModeName',
            hint: 'SIMULACRUM.SettingYoloModeHint',
            scope: 'world',
            config: true,
            type: Boolean,
            default: false,
        });

        // Register a hook to convert the systemPrompt setting to a textarea
        Hooks.on("renderSettingsConfig", (app, html) => {
            const systemPromptSetting = html.find('[name="simulacrum.systemPrompt"]');
            if (systemPromptSetting.length) {
                const currentValue = systemPromptSetting.val();
                const textarea = $('<textarea>')
                    .attr('name', 'simulacrum.systemPrompt')
                    .attr('rows', '5')
                    .val(currentValue);
                systemPromptSetting.replaceWith(textarea);
            }
        });
    }

    static hasPermission(user) {
        // GM always has access
        if (user.role === CONST.USER_ROLES.GAMEMASTER) return true;
        
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
