/**
 * Settings Configuration Interface - Enhanced settings management with validation
 * Provides API connection testing and advanced configuration options
 */

import { createLogger } from '../utils/logger.js';

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
      tabs: [
        { navSelector: '.tabs', contentSelector: '.content', initial: 'general' }
      ],
      closeOnSubmit: false,
      submitOnChange: false
    });
  }

  /**
   * Get current settings data for the form
   * @returns {Object} Current settings values
   */
  getData() {
    return {
      apiKey: game.settings.get('simulacrum', 'apiKey'),
      baseURL: game.settings.get('simulacrum', 'baseURL'),
      model: game.settings.get('simulacrum', 'model'),
      maxTokens: game.settings.get('simulacrum', 'maxTokens') || 4096,
      temperature: game.settings.get('simulacrum', 'temperature') || 0.7,
      contextLength: game.settings.get('simulacrum', 'contextLength') || 20,
      customSystemPrompt: game.settings.get('simulacrum', 'customSystemPrompt') || '',
      testing: this.testing
    };
  }

  /**
   * Activate event listeners for the form
   * @param {jQuery} html - The form HTML
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Provider selection presets baseURL; manual override still allowed
    const providerSelect = html.find('select[name="apiProvider"]');
    providerSelect.on('change', this._onProviderChange.bind(this));
    const inferred = this._inferProvider(game.settings.get('simulacrum', 'baseURL'));
    if (providerSelect.length) { providerSelect.val(inferred); }
    
    // API connection test button
    html.find('.test-connection').click(this._onTestConnection.bind(this));
    
    // Reset to defaults button
    html.find('.reset-defaults').click(this._onResetDefaults.bind(this));
    
    // Live validation
    html.find('input[name="apiKey"]').on('input', this._validateApiKey.bind(this));
    html.find('input[name="baseURL"]').on('input', this._validateBaseURL.bind(this));
  }

  /**
   * Handle provider selection change
   * @param {Event} event - The change event
   * @private
   */
  // No provider change handler
  _onProviderChange(event) {
    const select = event.currentTarget;
    const value = select.value;
    const form = select.form;
    const baseInput = form?.querySelector('input[name="baseURL"]');
    if (!baseInput) return;
    if (value === 'openai') baseInput.value = 'https://api.openai.com/v1';
    else if (value === 'ollama') baseInput.value = 'http://localhost:11434/v1';
    // custom: leave as-is
    // Re-validate after preset
    this._validateBaseURL({ target: baseInput });
  }

  _inferProvider(baseURL) {
    const url = String(baseURL || '').toLowerCase();
    if (url.includes('openai.com')) return 'openai';
    if (url.includes('ollama') || url.includes('localhost') || url.includes('127.0.0.1')) return 'ollama';
    return 'custom';
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
      apiKey: formData.get('apiKey'),
      baseURL: formData.get('baseURL'),
      model: formData.get('model')
    };

    // Enforce versioned baseURL universally before testing
    if (typeof config.baseURL !== 'string' || !config.baseURL.endsWith('/v1')) {
      ui.notifications.error('Base URL must end with /v1');
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
        ui.notifications.error(`❌ Connection failed: ${result.error}`);
      }
    } catch (error) {
      ui.notifications.error(`❌ Connection test failed: ${error.message}`);
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
      no: () => false
    });

    if (confirmed) {
      // Reset form to default values
      const form = event.target.form;
      form.querySelector('input[name="apiKey"]').value = '';
      form.querySelector('input[name="baseURL"]').value = 'https://api.openai.com/v1';
      form.querySelector('input[name="model"]').value = 'gpt-3.5-turbo';
      form.querySelector('input[name="maxTokens"]').value = '4096';
      form.querySelector('input[name="temperature"]').value = '0.7';
      form.querySelector('input[name="contextLength"]').value = '20';
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
      // OpenAI keys typically start with 'sk-'
      if (value.startsWith('sk-') && value.length > 20) {
        input.classList.add('valid');
      } else {
        input.classList.add('invalid');
      }
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
        if (!value.endsWith('/v1')) {
          input.classList.add('invalid');
        } else {
          input.classList.add('valid');
        }
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

  /**
   * Test API connection with provided configuration
   * @param {Object} config - API configuration
   * @returns {Promise<Object>} Test result
   * @private
   */
  async _testApiConnection(config) {
    try {
      // Create temporary AI client for testing
      const { AIClient } = await import('../core/ai-client.js');
      const testClient = new AIClient({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model
      });
      
      // Send a simple test message
      const testMessage = 'Hello, this is a connection test.';
      const response = await testClient.sendMessage(testMessage);
      
      return {
        success: true,
        model: response.model,
        content: response.content
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle form submission
   * @param {Event} event - The submit event
   * @param {Object} formData - Form data object
   * @returns {Promise<void>}
   */
  async _updateObject(event, formData) {
    try {
      // Enforce versioned baseURL universally
      if (typeof formData.baseURL !== 'string' || !formData.baseURL.endsWith('/v1')) {
        throw new Error('Base URL must end with /v1');
      }

      // Update all settings (no redundant module enable toggle)
      // Provider-agnostic: ignore any provider field
      await game.settings.set('simulacrum', 'apiKey', formData.apiKey);
      await game.settings.set('simulacrum', 'baseURL', formData.baseURL);
      await game.settings.set('simulacrum', 'model', formData.model);
      
      // Set advanced settings if provided
      if (formData.maxTokens) {
        await game.settings.set('simulacrum', 'maxTokens', parseInt(formData.maxTokens));
      }
      if (formData.temperature) {
        await game.settings.set('simulacrum', 'temperature', parseFloat(formData.temperature));
      }
      if (formData.contextLength) {
        await game.settings.set('simulacrum', 'contextLength', parseInt(formData.contextLength));
      }
      if (formData.customSystemPrompt !== undefined) {
        await game.settings.set('simulacrum', 'customSystemPrompt', formData.customSystemPrompt);
      }
      
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
 * Register additional settings not in basic config
 * Called during module initialization
 */
export function registerAdvancedSettings() {
  game.settings.register('simulacrum', 'maxTokens', {
    name: 'Maximum Tokens',
    hint: 'Maximum number of tokens for AI responses.',
    scope: 'world',
    config: false, // Hidden from basic config, shown in advanced interface
    type: Number,
    default: 4096,
    restricted: true
  });

  game.settings.register('simulacrum', 'temperature', {
    name: 'Response Temperature',
    hint: 'Controls randomness in AI responses (0.0-1.0).',
    scope: 'world',
    config: false, // Hidden from basic config, shown in advanced interface
    type: Number,
    default: 0.7,
    restricted: true
  });

  game.settings.register('simulacrum', 'legacyMode', {
    name: 'Legacy Mode',
    hint: 'Enable if your AI provider doesn\'t support OpenAI-style tool calling. Uses JSON block parsing instead.',
    scope: 'world',
    config: true, // Show in basic config since this is important for compatibility
    type: Boolean,
    default: false,
    restricted: true
  });

  game.settings.register('simulacrum', 'contextLength', {
    name: 'Context Length',
    hint: 'Maximum number of messages to include in conversation context.',
    scope: 'world',
    config: false, // Hidden from basic config, shown in advanced interface
    type: Number,
    default: 20,
    restricted: true
  });

  game.settings.register('simulacrum', 'customSystemPrompt', {
    name: 'Custom System Prompt',
    hint: 'Additional instructions to append to the system prompt.',
    scope: 'world',
    config: false, // Hidden from basic config, shown in advanced interface
    type: String,
    default: '',
    restricted: true
  });
}
