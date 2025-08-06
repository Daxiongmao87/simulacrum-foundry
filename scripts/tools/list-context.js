import { Tool } from "./tool-registry.js";

export class ListContextTool extends Tool {
  constructor() {
    super(
      "list_context",
      "Show current conversation context",
      {
        type: "object",
        properties: {},
        required: []
      }
    );
  }

  async execute(params) {
    try {
      const contextManager = game.simulacrum.contextManager;
      const contextItems = contextManager.getContextItems();
      
      return {
        success: true,
        data: {
          contextItems: contextItems,
          totalItems: contextItems.length,
          message: `Current context contains ${contextItems.length} items`
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  shouldConfirmExecute() {
    return false; // No confirmation needed for read-only operation
  }
}
