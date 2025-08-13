import { SimulacrumSettings } from '../settings.js';
// import { ToolRegistry } from '../tools/tool-registry.js'; // Available for future use

/**
 * A FormApplication for configuring tool permissions.
 */
export class ToolPermissionsConfig extends FormApplication {
  constructor(object = {}, options = {}) {
    super(object, options);
    this.toolRegistry = game.simulacrum.toolRegistry; // Access the global tool registry
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize('SIMULACRUM.ToolPermissionsConfigTitle'),
      id: 'simulacrum-tool-permissions-config',
      template: 'modules/simulacrum/templates/tool-permissions-config.html',
      width: 600,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: true,
      resizable: true,
      classes: ['simulacrum', 'settings', 'tool-permissions'],
    });
  }

  /**
   * Get the data for the form application.
   * @returns {object}
   */
  getData() {
    const toolPermissions = SimulacrumSettings.getToolPermissions();
    const tools = Array.from(this.toolRegistry.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      permission: toolPermissions[tool.name] || 'confirm', // Default to 'confirm'
    }));

    return {
      tools: tools,
      permissions: {
        allow: game.i18n.localize('SIMULACRUM.PermissionAllow'),
        confirm: game.i18n.localize('SIMULACRUM.PermissionConfirm'),
        deny: game.i18n.localize('SIMULACRUM.PermissionDeny'),
      },
    };
  }

  /**
   * Activate event listeners for the form application.
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    html
      .find('.permission-cycle-button')
      .on('click', this._onCyclePermission.bind(this));
  }

  /**
   * Handle cycling through permission states.
   * @param {Event} event
   * @private
   */
  _onCyclePermission(event) {
    const button = $(event.currentTarget);
    const toolName = button.data('tool-name');
    const currentPermission = button.data('current-permission');

    const permissionStates = ['confirm', 'allow', 'deny'];
    const currentIndex = permissionStates.indexOf(currentPermission);
    const nextIndex = (currentIndex + 1) % permissionStates.length;
    const nextPermission = permissionStates[nextIndex];

    // Update the button's data and text
    button.data('current-permission', nextPermission);
    button.text(
      game.i18n.localize(
        `SIMULACRUM.Permission${nextPermission.charAt(0).toUpperCase() + nextPermission.slice(1)}`
      )
    );
    button
      .removeClass('permission-allow permission-confirm permission-deny')
      .addClass(`permission-${nextPermission}`);

    // Update the hidden input value
    html.find(`input[name="toolPermissions.${toolName}"]`).val(nextPermission);

    // Manually submit the form to save the setting immediately
    this.submit({
      preventClose: true,
      preventRender: false,
    });
  }

  /**
   * This method is called when the form is submitted.
   * @param {Event} event
   * @param {object} formData
   * @private
   */
  async _updateObject(event, formData) {
    const toolPermissions = expandObject(formData).toolPermissions || {};
    await SimulacrumSettings.setToolPermissions(toolPermissions);
    ui.notifications.info(
      game.i18n.localize('SIMULACRUM.ToolPermissionsSaved')
    );
  }
}
