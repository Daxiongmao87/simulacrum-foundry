import { SimulacrumSettings } from '../settings.js';

/**
 * Base class for all tools.
 * Subclasses must implement execute() and may override shouldConfirmExecute().
 */
export class Tool {
  /**
   * @param {string} name - Unique identifier for the tool.
   * @param {string} description - Human‑readable description.
   * @param {object} parameterSchema - JSON schema for input parameters.
   * @param {boolean} isOutputMarkdown - Whether output is markdown.
   * @param {boolean} canUpdateOutput - Whether tool can modify previous output.
   */
  constructor(name, description, parameterSchema = {}, isOutputMarkdown = false, canUpdateOutput = false) {
    this.name = name;
    this.description = description;
    this.parameterSchema = parameterSchema;
    this.isOutputMarkdown = isOutputMarkdown;
    this.canUpdateOutput = canUpdateOutput;
  }

  /**
   * Execute the tool with the given parameters.
   * @param {object} params
   * @returns {Promise<object>} ToolResult
   */
  async execute(params) {
    throw new Error('execute() not implemented');
  }

  /**
   * Indicates whether the tool requires user confirmation before execution.
   * Subclasses may override.
   */
  shouldConfirmExecute() {
    return true;
  }
}

/**
 * Registry for managing available tools.
 */
export class ToolRegistry {
  constructor() {
    /** @type {Map<string, Tool>} */
    this.tools = new Map();
  }

  /**
   * Register a new tool.
   * @param {Tool} tool
   */
  registerTool(tool) {
    if (!(tool instanceof Tool)) {
      throw new Error('Attempted to register an invalid tool');
    }
    if (this.tools.has(tool.name)) {
      console.warn(`Tool with name "${tool.name}" is already registered. Overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieve a tool by name.
   * @param {string} name
   * @returns {Tool}
   */
  getTool(name) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found in registry`);
    }
    return tool;
  }

  /**
   * Check if a tool exists.
   * @param {string} name
   * @returns {boolean}
   */
  hasTool(name) {
    return this.tools.has(name);
  }

  /**
   * Confirm execution of a tool, respecting YOLO mode and permissions.
   * @param {User} user
   * @param {string} toolName
   * @param {object} params
   * @returns {Promise<boolean>} true if execution should proceed
   */
  async confirmExecution(user, toolName, params) {
    const tool = this.getTool(toolName);
    if (!SimulacrumSettings.hasSimulacrumPermission(user)) {
      throw new Error('User lacks permission to execute tools');
    }
    const yolo = game.settings.get('simulacrum', 'yoloMode');
    if (yolo) return true;
    if (!tool.shouldConfirmExecute()) return true;
    const toolPermissions = game.settings.get('simulacrum', 'toolPermissions') || {};
    const permission = toolPermissions[toolName];

    if (permission === 'autoconfirm') {
      console.log(`Simulacrum | Auto-confirming tool ${toolName}`);
      return true;
    } else if (permission === 'deny') {
      ui.notifications.error(`Simulacrum | Tool ${toolName} execution denied by permissions.`);
      return false;
    }

    const dialogContent = await renderTemplate('modules/simulacrum/templates/tool-confirmation.html', {
      toolName: toolName,
      toolDescription: tool.description,
      parameters: JSON.stringify(params, null, 2)
    });

    return new Promise((resolve) => {
      new Dialog({
        title: `Confirm Tool Execution: ${toolName}`,
        content: dialogContent,
        buttons: {
          yesOnce: {
            label: 'Yes, once',
            callback: () => resolve(true)
          },
          yesAlways: {
            label: 'Yes, always',
            callback: () => {
              toolPermissions[toolName] = 'autoconfirm';
              game.settings.set('simulacrum', 'toolPermissions', toolPermissions);
              ui.notifications.info(`Simulacrum | Tool '${toolName}' will now auto-confirm.`);
              resolve(true);
            }
          },
          modify: {
            label: 'Modify',
            callback: () => {
              // For now, just log and cancel. Actual modification UI will be more complex.
              ui.notifications.warn('Simulacrum | Parameter modification not yet fully implemented.');
              resolve(false); // Do not proceed with execution
            }
          },
          cancel: {
            label: 'Cancel',
            callback: () => resolve(false)
          }
        },
        default: 'yesOnce',
        render: (html) => {
          // Populate content dynamically after render
          html.find('.tool-name').text(toolName);
          html.find('.tool-description').text(tool.description);
          html.find('.parameters-json').text(JSON.stringify(params, null, 2));

          // Expand/collapse JSON
          html.find('.expand-json-button').on('click', (event) => {
            const pre = $(event.currentTarget).prev('.parameters-json');
            pre.toggleClass('expanded');
            $(event.currentTarget).find('i').toggleClass('fa-expand-alt fa-compress-alt');
          });
        }
      }, {
        width: 500,
        height: 'auto',
        resizable: true
      }).render(true);
    });
  }
}
