/**
 * Confirmation Dialog System - User confirmation for destructive operations
 * Adapted from qwen-code patterns for FoundryVTT integration
 */

import { createLogger } from '../utils/logger.js';

/**
 * @class ConfirmationDialog
 * @description Provides user confirmation dialogs for tool operations
 */
class ConfirmationDialog {
  /**
   * Show confirmation dialog for an operation
   * @param {Object} details - Confirmation details
   * @param {string} details.type - Operation type ('delete', 'update', etc.)
   * @param {string} details.title - Dialog title
   * @param {string} details.details - Operation details
   * @returns {Promise<boolean>} True if confirmed, false if cancelled
   */
  static async confirm(details) {
    // Non-destructive operations don't need confirmation
    if (!this.requiresConfirmation(details.type)) {
      return true;
    }

    const config = this.getConfirmationConfig(details);
    const message = this.formatConfirmationMessage(details);

    try {
      return await Dialog.confirm({
        title: config.title,
        content: message,
        yes: () => true,
        no: () => false,
        defaultYes: config.defaultYes,
        options: {
          classes: ['simulacrum-confirmation'],
          width: 400,
        },
      });
    } catch (error) {
      const logger = createLogger('ConfirmationDialog');
      logger.warn('Confirmation dialog error', error);
      return false;
    }
  }

  /**
   * Check if operation type requires confirmation
   * @param {string} type - Operation type
   * @returns {boolean} True if confirmation required
   */
  static requiresConfirmation(type) {
    const destructiveTypes = ['delete', 'update', 'create'];
    return destructiveTypes.includes(type);
  }

  /**
   * Get confirmation dialog configuration
   * @param {Object} details - Operation details
   * @returns {Object} Dialog configuration
   */
  static getConfirmationConfig(details) {
    const configs = {
      delete: {
        title: details.title,
        yes: '<i class="fa-solid fa-trash"></i> Delete',
        no: '<i class="fa-solid fa-times"></i> Cancel',
        defaultYes: false,
      },
      update: {
        title: details.title,
        yes: '<i class="fa-solid fa-check"></i> Update',
        no: '<i class="fa-solid fa-times"></i> Cancel',
        defaultYes: true,
      },
      create: {
        title: details.title,
        yes: '<i class="fa-solid fa-plus"></i> Create',
        no: '<i class="fa-solid fa-times"></i> Cancel',
        defaultYes: true,
      },
    };

    return configs[details.type] || configs.update;
  }

  /**
   * Format confirmation message
   * @param {Object} details - Operation details
   * @returns {string} Formatted message
   */
  static formatConfirmationMessage(details) {
    let message = details.details;

    // Add warning for destructive operations
    if (details.type === 'delete') {
      message += '<br><br><strong style="color: var(--color-warning);">';
      message += '<i class="fa-solid fa-exclamation-triangle"></i> ';
      message += 'This action cannot be undone!</strong>';
    } else if (details.type === 'update') {
      message += '<br><br><em>Are you sure you want to proceed?</em>';
    }

    return message;
  }

  /**
   * Show a simple confirmation dialog
   * @param {string} title - Dialog title
   * @param {string} message - Message to display
   * @param {boolean} defaultYes - Default to yes
   * @returns {Promise<boolean>} Confirmation result
   */
  static async simpleConfirm(title, message, defaultYes = true) {
    return this.confirm({
      type: defaultYes ? 'update' : 'delete',
      title,
      details: message,
    });
  }

  /**
   * Show an error dialog
   * @param {string} title - Dialog title
   * @param {string} message - Error message
   * @returns {Promise<void>}
   */
  static async showError(title, message) {
    await Dialog.confirm({
      title: `<i class="fa-solid fa-exclamation-circle"></i> ${title}`,
      content: `<div style="color: var(--color-warning);">${message}</div>`,
      yes: () => {},
      no: false,
      options: {
        classes: ['simulacrum-error'],
        width: 400,
      },
    });
  }

  /**
   * Show an info dialog
   * @param {string} title - Dialog title
   * @param {string} message - Info message
   * @returns {Promise<void>}
   */
  static async showInfo(title, message) {
    await Dialog.confirm({
      title: `<i class="fa-solid fa-info-circle"></i> ${title}`,
      content: message,
      yes: () => {},
      no: false,
      options: {
        classes: ['simulacrum-info'],
        width: 400,
      },
    });
  }
}

export { ConfirmationDialog };
