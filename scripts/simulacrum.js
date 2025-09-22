// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

/**
 * Main entry point for the Simulacrum FoundryVTT module.
 * This script handles module initialization, settings registration,
 * and hooks into FoundryVTT's lifecycle.
 */

import { SimulacrumCore } from './core/simulacrum-core.js';
import SimulacrumSidebarTab, { registerSimulacrumSidebarTab } from './ui/simulacrum-sidebar-tab.js';
import { registerAdvancedSettings, registerSettingsEnhancements } from './ui/settings-interface.js';
import { createLogger } from './utils/logger.js';

const MODULE_ID = 'simulacrum';
const MODULE_NAME = 'Simulacrum AI Assistant';
const logger = createLogger('Module');

// No world-level enable toggle: module activation is managed by Foundry's
// Manage Modules (core.moduleConfiguration). Do not register a redundant toggle.

/**
 * Register API settings
 */
function registerAPISettings() {
  game.settings.register(MODULE_ID, 'provider', {
    name: 'API Provider',
    hint: 'Choose OpenAI-compatible or Gemini-compatible behavior.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      openai: 'OpenAI-compatible',
      gemini: 'Gemini-compatible'
    },
    default: 'openai',
    restricted: true,
    onChange: async (_value) => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after provider change');
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after provider change', e);
      }
    }
  });

  game.settings.register(MODULE_ID, 'apiKey', {
    name: game.i18n.localize('SIMULACRUM.Settings.ApiKey.Name'),
    hint: game.i18n.localize('SIMULACRUM.Settings.ApiKey.Hint'),
    scope: 'world',
    config: true,
    type: String,
    default: '',
    restricted: true,
    onChange: async (_value) => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after apiKey change');
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after apiKey change', e);
      }
    }
  });

  game.settings.register(MODULE_ID, 'baseURL', {
    name: 'API Base URL',
    hint: 'Base URL for the AI provider API (for Ollama or custom endpoints).',
    scope: 'world',
    config: true,
    type: String,
    default: 'http://localhost:11434/v1',
    restricted: true,
    onChange: async (_value) => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after baseURL change');
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after baseURL change', e);
      }
    }
  });

  game.settings.register(MODULE_ID, 'model', {
    name: 'AI Model',
    hint: 'The AI model to use (e.g., gpt-3.5-turbo, llama2).',
    scope: 'world',
    config: true,
    type: String,
    default: 'gpt-3.5-turbo',
    restricted: true,
    onChange: async (_value) => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after model change');
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after model change', e);
      }
    }
  });
}

Hooks.once('init', async () => {
  logger.info(`Initializing ${MODULE_NAME}`);

  // Register module settings (no redundant enable toggle)
  registerAPISettings();
  registerAdvancedSettings();
  registerSettingsEnhancements();

  // Register sidebar tab
  registerSimulacrumSidebarTab();

  // CRITICAL FIX (DEFECT #1): Instantiate immediately after registration
  // This ensures ui.simulacrum exists when FoundryVTT's core UI initialization runs
  if (CONFIG && CONFIG.ui && CONFIG.ui.simulacrum) {
    ui.simulacrum = new CONFIG.ui.simulacrum({id: 'simulacrum'});
    logger.info('Simulacrum sidebar tab instantiated during init for popout support');
  } else {
    logger.error('CONFIG.ui.simulacrum not found after registration - popout will not work');
  }

  // Preload Handlebars templates and partials used by the sidebar
  try {
    const templates = [
      'modules/simulacrum/templates/simulacrum/sidebar.hbs',
      'modules/simulacrum/templates/simulacrum/sidebar-log.hbs',
      'modules/simulacrum/templates/simulacrum/sidebar-input.hbs',
      'modules/simulacrum/templates/simulacrum/message.hbs'
    ];
    // Ensure loadTemplates exists in the Foundry environment
    if (typeof loadTemplates === 'function') {
      await loadTemplates(templates);
      logger.info('Simulacrum templates preloaded');
    } else {
      logger.warn('loadTemplates not available; partials may not render');
    }
  } catch (err) {
    logger.error('Failed preloading templates', err);
  }

  // Initialize core systems
  SimulacrumCore.init();

  // Expose core on window for UI components that reference it
  if (typeof window !== 'undefined') {
    window.SimulacrumCore = SimulacrumCore;
  }

  logger.info('Settings registered');
});

Hooks.once('ready', async () => {
  logger.info(`${MODULE_NAME} is ready!`);
});

// Basic error handling for the module's main script
try {
  // Any synchronous code that might throw an error during initial load
} catch (error) {
  logger.error('Uncaught error in main script:', error);
}
