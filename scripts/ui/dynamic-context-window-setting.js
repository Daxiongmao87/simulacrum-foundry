/**
 * Dynamic Context Window Setting UI
 * Provides intelligent context window configuration based on API capabilities
 */

import { ContextWindowDetector } from '../core/context-window-detector.js';

/**
 * DynamicContextWindowSetting - Manages dynamic context window setting UI
 */
export class DynamicContextWindowSetting {
    constructor() {
        this.detector = new ContextWindowDetector();
        this.debounceTimer = null;
        this.currentDetection = null;
        this.settingElement = null;
        this.overrideCheckbox = null;
        this.contextInput = null;
    }

    /**
     * Initialize the dynamic setting system
     */
    initialize() {
        console.log('🎨 Initializing Dynamic Context Window Setting');
        
        // Hook into settings render to add our dynamic behavior
        Hooks.on('renderSettingsConfig', (app, html) => {
            this.enhanceSettingsUI(html);
        });

        // Listen for API endpoint changes
        this.watchApiEndpointSetting();
        
        // Initial setup based on current settings
        this.updateUIFromCurrentSettings();
    }

    /**
     * Watch for changes to API endpoint setting
     */
    watchApiEndpointSetting() {
        // Create observer for settings changes
        Hooks.on('updateSetting', (setting, value) => {
            if (setting.key === 'simulacrum.apiEndpoint') {
                console.log(`🔗 API endpoint changed: ${value}`);
                this.onApiEndpointChange(value);
            }
            if (setting.key === 'simulacrum.modelName') {
                console.log(`🤖 Model changed: ${value}`);
                this.onModelChange(value);
            }
        });
    }

    /**
     * Enhance settings UI with dynamic behavior
     * @param {jQuery} html - Settings UI HTML
     */
    enhanceSettingsUI(html) {
        console.log('🎨 Enhancing settings UI with dynamic context window');
        
        // Find context window setting
        const contextSetting = html.find('input[name="simulacrum.contextWindow"]');
        if (contextSetting.length === 0) {
            console.warn('⚠️ Context window setting not found in UI');
            return;
        }

        this.settingElement = contextSetting.closest('.form-group');
        this.contextInput = contextSetting;

        // Initially hide the setting
        this.hideContextWindowSetting();

        // Check current API endpoint and update UI
        const currentEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
        if (currentEndpoint) {
            this.onApiEndpointChange(currentEndpoint);
        }

        // Add override functionality if needed
        this.addOverrideCheckbox();
    }

    /**
     * Handle API endpoint changes with debouncing
     * @param {string} value - New API endpoint value
     */
    onApiEndpointChange(value) {
        // Skip if UI elements not ready
        if (!this.contextInput) {
            console.log('🔄 UI not ready, skipping API endpoint change');
            return;
        }

        // Clear previous timer
        clearTimeout(this.debounceTimer);

        // Hide settings if no endpoint
        if (!value || value.trim() === '') {
            this.hideContextWindowSetting();
            return;
        }

        // Show loading state
        this.showLoadingState();

        // Debounce API testing (1.5 second delay)
        this.debounceTimer = setTimeout(async () => {
            console.log(`🔍 Testing API endpoint after debounce: ${value}`);
            
            try {
                const detection = await this.detector.detectEndpointType(value);
                this.currentDetection = detection;
                await this.updateContextWindowUI(detection);
                
                // Also trigger model detection
                const apiKey = game.settings.get('simulacrum', 'apiKey');
                if (game.simulacrum?.dynamicModelSelector) {
                    await game.simulacrum.dynamicModelSelector.updateModelSelection(value, apiKey);
                }
            } catch (error) {
                console.error('🔥 Context window detection failed:', error);
                this.showErrorState(error.message);
            }
        }, 1500);
    }

    /**
     * Handle model changes (for Ollama endpoints)
     * @param {string} modelName - Selected model name
     */
    async onModelChange(modelName) {
        console.log(`🤖 Context window onModelChange called with: ${modelName}`);
        console.log(`🤖 Current detection:`, this.currentDetection);
        
        if (!this.currentDetection || !this.currentDetection.supportsDetection || !modelName) {
            console.log(`🤖 Skipping context window update - detection: ${!!this.currentDetection}, supports: ${this.currentDetection?.supportsDetection}, model: ${!!modelName}`);
            return;
        }

        console.log(`🔄 Updating context window for model: ${modelName}`);
        
        try {
            this.showLoadingState();
            
            const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
            const contextWindow = await this.detector.getContextWindow(apiEndpoint, modelName);
            
            console.log(`🎯 Detected context window: ${contextWindow} for model ${modelName}`);
            
            // Update the displayed value
            this.updateDetectedValue(contextWindow);
            
            // Update the actual setting if not overridden
            const isOverridden = this.overrideCheckbox && this.overrideCheckbox.is(':checked');
            if (!isOverridden) {
                await game.settings.set('simulacrum', 'contextWindow', contextWindow);
                console.log(`💾 Updated context window setting to: ${contextWindow}`);
            } else {
                console.log(`🔒 Context window override enabled, not updating setting`);
            }
            
            this.hideLoadingState();
        } catch (error) {
            console.error('🔥 Model context window update failed:', error);
            this.showErrorState(error.message);
        }
    }

    /**
     * Update context window UI based on detection results
     * @param {Object} detection - Detection result object
     */
    async updateContextWindowUI(detection) {
        console.log(`🎨 Updating UI for detection:`, detection);
        
        if (!detection.visible) {
            this.hideContextWindowSetting();
            return;
        }

        this.showContextWindowSetting();

        if (detection.supportsDetection) {
            await this.showAutoDetectedField(detection);
        } else {
            this.showEditableField(detection.defaultValue || 8192);
        }

        this.hideLoadingState();
    }

    /**
     * Show auto-detected field with override option
     * @param {Object} detection - Detection result
     */
    async showAutoDetectedField(detection) {
        console.log('🎯 Setting up auto-detected field');
        
        // Get current model to detect context window
        const modelName = game.settings.get('simulacrum', 'modelName');
        const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
        
        let detectedValue = 8192; // Default fallback
        
        if (modelName && apiEndpoint) {
            try {
                detectedValue = await this.detector.getContextWindow(apiEndpoint, modelName);
            } catch (error) {
                console.warn('⚠️ Failed to get context window for current model:', error);
            }
        }

        // Make input read-only
        this.contextInput.prop('readonly', true);
        this.contextInput.addClass('auto-detected');
        this.contextInput.val(detectedValue);

        // Show override checkbox
        this.showOverrideCheckbox();
        
        // Add visual indicator
        this.addAutoDetectedIndicator(detectedValue);

        // Update actual setting
        const isOverridden = this.overrideCheckbox && this.overrideCheckbox.is(':checked');
        if (!isOverridden) {
            await game.settings.set('simulacrum', 'contextWindow', detectedValue);
        }
    }

    /**
     * Show editable field for manual configuration
     * @param {number} defaultValue - Default context window value
     */
    showEditableField(defaultValue) {
        console.log(`✏️ Setting up editable field with default: ${defaultValue}`);
        
        // Make input editable
        this.contextInput.prop('readonly', false);
        this.contextInput.removeClass('auto-detected');
        
        // Set default value if current value is empty
        const currentValue = this.contextInput.val();
        if (!currentValue || currentValue === '0') {
            this.contextInput.val(defaultValue);
        }

        // Hide override checkbox
        this.hideOverrideCheckbox();
        
        // Remove auto-detected indicator
        this.removeAutoDetectedIndicator();
    }

    /**
     * Add override checkbox functionality
     */
    addOverrideCheckbox() {
        if (this.overrideCheckbox) return; // Already exists

        const checkboxHtml = `
            <div class="simulacrum-override-container" style="margin-top: 5px; display: none;">
                <label>
                    <input type="checkbox" class="simulacrum-context-override" />
                    <span>Manual Override</span>
                </label>
                <p class="notes" style="margin-top: 2px; font-size: 0.9em; color: #666;">
                    Check to manually set context window instead of using auto-detected value
                </p>
            </div>
        `;

        this.settingElement.append(checkboxHtml);
        this.overrideCheckbox = this.settingElement.find('.simulacrum-context-override');

        // Handle override checkbox changes
        this.overrideCheckbox.on('change', (event) => {
            const isChecked = event.target.checked;
            console.log(`🔄 Override checkbox changed: ${isChecked}`);
            
            if (isChecked) {
                // Enable manual editing
                this.contextInput.prop('readonly', false);
                this.contextInput.removeClass('auto-detected');
                this.removeAutoDetectedIndicator();
            } else {
                // Return to auto-detected mode
                this.contextInput.prop('readonly', true);
                this.contextInput.addClass('auto-detected');
                
                // Trigger model change to refresh detected value
                const modelName = game.settings.get('simulacrum', 'modelName');
                if (modelName) {
                    this.onModelChange(modelName);
                }
            }
        });
    }

    /**
     * Show override checkbox
     */
    showOverrideCheckbox() {
        const container = this.settingElement.find('.simulacrum-override-container');
        container.show();
    }

    /**
     * Hide override checkbox
     */
    hideOverrideCheckbox() {
        const container = this.settingElement.find('.simulacrum-override-container');
        container.hide();
    }

    /**
     * Add visual indicator for auto-detected values
     * @param {number} value - Detected context window value
     */
    addAutoDetectedIndicator(value) {
        // Remove existing indicator
        this.removeAutoDetectedIndicator();

        const indicator = `
            <div class="simulacrum-auto-indicator" style="margin-top: 3px; font-size: 0.85em; color: #28a745;">
                <i class="fas fa-magic" style="margin-right: 4px;"></i>
                Auto-detected: ${value} tokens
            </div>
        `;
        
        this.settingElement.append(indicator);
    }

    /**
     * Remove auto-detected indicator
     */
    removeAutoDetectedIndicator() {
        this.settingElement.find('.simulacrum-auto-indicator').remove();
    }

    /**
     * Update detected value display
     * @param {number} value - New detected value
     */
    updateDetectedValue(value) {
        if (this.contextInput.prop('readonly')) {
            this.contextInput.val(value);
            
            // Update indicator
            const indicator = this.settingElement.find('.simulacrum-auto-indicator');
            if (indicator.length > 0) {
                indicator.html(`
                    <i class="fas fa-magic" style="margin-right: 4px;"></i>
                    Auto-detected: ${value} tokens
                `);
            }
        }
    }

    /**
     * Show context window setting
     */
    showContextWindowSetting() {
        if (this.settingElement) {
            this.settingElement.show();
        }
    }

    /**
     * Hide context window setting
     */
    hideContextWindowSetting() {
        if (this.settingElement) {
            this.settingElement.hide();
        }
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        if (this.contextInput) {
            this.contextInput.prop('disabled', true);
            this.contextInput.val('Detecting...');
        }
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        if (this.contextInput) {
            this.contextInput.prop('disabled', false);
        }
    }

    /**
     * Show error state
     * @param {string} errorMessage - Error message to display
     */
    showErrorState(errorMessage) {
        console.error('🔥 Context window setting error:', errorMessage);
        
        this.hideLoadingState();
        
        // Show fallback editable field
        this.showEditableField(8192);
        
        // Add error indicator
        const errorHtml = `
            <div class="simulacrum-error-indicator" style="margin-top: 3px; font-size: 0.85em; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="margin-right: 4px;"></i>
                Detection failed: ${errorMessage}
            </div>
        `;
        
        // Remove existing error indicators
        this.settingElement.find('.simulacrum-error-indicator').remove();
        this.settingElement.append(errorHtml);
    }

    /**
     * Update UI based on current settings (for initialization)
     */
    async updateUIFromCurrentSettings() {
        // Only proceed if UI elements are available
        if (!this.contextInput) {
            console.log('🔄 UI elements not ready yet, skipping initial update');
            return;
        }

        const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
        if (apiEndpoint) {
            console.log('🔄 Updating UI from current settings');
            await this.onApiEndpointChange(apiEndpoint);
        }
    }
}