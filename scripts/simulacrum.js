/* eslint-disable max-lines-per-function */
// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

/**
 * Main entry point for the Simulacrum FoundryVTT module.
 * This script handles module initialization, settings registration,
 * and hooks into FoundryVTT's lifecycle.
 */

import { SimulacrumCore } from './core/simulacrum-core.js';
import { MacroToolManager } from './core/macro-tool-manager.js';
import { toolRegistry } from './core/tool-registry.js';
import { registerSimulacrumSidebarTab } from './ui/sidebar-registration.js';
import { registerAdvancedSettings, registerSettingsEnhancements } from './ui/settings-interface.js';
import { createLogger } from './utils/logger.js';
import { BUILD_HASH } from './build-info.js';
import { InteractionLogDownloader } from './core/interaction-logger.js';
import { assetIndexService } from './core/asset-index-service.js';


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
    hint: 'Choose OpenAI-compatible or Gemini behavior.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      openai: 'OpenAI-compatible',
      gemini: 'Gemini',
    },
    default: 'openai',
    restricted: true,
    onChange: async _value => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after provider change');
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after provider change', e);
      }
    },
  });

  game.settings.register(MODULE_ID, 'apiKey', {
    name: game.i18n.localize('SIMULACRUM.Settings.ApiKey.Name'),
    hint: game.i18n.localize('SIMULACRUM.Settings.ApiKey.Hint'),
    scope: 'world',
    config: true,
    type: String,
    default: '',
    restricted: true,
    onChange: async _value => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after apiKey change');
        // Re-render sidebar to update configuration state
        if (ui.simulacrum?.rendered) ui.simulacrum.render();
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after apiKey change', e);
      }
    },
  });

  game.settings.register(MODULE_ID, 'baseURL', {
    name: 'API Base URL',
    hint: 'Base URL for the AI provider API (for Ollama or custom endpoints).',
    scope: 'world',
    config: true,
    type: String,
    default: 'http://localhost:11434/v1',
    restricted: true,
    onChange: async _value => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after baseURL change');
        // Re-render sidebar to update configuration state
        if (ui.simulacrum?.rendered) ui.simulacrum.render();
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after baseURL change', e);
      }
    },
  });

  game.settings.register(MODULE_ID, 'model', {
    name: 'AI Model',
    hint: 'The AI model to use (e.g., gpt-3.5-turbo, llama2).',
    scope: 'world',
    config: true,
    type: String,
    default: 'gpt-3.5-turbo',
    restricted: true,
    onChange: async _value => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after model change');
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after model change', e);
      }
    },
  });

  game.settings.register(MODULE_ID, 'tokenLimit', {
    name: 'Token Limit',
    hint: 'The maximum context window size (tokens) for the AI model. Defaults to 32000.',
    scope: 'world',
    config: true,
    type: Number,
    default: 32000,
    restricted: true,
    onChange: async _value => {
      try {
        await SimulacrumCore.initializeAIClient();
        createLogger('Module').info('AI client reinitialized after tokenLimit change');
      } catch (e) {
        createLogger('Module').warn('Failed to reinitialize AI after tokenLimit change', e);
      }
    },
  });

  game.settings.register(MODULE_ID, 'apiRequestDelay', {
    name: 'API Request Delay',
    hint: 'Delay in milliseconds between API requests to prevent rate limiting (default 500ms).',
    scope: 'world',
    config: true,
    type: Number,
    default: 500,
    restricted: true,
  });

  game.settings.register(MODULE_ID, 'toolLoopLimit', {
    name: 'Autonomous Tool Loop Limit',
    hint: 'Maximum number of consecutive tool steps the AI can take autonomously. Set to 0 for infinite (no limit). Default is 100.',
    scope: 'world',
    config: true,
    type: Number,
    default: 100,
    restricted: true,
  });

  // Download Interaction Log button - uses registerMenu for a button in settings
  game.settings.registerMenu(MODULE_ID, 'downloadInteractionLog', {
    name: 'Download Interaction Log',
    label: 'Download Log',
    hint: 'Download all agent interactions (messages, tool calls, results) as a JSON file for debugging.',
    icon: 'fas fa-download',
    type: InteractionLogDownloader,
    restricted: false,
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
    ui.simulacrum = new CONFIG.ui.simulacrum({ id: 'simulacrum' });
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
      'modules/simulacrum/templates/simulacrum/message.hbs',
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
  // GM-ONLY ACCESS GATE: Non-GM users cannot use Simulacrum
  // This is a security measure until complete permissions-based implementation is ready.
  if (!game.user?.isGM) {
    logger.info('Simulacrum is GM-only. Non-GM user detected, disabling module.');

    // Remove sidebar tab from Sidebar.TABS to hide it
    const Sidebar = globalThis.foundry?.applications?.sidebar?.Sidebar ?? globalThis.Sidebar;
    if (Sidebar?.TABS?.simulacrum) {
      delete Sidebar.TABS.simulacrum;
    }

    // Destroy the sidebar tab instance if it exists
    if (ui.simulacrum) {
      try {
        ui.simulacrum.close?.();
      } catch (_e) {
        // Ignore close errors
      }
      delete ui.simulacrum;
    }

    // Remove from CONFIG.ui to prevent re-instantiation
    if (CONFIG?.ui?.simulacrum) {
      delete CONFIG.ui.simulacrum;
    }

    // CRITICAL: Remove the tab button AND parent <li> from DOM to avoid empty gap
    const tabButton = document.querySelector('[data-tab="simulacrum"]');
    if (tabButton) {
      const parentLi = tabButton.closest('li');
      if (parentLi) {
        parentLi.remove();
      } else {
        tabButton.remove();
      }
      logger.info('Removed simulacrum tab from DOM for non-GM user');
    }

    return; // Exit early, do not initialize any further
  }

  // Check if endpoint configuration is missing or invalid
  const apiKey = game.settings.get(MODULE_ID, 'apiKey');
  const baseURL = game.settings.get(MODULE_ID, 'baseURL');
  const hasValidConfig = apiKey || baseURL; // At minimum, one should be configured

  if (!hasValidConfig) {
    logger.warn('Simulacrum endpoint not configured. Tab will show configuration prompt.');
    // We don't remove the tab, but the sidebar will show a configuration message
  }

  // Expose API
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = SimulacrumCore;
  }

  // Initialize MacroToolManager with toolRegistry for integration
  const macroToolManager = new MacroToolManager(toolRegistry);
  await macroToolManager.initialize();

  // Expose manager on module API
  if (module) {
    module.api.macroToolManager = macroToolManager;
  }

  // Initialize interaction logger (loads persisted entries)
  const { interactionLogger } = await import('./core/interaction-logger.js');
  await interactionLogger.initialize();

  // Initialize asset index service in background (non-blocking)
  // Search tool will await the index if called before it's ready
  assetIndexService.initialize();

  const version = game.modules.get(MODULE_ID)?.version ?? 'unknown';
  logger.info(`${MODULE_NAME} v${version} is ready! [build:${BUILD_HASH}]`);
});

// Basic error handling for the module's main script
try {
  // Any synchronous code that might throw an error during initial load
} catch (error) {
  logger.error('Uncaught error in main script:', error);
}
