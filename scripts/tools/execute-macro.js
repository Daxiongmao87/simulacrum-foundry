/* eslint-disable complexity, max-depth */
import { BaseTool } from './base-tool.js';

/**
 * Tool to execute macros by name or UUID.
 * Useful for automating complex game interactions that are already defined in macros.
 */
export class ExecuteMacroTool extends BaseTool {
  constructor() {
    super(
      'execute_macro',
      'Execute a FoundryVTT macro by name or UUID. Macros are user-defined scripts that automate game actions such as rolling dice, applying effects, or modifying tokens. Provide `uuid` for precise targeting or `name` to search by macro name. Only GMs can execute macros through this tool.',
      {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the macro to execute. Searches world macros first, then compendium packs. Use `uuid` instead when multiple macros share the same name.',
          },
          uuid: {
            type: 'string',
            description: 'The UUID of the macro to execute (e.g., "Macro.abc123def456"). More precise than `name` — use when the exact macro identity is known.',
          },
          args: {
            type: 'object',
            description: 'An object of arguments to pass to the macro. The macro accesses these via the `scope` parameter in its code.',
          },
        },
      }
    );
  }

  getParameterSchema() {
    return this._addResponseParam(this.schema);
  }

  /**
   * @param {object} args
   * @param {string} [args.name]
   * @param {string} [args.uuid]
   * @param {object} [args.args]
   * @returns {Promise<Object>} Result with content and display
   */
  async execute({ name, uuid, args = {} } = {}) {
    if (!game.user.isGM) {
      return this.handleError('Permission denied: Only GMs can execute macros via Simulacrum.', 'PermissionError');
    }

    let macro;

    if (uuid) {
      macro = await fromUuid(uuid);
    } else if (name) {
      macro = game.macros.getName(name);

      // If not found in world, check compendiums (slow, but useful)
      if (!macro && game.packs) {
        for (const pack of game.packs) {
          if (pack.documentName === 'Macro') {
            const index = await pack.getIndex();
            const entry = index.find(e => e.name === name);
            if (entry) {
              macro = await pack.getDocument(entry._id);
              break;
            }
          }
        }
      }
    }

    if (!macro) {
      return this.handleError(`Macro not found: ${uuid || name}`, 'NotFoundError');
    }

    try {
      // Execute the macro, passing args in the scope
      const result = await macro.execute(args);
      const resultStr = result !== undefined ? `\nResult: ${JSON.stringify(result)}` : '';
      const content = `Successfully executed macro: ${macro.name}${resultStr}`;
      const display = `Executed macro: ${macro.name}`;
      return this.createSuccessResponse(content, display);
    } catch (err) {
      return this.handleError(`Error executing macro '${macro.name}': ${err.message}`, err.constructor.name);
    }
  }
}
