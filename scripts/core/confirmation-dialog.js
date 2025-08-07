// scripts/core/confirmation-dialog.js
// FoundryVTT integrated confirmation dialog for tool execution

export class ToolConfirmationDialog extends Dialog {
  /**
   * Show a confirmation dialog for a tool execution.
   * @param {string} toolName - Identifier of the tool.
   * @param {string} description - Human readable description of the operation.
   * @param {object} parameters - Parameters that will be passed to the tool.
   * @param {object} [options] - Additional options (e.g., type, title)
   * @returns {Promise<string>} - One of 'ProceedOnce', 'ProceedAlways', 'ModifyWithEditor', 'Cancel'.
   */
  static async show(toolName, description, parameters, options = {}) {
    const content = await this._buildContent(toolName, description, parameters, options);
    return new Promise((resolve) => {
      new Dialog({
        title: `Confirm Tool Execution: ${toolName}`,
        content,
        buttons: {
          proceedOnce: {
            label: game.i18n.localize('SIMULACRUM.ConfirmProceedOnce') || 'Proceed Once',
            callback: () => resolve('ProceedOnce')
          },
          proceedAlways: {
            label: game.i18n.localize('SIMULACRUM.ConfirmProceedAlways') || 'Proceed Always',
            callback: () => resolve('ProceedAlways')
          },
          modify: {
            label: game.i18n.localize('SIMULACRUM.ConfirmModify') || 'Modify',
            callback: () => resolve('ModifyWithEditor')
          },
          cancel: {
            label: game.i18n.localize('SIMULACRUM.ConfirmCancel') || 'Cancel',
            callback: () => resolve('Cancel')
          }
        },
        default: 'proceedOnce'
      }).render(true);
    });
  }

  static async _buildContent(toolName, description, parameters, options) {
    const impact = await this._assessImpact(toolName, parameters, options);
    return `
      <div class="simulacrum-confirmation-dialog">
        <h3>${toolName}</h3>
        <p>${description}</p>
        <div class="parameters"><h4>Parameters:</h4><pre>${JSON.stringify(parameters, null, 2)}</pre></div>
        <div class="impact"><h4>Expected Impact:</h4><p>${impact}</p></div>
      </div>`;
  }

  static async _assessImpact(toolName, parameters, options) {
    switch (toolName) {
      case 'create_document':
        return `Will create a new ${parameters.documentType} document named "${parameters.name}".`;
      case 'update_document':
        return `Will update ${parameters.documentType} document with id ${parameters.documentId}.`;
      case 'delete_document':
        return `Will permanently delete ${parameters.documentType} document with id ${parameters.documentId}.`;
      case 'get_world_info':
        return 'Will retrieve world information.';
      default:
        return 'Will execute the requested operation.';
    }
  }
}
