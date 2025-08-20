/**
 * Dynamic Model Selection UI
 * Provides intelligent model selection based on API capabilities
 */

import { ModelDetector } from '../core/model-detector.js';

/**
 * DynamicModelSelector - Manages dynamic model selection UI
 */
export class DynamicModelSelector {
  constructor() {
    this.modelDetector = new ModelDetector();
    this.detectedModels = [];
    this.isDetectable = false;
    this.currentApiType = null;
    this.settingElement = null;
    this.modelInput = null;
    this.customInput = null;
    this.debounceTimer = null;
  }

  /**
   * Initialize the dynamic model selector
   */
  initialize() {
    // Hook into settings render to enhance UI
    Hooks.on('renderSettingsConfig', (app, html) => {
      this.enhanceSettingsUI(html);
    });

    // Listen for API key changes
    this.watchApiKeySetting();
  }

  /**
   * Watch for changes to API key setting
   */
  watchApiKeySetting() {
    Hooks.on('updateSetting', (setting, value) => {
      if (setting.key === 'simulacrum.apiKey') {
        this.onApiKeyChange(value);
      }
    });
  }

  /**
   * Enhance settings UI with dynamic model selection
   * @param {jQuery} html - Settings UI HTML
   */
  enhanceSettingsUI(html) {
    // Look specifically for model select
    const modelSelect = html.find('select[name="simulacrum.modelName"]');

    if (modelSelect.length > 0) {
      this.settingElement = modelSelect.closest('.form-group');
      this.modelInput = modelSelect;
    } else {
      return;
    }

    // Add direct DOM event listener since FoundryVTT onChange handlers don't work with UI changes
    html.on('change', 'select[name="simulacrum.modelName"]', async (e) => {
      const selectedValue = e.target.value;

      // Get the model's context window
      const availableModels = game.settings.get(
        'simulacrum',
        'availableModels'
      );
      const selectedModel = availableModels.find(
        (model) => model.id === selectedValue
      );

      if (selectedModel) {
        // Update the context length field in the UI immediately
        const contextInput = html.find(
          'input[name="simulacrum.contextLength"]'
        );
        if (contextInput.length > 0) {
          contextInput.val(selectedModel.contextWindow);
        }

        // Also update the setting for persistence
        await game.settings.set(
          'simulacrum',
          'contextLength',
          selectedModel.contextWindow
        );
      }
    });

    // Initially hide the setting
    this.hideModelSetting();

    // Check current API endpoint and update UI
    const currentEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
    if (currentEndpoint) {
      this.updateModelSelection(currentEndpoint);
    }
  }

  /**
   * Update model selection based on API endpoint
   * @param {string} apiEndpoint - API endpoint URL
   * @param {string} apiKey - Optional API key
   */
  async updateModelSelection(apiEndpoint, apiKey = null) {
    // Skip if UI elements not ready
    if (!this.modelInput) {
      return;
    }

    // Use current API key if not provided
    if (!apiKey) {
      try {
        apiKey = game.settings.get('simulacrum', 'apiKey');
      } catch {
        // Settings not available yet
      }
    }

    if (!apiEndpoint || apiEndpoint.trim() === '') {
      this.hideModelSetting();
      return;
    }

    this.showLoadingState();

    try {
      const detection = await this.modelDetector.detectModels(
        apiEndpoint,
        apiKey
      );
      this.detectedModels = detection.models;
      this.isDetectable = detection.detectable;
      this.currentApiType = detection.type;

      await this.updateModelUI(detection);
    } catch (error) {
      console.error('🤖 Model selection update failed:', error);
      this.showErrorState(error.message);
    }
  }

  /**
   * Update model UI based on detection results
   * @param {Object} detection - Detection result object
   */
  async updateModelUI(detection) {
    this.showModelSetting();

    if (detection.detectable && detection.models.length > 0) {
      this.showDropdownSelector(detection.models);
    } else {
      this.showTextInput(detection.type);
    }

    this.hideLoadingState();
  }

  /**
   * Show dropdown selector with detected models
   * @param {Array} models - Array of detected models
   */
  showDropdownSelector(models) {
    // Create select element
    const select = document.createElement('select');
    select.name = 'simulacrum.modelName';
    select.className = this.modelInput.attr('class') || '';

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select a Model --';
    select.appendChild(defaultOption);

    // Add detected models
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;

      // Add size info for Ollama models
      if (model.size && this.currentApiType === 'ollama') {
        const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(1);
        option.textContent += ` (${sizeGB}GB)`;
      }

      select.appendChild(option);
    });

    // Add custom option
    const customOption = document.createElement('option');
    customOption.value = '__custom__';
    customOption.textContent = '-- Custom Model --';
    select.appendChild(customOption);

    // Set current value if it exists in the models
    const currentValue = game.settings.get('simulacrum', 'modelName');
    if (currentValue && models.some((m) => m.id === currentValue)) {
      select.value = currentValue;
    }

    // Use event delegation through the form container to survive FoundryVTT DOM changes
    select.setAttribute('data-simulacrum-model-select', 'true');

    // Replace the input with select
    this.replaceModelInput(select);

    // Add model info display
    this.addModelInfoDisplay(models.length);
  }

  /**
   * Show text input for manual model entry
   * @param {string} apiType - Detected API type for placeholder guidance
   */
  showTextInput(apiType) {
    // Create text input
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'simulacrum.modelName';
    input.className = this.modelInput.attr('class') || '';

    // Set appropriate placeholder based on API type
    if (apiType === 'openai') {
      input.placeholder = 'Enter model name (e.g., gpt-4, gpt-3.5-turbo)';
    } else if (apiType === 'ollama') {
      input.placeholder = 'Enter model name (e.g., llama2, mistral)';
    } else {
      input.placeholder = 'Enter model name';
    }

    // Set current value
    const currentValue = game.settings.get('simulacrum', 'modelName');
    if (currentValue) {
      input.value = currentValue;
    }

    // Handle input changes
    input.addEventListener('input', (e) => {
      this.onModelInputChange(e.target.value);
    });

    // Replace the input
    this.replaceModelInput(input);

    // Remove custom input if it exists
    this.hideCustomInput();

    // Add manual entry notice
    this.addManualEntryNotice(apiType);
  }

  /**
   * Handle model selection changes from dropdown
   * @param {string} value - Selected model value
   */
  async onModelSelectionChange(value) {
    if (value === '__custom__') {
      this.showCustomInput();
    } else {
      this.hideCustomInput();

      if (value) {
        // Update the setting
        await game.settings.set('simulacrum', 'modelName', value);

        // Immediately trigger context window update with force refresh
        await this.triggerContextWindowUpdateImmediate(value);
      }
    }
  }

  /**
   * Handle model input changes from text field
   * @param {string} value - Input model value
   */
  onModelInputChange(value) {
    // Clear previous timer
    clearTimeout(this.debounceTimer);

    // Debounce the context window update
    this.debounceTimer = setTimeout(() => {
      this.triggerContextWindowUpdate(value);
    }, 1000);
  }

  /**
   * Show custom model input below dropdown
   */
  showCustomInput() {
    if (this.customInput) {
      return;
    } // Already exists

    const customContainer = document.createElement('div');
    customContainer.className = 'simulacrum-custom-model';
    customContainer.style.marginTop = '8px';

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.name = 'simulacrum.customModelName';
    customInput.placeholder = 'Enter custom model name';
    customInput.style.width = '100%';

    const customLabel = document.createElement('label');
    customLabel.textContent = 'Custom Model Name:';
    customLabel.style.display = 'block';
    customLabel.style.marginBottom = '3px';
    customLabel.style.fontSize = '0.9em';
    customLabel.style.fontWeight = 'bold';

    customContainer.appendChild(customLabel);
    customContainer.appendChild(customInput);

    // Handle custom input changes
    customInput.addEventListener('input', (e) => {
      this.onCustomModelChange(e.target.value);
    });

    this.settingElement.append(customContainer);
    this.customInput = customInput;

    // Focus the custom input
    customInput.focus();
  }

  /**
   * Hide custom model input
   */
  hideCustomInput() {
    const customContainer = this.settingElement.find(
      '.simulacrum-custom-model'
    );
    if (customContainer.length > 0) {
      customContainer.remove();
    }
    this.customInput = null;
  }

  /**
   * Handle custom model input changes
   * @param {string} value - Custom model name
   */
  async onCustomModelChange(value) {
    if (value.trim()) {
      // Update the setting with custom value
      await game.settings.set('simulacrum', 'modelName', value.trim());

      // Trigger context window update
      this.triggerContextWindowUpdate(value.trim());
    }
  }

  /**
   * Handle API key changes
   * @param {string} apiKey - New API key value
   */
  async onApiKeyChange(apiKey) {
    // Re-test model detection if we have an endpoint
    const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
    if (apiEndpoint && this.currentApiType === 'openai') {
      await this.updateModelSelection(apiEndpoint, apiKey);
    }
  }

  /**
   * Trigger context window update for model change
   * @param {string} modelName - Model name that changed
   */
  triggerContextWindowUpdate(modelName) {
    // Check if dynamic context window setting exists and supports detection
    if (game.simulacrum?.dynamicContextWindowSetting) {
      game.simulacrum.dynamicContextWindowSetting.onModelChange(modelName);
    }
  }

  /**
   * Trigger immediate context window update with UI refresh
   * @param {string} modelName - Model name that changed
   */
  async triggerContextWindowUpdateImmediate(modelName) {
    const contextWindowSetting = game.simulacrum?.dynamicContextWindowSetting;
    if (!contextWindowSetting) {
      return;
    }

    // Check if we can auto-detect context window
    if (!contextWindowSetting.currentDetection?.supportsDetection) {
      return;
    }

    try {
      // Get the current API endpoint
      const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
      if (!apiEndpoint) {
        return;
      }

      // Show loading on context window field
      contextWindowSetting.showLoadingState();

      // Detect context window for the new model
      const contextWindow =
        await contextWindowSetting.detector.getContextWindow(
          apiEndpoint,
          modelName
        );

      // Update the UI field immediately
      contextWindowSetting.updateDetectedValue(contextWindow);

      // Update the setting if not overridden
      const isOverridden =
        contextWindowSetting.overrideCheckbox &&
        contextWindowSetting.overrideCheckbox.is(':checked');

      if (!isOverridden) {
        await game.settings.set('simulacrum', 'contextWindow', contextWindow);
      }

      contextWindowSetting.hideLoadingState();

      // Update the auto-detected indicator
      contextWindowSetting.removeAutoDetectedIndicator();
      contextWindowSetting.addAutoDetectedIndicator(contextWindow);
    } catch (error) {
      console.error('🔥 Immediate context window update failed:', error);
      contextWindowSetting.hideLoadingState();
    }
  }

  /**
   * Replace the model input element
   * @param {HTMLElement} newElement - New input/select element
   */
  replaceModelInput(newElement) {
    if (this.modelInput) {
      // Copy existing attributes
      const oldInput = this.modelInput[0];

      Array.from(oldInput.attributes).forEach((attr) => {
        if (attr.name !== 'type' && attr.name !== 'name') {
          newElement.setAttribute(attr.name, attr.value);
        }
      });

      // Replace the element
      this.modelInput.replaceWith(newElement);
      this.modelInput = $(newElement);
    }
  }

  /**
   * Add model info display
   * @param {number} modelCount - Number of detected models
   */
  addModelInfoDisplay(modelCount) {
    // Remove existing info
    this.removeModelInfo();

    const infoHtml = `
            <div class="simulacrum-model-info" style="margin-top: 5px; font-size: 0.85em; color: #28a745;">
                <i class="fas fa-robot" style="margin-right: 4px;"></i>
                Detected ${modelCount} available models
            </div>
        `;

    this.settingElement.append(infoHtml);
  }

  /**
   * Add manual entry notice
   * @param {string} apiType - API type for context
   */
  addManualEntryNotice(apiType) {
    // Remove existing info
    this.removeModelInfo();

    let reason = 'Model list not available';
    if (apiType === 'error') {
      reason = 'Model detection failed';
    } else if (apiType === 'unknown') {
      reason = 'API type not recognized';
    }

    const noticeHtml = `
            <div class="simulacrum-model-info" style="margin-top: 5px; font-size: 0.85em; color: #ffc107;">
                <i class="fas fa-edit" style="margin-right: 4px;"></i>
                Manual entry required: ${reason}
            </div>
        `;

    this.settingElement.append(noticeHtml);
  }

  /**
   * Remove model info displays
   */
  removeModelInfo() {
    this.settingElement.find('.simulacrum-model-info').remove();
  }

  /**
   * Show model setting
   */
  showModelSetting() {
    if (this.settingElement) {
      this.settingElement.show();
    }
  }

  /**
   * Hide model setting
   */
  hideModelSetting() {
    if (this.settingElement) {
      this.settingElement.hide();
    }
  }

  /**
   * Show loading state
   */
  showLoadingState() {
    if (this.modelInput) {
      this.modelInput.prop('disabled', true);
      if (this.modelInput.is('input')) {
        this.modelInput.val('Loading models...');
      }
    }
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    if (this.modelInput) {
      this.modelInput.prop('disabled', false);
    }
  }

  /**
   * Show error state
   * @param {string} errorMessage - Error message to display
   */
  showErrorState(errorMessage) {
    console.error('🤖 Model selection error:', errorMessage);

    this.hideLoadingState();

    // Show fallback text input
    this.showTextInput('error');

    // Add error indicator
    const errorHtml = `
            <div class="simulacrum-model-error" style="margin-top: 3px; font-size: 0.85em; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="margin-right: 4px;"></i>
                Model detection failed: ${errorMessage}
            </div>
        `;

    // Remove existing error indicators
    this.settingElement.find('.simulacrum-model-error').remove();
    this.settingElement.append(errorHtml);
  }
}
