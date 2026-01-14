/**
 * Tool Permission Manager - Manages permissions for destructive AI tools
 * Handles whitelist/blacklist persistence and confirmation flow control
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('ToolPermissionManager');

/**
 * Permission states for tools
 * @enum {string}
 */
export const PermissionState = {
    ASK: 'ask',       // Prompt user each time (default)
    ALLOW: 'allow',   // Always allow (whitelisted)
    DENY: 'deny',     // Always deny (blacklisted)
};

/**
 * Metadata for destructive tools including explainer text
 */
const DESTRUCTIVE_TOOL_META = {
    create_document: {
        displayName: 'SIMULACRUM.Tools.document_create',
        explainer: 'SIMULACRUM.ToolExplainer.CreateDocument',
        defaultState: PermissionState.ASK,
    },
    update_document: {
        displayName: 'SIMULACRUM.Tools.document_update',
        explainer: 'SIMULACRUM.ToolExplainer.UpdateDocument',
        defaultState: PermissionState.ASK,
    },
    delete_document: {
        displayName: 'SIMULACRUM.Tools.document_delete',
        explainer: 'SIMULACRUM.ToolExplainer.DeleteDocument',
        defaultState: PermissionState.ASK,
    },
    execute_macro: {
        displayName: 'SIMULACRUM.Tools.execute_macro',
        explainer: 'SIMULACRUM.ToolExplainer.ExecuteMacro',
        defaultState: PermissionState.ASK,
    },
    run_javascript: {
        displayName: 'SIMULACRUM.Tools.run_javascript',
        explainer: 'SIMULACRUM.ToolExplainer.RunJavascript',
        defaultState: PermissionState.ASK,
    },
    configure_compendium: {
        displayName: 'SIMULACRUM.Tools.configure_compendium',
        explainer: 'SIMULACRUM.ToolExplainer.ConfigureCompendium',
        defaultState: PermissionState.ASK,
    },
    set_document_ownership: {
        displayName: 'SIMULACRUM.Tools.set_document_ownership',
        explainer: 'SIMULACRUM.ToolExplainer.SetDocumentOwnership',
        defaultState: PermissionState.ASK,
    },
};

/**
 * Tool Permission Manager
 * Manages per-tool permissions with persistence via Foundry settings
 */
class ToolPermissionManager {
    constructor() {
        this._settingsKey = 'toolPermissions';
        this._trustAllKey = 'trustAllTools';
    }

    /**
     * Check if a tool is marked as destructive
     * @param {string} toolName - Tool name
     * @returns {boolean}
     */
    isDestructive(toolName) {
        // Check static list
        if (DESTRUCTIVE_TOOL_META[toolName]) return true;

        // Check if it's a macro-based tool (they're all considered destructive)
        if (toolName.startsWith('macro_')) return true;

        return false;
    }

    /**
     * Get permission state for a tool
     * @param {string} toolName - Tool name
     * @returns {string} Permission state ('ask', 'allow', 'deny')
     */
    getPermission(toolName) {
        // Trust All mode overrides everything
        if (this.isTrustAllEnabled()) {
            return PermissionState.ALLOW;
        }

        const permissions = this._getStoredPermissions();
        return permissions[toolName] || PermissionState.ASK;
    }

    /**
     * Set permission state for a tool
     * @param {string} toolName - Tool name
     * @param {string} state - Permission state
     */
    async setPermission(toolName, state) {
        if (!Object.values(PermissionState).includes(state)) {
            throw new Error(`Invalid permission state: ${state}`);
        }

        const permissions = this._getStoredPermissions();

        if (state === PermissionState.ASK) {
            // Remove from stored permissions (ASK is default)
            delete permissions[toolName];
        } else {
            permissions[toolName] = state;
        }

        await game.settings.set('simulacrum', this._settingsKey, permissions);
        logger.info(`Permission for ${toolName} set to ${state}`);
    }

    /**
     * Check if tool is whitelisted (always allowed)
     * @param {string} toolName - Tool name
     * @returns {boolean}
     */
    isWhitelisted(toolName) {
        return this.getPermission(toolName) === PermissionState.ALLOW;
    }

    /**
     * Check if tool is blacklisted (always denied)
     * @param {string} toolName - Tool name
     * @returns {boolean}
     */
    isBlacklisted(toolName) {
        return this.getPermission(toolName) === PermissionState.DENY;
    }

    /**
     * Check if Trust All mode is enabled
     * @returns {boolean}
     */
    isTrustAllEnabled() {
        try {
            return game.settings.get('simulacrum', this._trustAllKey) === true;
        } catch {
            return false;
        }
    }

    /**
     * Get metadata for a destructive tool
     * @param {string} toolName - Tool name
     * @returns {Object|null} Tool metadata with displayName and explainer
     */
    getDestructiveToolMeta(toolName) {
        // Check static metadata
        if (DESTRUCTIVE_TOOL_META[toolName]) {
            const meta = DESTRUCTIVE_TOOL_META[toolName];
            return {
                displayName: game.i18n?.localize(meta.displayName) || toolName,
                explainer: game.i18n?.localize(meta.explainer) || 'This tool can modify your game data.',
            };
        }

        // For macro-based tools, generate dynamic metadata
        if (toolName.startsWith('macro_')) {
            const macroName = toolName.replace('macro_', '').replace(/_/g, ' ');
            return {
                displayName: `Macro: ${macroName}`,
                explainer: game.i18n?.localize('SIMULACRUM.ToolExplainer.MacroGeneric') ||
                    'Allows the AI to execute this macro, which may contain arbitrary code.',
            };
        }

        return null;
    }

    /**
     * Get all destructive tools with their current permissions
     * @returns {Array<Object>} Array of {toolName, displayName, permission, explainer}
     */
    getAllDestructiveTools() {
        const result = [];
        const permissions = this._getStoredPermissions();

        // 1. Add static destructive tools
        for (const [toolName, meta] of Object.entries(DESTRUCTIVE_TOOL_META)) {
            result.push({
                toolName,
                displayName: game.i18n?.localize(meta.displayName) || toolName,
                explainer: game.i18n?.localize(meta.explainer) || '',
                permission: permissions[toolName] || PermissionState.ASK,
                isStatic: true
            });
        }

        // 2. Discover registered macro tools
        const macroManager = game.modules.get('simulacrum')?.api?.macroToolManager;
        const registeredTools = macroManager ? macroManager.getTools() : [];

        const exists = (name) => result.some(t => t.toolName === name);

        for (const tool of registeredTools) {
            if (exists(tool.name)) continue;

            result.push({
                toolName: tool.name,
                displayName: tool.originalName || tool.name, // Use macro name for UX consistency
                explainer: tool.description || 'Custom Tool',
                permission: permissions[tool.name] || PermissionState.ASK,
                isStatic: false
            });
        }

        // 3. Add orphaned permissions (tools in history but not registered)
        for (const [toolName, permission] of Object.entries(permissions)) {
            if (!exists(toolName) && !DESTRUCTIVE_TOOL_META[toolName]) {
                result.push({
                    toolName,
                    displayName: `${toolName} (Missing)`,
                    explainer: 'Tool permission exists but tool is not registered.',
                    permission,
                    isStatic: false
                });
            }
        }

        return result;
    }

    /**
     * Get stored permissions from settings
     * @returns {Object} Permissions object
     * @private
     */
    _getStoredPermissions() {
        try {
            return game.settings.get('simulacrum', this._settingsKey) || {};
        } catch {
            return {};
        }
    }
}

// Singleton instance
export const toolPermissionManager = new ToolPermissionManager();
export { ToolPermissionManager, DESTRUCTIVE_TOOL_META };
