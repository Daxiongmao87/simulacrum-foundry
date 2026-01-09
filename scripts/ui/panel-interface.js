import { createLogger } from '../utils/logger.js';

/**
 * @class SimulacrumPanel
 * @description Represents the dedicated UI panel for the Simulacrum AI Assistant.
 *              Extends FoundryVTT's Application class to provide a custom interface.
 */
class SimulacrumPanel extends Application {
  /**
   * Constructor for SimulacrumPanel
   */
  constructor() {
    super();
    this.logger = createLogger('SimulacrumPanel');
  }

  /**
   * Returns the default options for the application.
   * @returns {object}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'simulacrum-panel',
      title: 'Simulacrum AI Assistant',
      template: 'modules/simulacrum/templates/panel.hbs',
      width: 720,
      height: 600,
      resizable: true,
      minimizable: true,
      classes: ['simulacrum', 'simulacrum-panel'],
    });
  }

  /**
   * Activates listeners for the panel's HTML elements.
   * @param {JQuery} html - The jQuery object for the panel's HTML.
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Example: Handle chat input submission
    html.find('.simulacrum-chat-input button').on('click', this._onChatSubmit.bind(this));
    html.find('.simulacrum-chat-input input').on('keydown', event => {
      if (event.key === 'Enter') {
        this._onChatSubmit(event);
      }
    });

    // Example: Handle tool confirmation buttons (if confirmation dialogs are part of the panel)
    // html.find('.simulacrum-confirmation-dialog button.confirm').on('click', this._onConfirmTool.bind(this));
    // html.find('.simulacrum-confirmation-dialog button.cancel').on('click', this._onCancelTool.bind(this));

    // Example: Handle settings button click to open module settings
    html.find('.simulacrum-settings-button').on('click', this._onOpenSettings.bind(this));
  }

  /**
   * Handles the submission of chat input from the panel.
   * @param {Event} event - The DOM event.
   * @private
   */
  async _onChatSubmit(event) {
    event.preventDefault();
    const inputField = this.element.find('.simulacrum-chat-input input[type="text"]');
    const messageText = inputField.val();
    if (!messageText || messageText.trim() === '') return;

    // Assuming SimulacrumCore is globally available or imported
    // For MVP, we'll just log and clear input.
    this.logger.info('User input:', messageText);

    // Here, you would typically send the message to the AI core for processing
    // Example: await SimulacrumCore.processMessage(messageText, game.user, { ui: 'panel' });
    // And then update the chat log within the panel with the response.

    inputField.val(''); // Clear input field
    // Request a re-render to update the chat log in the panel
    this.render(true);
  }

  /**
   * Handles opening the module settings configuration.
   * @param {Event} event - The DOM event.
   * @private
   */
  _onOpenSettings(event) {
    event.preventDefault();
    game.settings.sheet.render(true);
    // Optionally, navigate directly to Simulacrum's settings if possible
    // game.settings.sheet.activateTab('simulacrum');
  }

  /**
   * Fetches data for the panel's Handlebars template.
   * @returns {object} Data to be passed to the template.
   */
  getData() {
    // For MVP, return basic data. In a full implementation, this would include conversation history.
    return {
      isGM: game.user.isGM,
      // messages: SimulacrumCore.getConversationHistory() // Example
      messages: [
        {
          role: 'assistant',
          content: 'Hello! How can I assist you with your campaign documents today?',
        },
      ],
    };
  }
}

export { SimulacrumPanel };
