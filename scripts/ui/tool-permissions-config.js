/**
 * Tool Permissions Configuration - ApplicationV2 for managing destructive tool permissions
 * Uses the modern Foundry V13 HandlebarsApplicationMixin pattern
 */

import { createLogger } from '../utils/logger.js';
import { toolPermissionManager, PermissionState } from '../core/tool-permission-manager.js';

const logger = createLogger('ToolPermissionsConfig');

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * ApplicationV2 for configuring tool permissions
 * Allows users to set per-tool permission states (ask/allow/deny)
 * @extends ApplicationV2
 * @mixes HandlebarsApplication
 */
export class ToolPermissionsConfig extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
        id: 'simulacrum-tool-permissions',
        tag: 'form',
        window: {
            contentClasses: ['standard-form'],
            icon: 'fa-solid fa-shield-halved',
            title: 'SIMULACRUM.ToolPermissionsConfig.Title'
        },
        position: { width: 500, height: 640 },
        form: {
            closeOnSubmit: true,
            handler: ToolPermissionsConfig.#onSubmit
        },
        actions: {
            reset: ToolPermissionsConfig.#onReset
        }
    };

    /** @override */
    static PARTS = {
        form: {
            id: 'form',
            template: 'modules/simulacrum/templates/tool-permissions-config.hbs',
            root: true,
            scrollable: ['.scrollable']
        },
        footer: {
            template: 'templates/generic/form-footer.hbs'
        }
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(_options = {}) {
        const allTools = toolPermissionManager.getAllDestructiveTools();
        const trustAllEnabled = toolPermissionManager.isTrustAllEnabled();

        // Separate static destructive tools from dynamic macro tools
        const staticTools = allTools.filter(t => t.isStatic);
        const macroTools = allTools.filter(t => !t.isStatic);

        // Build permission choices for dropdowns
        const permissionChoices = {
            [PermissionState.ASK]: game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.PermissionState.Ask'),
            [PermissionState.ALLOW]: game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.PermissionState.Allow'),
            [PermissionState.DENY]: game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.PermissionState.Deny'),
        };

        return {
            trustAllEnabled,
            trustAllWarning: game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.TrustAllWarning'),
            staticTools: staticTools.map(tool => ({
                ...tool,
                isAsk: tool.permission === PermissionState.ASK,
                isAllow: tool.permission === PermissionState.ALLOW,
                isDeny: tool.permission === PermissionState.DENY,
            })),
            macroTools: macroTools.map(tool => ({
                ...tool,
                isAsk: tool.permission === PermissionState.ASK,
                isAllow: tool.permission === PermissionState.ALLOW,
                isDeny: tool.permission === PermissionState.DENY,
            })),
            permissionChoices,
            hasMacroTools: macroTools.length > 0,
            labels: {
                destructiveTools: game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.DestructiveTools'),
                macroTools: game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.MacroTools'),
                noMacroTools: game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.NoMacroTools'),
            },
            buttons: [
                { type: 'reset', action: 'reset', icon: 'fa-solid fa-arrows-rotate', label: 'SIMULACRUM.Settings.ToolPermissions.ResetDefaults' },
                { type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'SIMULACRUM.Settings.Save' }
            ]
        };
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /**
     * Handle form submission - save permission changes
     * @this {ToolPermissionsConfig}
     * @param {SubmitEvent} event - Submit event
     * @param {HTMLFormElement} form - The form element
     * @param {FormDataExtended} formData - Processed form data
     */
    static async #onSubmit(event, form, formData) {
        logger.info('Saving tool permissions:', formData.object);

        const data = formData.object;
        const permissions = {};

        // Handle Trust All setting
        const trustAllEnabled = !!data.trustAllTools;
        await game.settings.set('simulacrum', 'trustAllTools', trustAllEnabled);

        // Process each tool permission from form data
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('permission_')) {
                const toolName = key.replace('permission_', '');

                // Only store non-default permissions
                if (value !== PermissionState.ASK) {
                    permissions[toolName] = value;
                }
            }
        }

        // Save permissions
        await game.settings.set('simulacrum', 'toolPermissions', permissions);

        logger.info('Tool permissions saved:', permissions);
        ui.notifications.info(game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.Saved') || 'Tool permissions saved.');
    }

    /**
     * Handle reset button click
     * @this {ToolPermissionsConfig}
     * @param {PointerEvent} event - The click event
     * @param {HTMLElement} target - The button element
     */
    static async #onReset(event, target) {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.ResetDefaults') },
            content: `<p>${game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.ResetConfirm') || 'Are you sure you want to reset all tool permissions to their default values (Ask Each Time)?'}</p>`,
            yes: { default: true }
        });

        if (confirmed) {
            // Clear all stored permissions
            await game.settings.set('simulacrum', 'toolPermissions', {});
            await game.settings.set('simulacrum', 'trustAllTools', false);
            ui.notifications.info(game.i18n.localize('SIMULACRUM.Settings.ToolPermissions.ResetSuccess') || 'Tool permissions reset to defaults.');
            this.render();
        }
    }
}
