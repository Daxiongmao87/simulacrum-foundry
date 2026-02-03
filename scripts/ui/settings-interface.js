/* eslint-disable max-len */
/**
 * Settings Configuration - Enhanced settings management with validation
 * Provides settings registration and UI enhancements for Foundry's settings config
 */

import { createLogger } from '../utils/logger.js';
import { ToolPermissionsConfig } from './tool-permissions-config.js';

/**
 * Helper function that converts an input field for a setting into a textarea.
 * @param {Object} options Configuration options
 */
function convertSettingToTextarea({
  html,
  moduleId,
  settingKey,
  textareaStyle,
  repositionCallback,
}) {
  const fullSettingId = `${moduleId}.${settingKey}`;

  // Ensure html is a jQuery object for consistent API usage
  const $html = html instanceof jQuery ? html : $(html);

  // Find the input directly by name attribute (V12 compatible)
  const inputEl = $html.find(`input[name="${fullSettingId}"]`);
  if (!inputEl.length) {
    console.warn(`[Simulacrum] Could not find input element for ${fullSettingId}`);
    return;
  }

  // Get the form-group parent (contains label, input, and hint)
  const settingDiv = inputEl.closest('.form-group');
  if (!settingDiv.length) {
    console.warn(`[Simulacrum] Could not find form-group parent for ${fullSettingId}`);
    return;
  }

  // Get the original stored value from settings
  let storedValue = game.settings.get(moduleId, settingKey) || '';
  storedValue = storedValue.replace(/\\n/g, '\n');

  // Create the textarea with proper attributes for code display
  const textarea = $(`
    <textarea name="${fullSettingId}"
              id="${fullSettingId}"
              style="font-family: monospace; white-space: pre; overflow-x: auto; ${textareaStyle}"
              wrap="off">${storedValue}</textarea>
  `);

  // Replace the input with our textarea
  inputEl.replaceWith(textarea);

  // When the textarea changes, properly escape newlines before saving
  textarea.on('change', async ev => {
    const rawValue = ev.target.value;
    const escaped = rawValue.replace(/\n/g, '\\n');
    await game.settings.set(moduleId, settingKey, escaped);
  });

  if (typeof repositionCallback === 'function') {
    repositionCallback(settingDiv);
  }
}

/**
 * Register additional settings not in basic config
 * Called during module initialization
 */
/**
 * Register additional settings not in basic config
 * Called during module initialization
 */
export function registerAdvancedSettings() {
  _registerCoreSettings();
  _registerLegacySettings();
  _registerContextSettings();
  _registerStylingSettings();
  _registerToolPermissionSettings();
}

function _registerToolPermissionSettings() {
  // Register the settings menu button for Tool Permissions
  game.settings.registerMenu('simulacrum', 'toolPermissionsMenu', {
    name: 'SIMULACRUM.Settings.ToolPermissions.Name',
    label: 'SIMULACRUM.Settings.ToolPermissions.Label',
    hint: 'SIMULACRUM.Settings.ToolPermissions.Hint',
    icon: 'fa-solid fa-shield-halved',
    type: ToolPermissionsConfig,
    restricted: true,
  });

  // Trust All Tools - bypass all confirmations (dangerous)
  game.settings.register('simulacrum', 'trustAllTools', {
    name: 'SIMULACRUM.Settings.TrustAllTools',
    hint: 'SIMULACRUM.Settings.TrustAllToolsHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    restricted: true,
  });

  // Per-tool permission states (stored as object)
  game.settings.register('simulacrum', 'toolPermissions', {
    name: 'Tool Permissions',
    hint: 'Per-tool permission states for destructive tools.',
    scope: 'world',
    config: false, // Managed via ToolPermissionsConfig UI
    type: Object,
    default: {},
    restricted: true,
  });
}

function _registerCoreSettings() {
  game.settings.register('simulacrum', 'maxTokens', {
    name: 'Maximum Tokens',
    hint: 'Maximum number of tokens for AI responses.',
    scope: 'world',
    config: false,
    type: Number,
    default: 4096,
    restricted: true,
  });

  game.settings.register('simulacrum', 'temperature', {
    name: 'Response Temperature',
    hint: 'Controls randomness in AI responses (0.0-1.0).',
    scope: 'world',
    config: false,
    type: Number,
    default: 0.7,
    restricted: true,
  });
}

function _registerLegacySettings() {
  // Legacy mode is disabled for v1.0 release - not fully tested or at parity with native tool mode
  // The setting is registered but hidden from UI (config: false)
  game.settings.register('simulacrum', 'legacyMode', {
    name: 'Legacy Mode',
    hint: "Enable if your AI provider doesn't support OpenAI-style tool calling. Uses JSON block parsing instead. Note that this is less reliable.",
    scope: 'world',
    config: false, // Disabled for v1.0 - requires further testing
    type: Boolean,
    default: false,
    restricted: true,
  });
}

function _registerContextSettings() {
}

function _registerStylingSettings() {
  game.settings.register('simulacrum', 'customSystemPrompt', {
    name: 'Custom System Prompt',
    hint: 'Additional instructions to append to the system prompt.',
    scope: 'world',
    config: true,
    type: String,
    default: '',
    restricted: true,
  });
}

/**
 * Register settings UI enhancements
 */
export function registerSettingsEnhancements() {
  Hooks.on('renderSettingsConfig', (app, html, _data) => {
    setTimeout(() => {
      try {
        _applyEnhancements(html);
      } catch (error) {
        createLogger('Settings').error('Error in settings render:', error);
      }
    }, 100);
  });
}

function _applyEnhancements(html) {
  // Ensure html is a jQuery object for consistent API usage (ApplicationV2 may pass HTMLElement)
  const $html = html instanceof jQuery ? html : $(html);

  const style =
    'width: 518px; min-height: 80px; height: 120px; white-space: normal; word-wrap: break-word;';
  const callback = settingDiv => {
    const notesEl = settingDiv.find('p.notes');
    const formFieldsEl = settingDiv.find('div.form-fields');
    if (notesEl.length && formFieldsEl.length) {
      notesEl.after(formFieldsEl);
    }
  };

  convertSettingToTextarea({
    html: $html,
    moduleId: 'simulacrum',
    settingKey: 'customSystemPrompt',
    textareaStyle: style,
    repositionCallback: callback,
  });

  // Add Discord link to Simulacrum settings tab
  _addDiscordLink($html);

  $html.find('a.item[data-tab="simulacrum"]').on('click', () => {
    setTimeout(() => {
      // Check if input exists and hasn't been converted to textarea yet
      if ($html.find('input[name="simulacrum.customSystemPrompt"]').length) {
        convertSettingToTextarea({
          html: $html,
          moduleId: 'simulacrum',
          settingKey: 'customSystemPrompt',
          textareaStyle: style,
          repositionCallback: callback,
        });
      }
      // Re-add Discord link when tab is clicked (in case it was re-rendered)
      _addDiscordLink($html);
    }, 500);
  });
}

function _addDiscordLink($html) {
  // Try both section and div for V12/V13 compatibility
  let simulacrumTab = $html.find('section[data-tab="simulacrum"]');
  if (!simulacrumTab.length) {
    simulacrumTab = $html.find('div[data-tab="simulacrum"]');
  }
  if (!simulacrumTab.length) return;

  // Don't add if already present
  if (simulacrumTab.find('.simulacrum-discord-link').length) return;

  const discordHtml = `
    <div class="form-group simulacrum-discord-link">
      <label>Join our community</label>
      <div class="form-fields">
        <button type="button" class="discord-btn" onclick="window.open('https://discord.gg/VSs8jZBgmP', '_blank')">
          <i class="fab fa-discord"></i>
          <span>Discord</span>
        </button>
      </div>
    </div>
  `;

  simulacrumTab.prepend(discordHtml);
}
