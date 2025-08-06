import { Tool } from "./tool-registry.js";

export class ClearContextTool extends Tool {
  constructor() {
    super(
      "clear_context",
      "Clear all conversation context",
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
      const itemCount = contextManager.getContextItems().length;
      contextManager.clearContext();
      
      return {
        success: true,
        data: {
          message: `Cleared ${itemCount} items from conversation context`,
          itemsCleared: itemCount
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  shouldConfirmExecute() {
    return true; // Require confirmation for destructive operation
  }
}