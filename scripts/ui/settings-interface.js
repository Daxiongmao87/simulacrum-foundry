/* eslint-disable max-len */
/**
 * Settings Configuration Interface - Enhanced settings management with validation
 * Provides API connection testing and advanced configuration options
 */

import { createLogger } from '../utils/logger.js';
import { ToolPermissionsConfig } from './tool-permissions-config.js';

/**
 * Settings Configuration Application - Custom settings interface with validation
 * Extends FoundryVTT's basic settings with API testing and advanced validation
 */
export class SettingsInterface extends FormApplication {
  /**
   * Create settings interface instance
   * @param {Object} [options={}] - Application options
   */
  constructor(options = {}) {
    super({}, options);
    this.testing = false;
    this.logger = createLogger('SettingsInterface');
  }

  /**
   * Default application options
   */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'simulacrum-settings',
      classes: ['simulacrum', 'settings-interface'],
      template: 'modules/simulacrum/templates/settings-interface.html',
      title: 'Simulacrum AI Configuration',
      width: 600,
      height: 'auto',
      tabs: [{ navSelector: '.tabs', contentSelector: '.content', initial: 'general' }],
      closeOnSubmit: false,
      submitOnChange: false,
    });
  }

  /**
   * Get current settings data for the form
   * @returns {Object} Current settings values
   */
  getData() {
    const provider = game.settings.get('simulacrum', 'provider') || 'openai';
    this.currentProvider = provider;
    const baseURL = game.settings.get('simulacrum', 'baseURL');
    const baseURLPlaceholder = this._getPlaceholderForProvider(provider);
    return {
      apiKey: game.settings.get('simulacrum', 'apiKey'),
      baseURL,
      baseURLPlaceholder,
      model: game.settings.get('simulacrum', 'model'),
      maxTokens: game.settings.get('simulacrum', 'maxTokens') || 4096,
      temperature: game.settings.get('simulacrum', 'temperature') || 0.7,

      customSystemPrompt: game.settings.get('simulacrum', 'customSystemPrompt') || '',
      provider,
      providerIsOpenAI: provider === 'openai',
      providerIsGemini: provider === 'gemini',
      testing: this.testing,
    };
  }

  /**
   * Activate event listeners for the form
   * @param {jQuery} html - The form HTML
   */
  activateListeners(html) {
    super.activateListeners(html);

    const providerSelect = html.find('select[name="provider"]');
    if (providerSelect.length) {
      providerSelect.on('change', this._onProviderChange.bind(this));
    }

    const baseInput = html.find('input[name="baseURL"]');
    if (baseInput.length && !baseInput.attr('placeholder')) {
      baseInput.attr(
        'placeholder',
        this._getPlaceholderForProvider(this.currentProvider || 'openai')
      );
    }

    // API connection test button
    html.find('.test-connection').click(this._onTestConnection.bind(this));

    // Reset to defaults button
    html.find('.reset-defaults').click(this._onResetDefaults.bind(this));

    // Live validation
    html.find('input[name="apiKey"]').on('input', this._validateApiKey.bind(this));
    html.find('input[name="baseURL"]').on('input', this._validateBaseURL.bind(this));
  }

  /**
   * Resolve the default base URL placeholder for a provider
   * @param {string} provider - Provider identifier
   * @returns {string} Placeholder URL
   * @private
   */
  _getPlaceholderForProvider(provider) {
    return provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : 'https://api.openai.com/v1';
  }

  /**
   * Handle provider selection change
   * @param {Event} event - The change event
   * @private
   */
  _onProviderChange(event) {
    const select = event?.target || null;
    const provider = select?.value || this.currentProvider || 'openai';
    this.currentProvider = provider;

    const form = select?.form || this.form || null;
    const baseInput = form?.querySelector ? form.querySelector('input[name="baseURL"]') : null;
    if (baseInput) {
      baseInput.placeholder = this._getPlaceholderForProvider(provider);
    }

    if (typeof this._validateForm === 'function') {
      this._validateForm();
    }
  }

  /**
   * Test API connection with current settings
   * @param {Event} event - The click event
   * @private
   */
  async _onTestConnection(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const form = button.form;
    const formData = new FormData(form);

    // Get form values
    const config = {
      provider: formData.get('provider') || this.currentProvider || 'openai',
      apiKey: formData.get('apiKey'),
      baseURL: formData.get('baseURL'),
      model: formData.get('model'),
    };

    // Allow empty Base URL for Gemini (uses default), but require it for others
    if (!config.baseURL?.trim()) {
      if (config.provider === 'gemini') {
        config.baseURL = 'https://generativelanguage.googleapis.com/v1beta';
      } else {
        ui.notifications.error('Base URL is required');
        return;
      }
    }

    try {
      new URL(config.baseURL);
    } catch (_err) {
      ui.notifications.error('Base URL must be a valid URL');
      return;
    }

    this.testing = true;
    button.disabled = true;
    button.textContent = 'Testing...';

    try {
      const result = await this._testApiConnection(config);

      if (result.success) {
        ui.notifications.info(`✅ Connection successful! Model: ${result.model || 'Unknown'}`);
      } else {
        ui.notifications.error(`Connection failed: ${result.error}`);
      }
    } catch (error) {
      ui.notifications.error(`Connection test failed: ${error.message}`);
    } finally {
      this.testing = false;
      button.disabled = false;
      button.textContent = 'Test Connection';
    }
  }

  /**
   * Reset settings to default values
   * @param {Event} event - The click event
   * @private
   */
  async _onResetDefaults(event) {
    event.preventDefault();

    const confirmed = await Dialog.confirm({
      title: 'Reset to Defaults',
      content: '<p>Are you sure you want to reset all settings to their default values?</p>',
      yes: () => true,
      no: () => false,
    });

    if (confirmed) {
      // Reset form to default values
      const form = event.target.form;
      this.currentProvider = 'openai';
      const providerSelect = form.querySelector('select[name="provider"]');
      if (providerSelect) {
        providerSelect.value = 'openai';
      }
      const baseInput = form.querySelector('input[name="baseURL"]');
      if (baseInput) {
        const defaultPlaceholder = this._getPlaceholderForProvider('openai');
        baseInput.value = defaultPlaceholder;
        baseInput.placeholder = defaultPlaceholder;
      }
      form.querySelector('input[name="apiKey"]').value = '';
      form.querySelector('input[name="model"]').value = 'gpt-3.5-turbo';
      form.querySelector('input[name="maxTokens"]').value = '4096';
      form.querySelector('input[name="temperature"]').value = '0.7';

      form.querySelector('textarea[name="customSystemPrompt"]').value = '';

      ui.notifications.info('Settings reset to defaults');
      this._validateForm();
    }
  }

  /**
   * Validate API key format
   * @param {Event} event - The input event
   * @private
   */
  _validateApiKey(event) {
    const input = event.target;
    const value = input.value.trim();
    // Clear previous validation
    input.classList.remove('valid', 'invalid');

    if (value) {
      input.classList.add('valid');
    }
  }

  /**
   * Validate base URL format
   * @param {Event} event - The input event
   * @private
   */
  _validateBaseURL(event) {
    const input = event.target;
    const value = input.value.trim();

    // Clear previous validation
    input.classList.remove('valid', 'invalid');

    if (value) {
      try {
        new URL(value);
        input.classList.add('valid');
      } catch {
        input.classList.add('invalid');
      }
    }
  }

  /**
   * Validate entire form
   * @private
   */
  _validateForm() {
    // Trigger validation on all inputs
    const form = this.form;
    if (form) {
      form.querySelector('input[name="apiKey"]').dispatchEvent(new Event('input'));
      form.querySelector('input[name="baseURL"]').dispatchEvent(new Event('input'));
    }
  }

  _inferProviderFromURL(url) {
    if (!url) return 'openai';
    const lower = String(url).toLowerCase();
    if (lower.includes('generativelanguage.googleapis.com')) return 'gemini';
    return 'openai';
  }

  _resolveHealthEndpoint(baseURL, provider) {
    const base = String(baseURL || '').replace(/\/$/, '');
    if (provider === 'gemini') {
      return `${base}/models`;
    }
    return `${base}/models`;
  }

  /**
   * Handle form submission
   * @param {Event} event - The submit event
   * @param {Object} formData - Form data object
   * @returns {Promise<void>}
   */
  async _updateObject(event, formData) {
    try {
      this._validateFormData(formData);
      await this._saveSettings(formData);

      ui.notifications.info('Simulacrum settings saved successfully');

      // Reinitialize AI client with new settings if module is active
      if (typeof SimulacrumCore !== 'undefined') {
        await SimulacrumCore.initializeAIClient();
      }
    } catch (error) {
      this.logger.error('Failed to save Simulacrum settings:', error);
      ui.notifications.error(`Failed to save settings: ${error.message}`);
      throw error;
    }
  }

  _validateFormData(formData) {
    if (formData.baseURL) {
      try {
        new URL(formData.baseURL);
      } catch (_err) {
        throw new Error('Base URL must be a valid URL');
      }
    }
  }

  async _saveSettings(formData) {
    const provider = formData.provider || this.currentProvider || 'openai';
    await game.settings.set('simulacrum', 'provider', provider);
    await game.settings.set('simulacrum', 'apiKey', formData.apiKey);
    await game.settings.set('simulacrum', 'baseURL', formData.baseURL);
    await game.settings.set('simulacrum', 'model', formData.model);

    if (formData.maxTokens)
      await game.settings.set('simulacrum', 'maxTokens', parseInt(formData.maxTokens));
    if (formData.temperature)
      await game.settings.set('simulacrum', 'temperature', parseFloat(formData.temperature));

    if (formData.customSystemPrompt !== undefined) {
      await game.settings.set('simulacrum', 'customSystemPrompt', formData.customSystemPrompt);
    }
  }

  /**
   * Open settings interface
   * @returns {SettingsInterface} The settings interface instance
   */
  static open() {
    const settings = new SettingsInterface();
    settings.render(true);
    return settings;
  }
}

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

  // Use the data-setting-id attribute to find the setting div
  const settingDiv = $html.find(`[data-setting-id="${fullSettingId}"]`);
  if (!settingDiv.length) return;

  // Get the original stored value from settings
  let storedValue = game.settings.get(moduleId, settingKey) || '';
  storedValue = storedValue.replace(/\\n/g, '\n');

  // Find the original input
  const inputEl = settingDiv.find(`input[name="${fullSettingId}"]`);
  if (!inputEl.length) return;

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
        createLogger('SettingsInterface').error('Error in settings render:', error);
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

  $html.find('a.item[data-tab="simulacrum"]').on('click', () => {
    setTimeout(() => {
      if ($html.find('div[data-setting-id="simulacrum.customSystemPrompt"] input').length) {
        convertSettingToTextarea({
          html: $html,
          moduleId: 'simulacrum',
          settingKey: 'customSystemPrompt',
          textareaStyle: style,
          repositionCallback: callback,
        });
      }
    }, 500);
  });
}
