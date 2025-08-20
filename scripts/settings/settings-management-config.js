import { SimulacrumSettings } from '../settings.js';

/**
 * A FormApplication for managing Simulacrum settings (test connection, import/export).
 */
export class SettingsManagementConfig extends FormApplication {
  constructor(object = {}, options = {}) {
    super(object, options);
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize('SIMULACRUM.SettingsManagementConfigTitle'),
      id: 'simulacrum-settings-management-config',
      template: 'modules/simulacrum/templates/settings-management-config.html',
      width: 600,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: false,
      resizable: true,
      classes: ['simulacrum', 'settings', 'management'],
    });
  }

  /**
   * Get the data for the form application.
   * @returns {object}
   */
  getData() {
    return {
      apiEndpoint: SimulacrumSettings.getApiEndpoint(),
    };
  }

  /**
   * Activate event listeners for the form application.
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    html
      .find('.test-connection-button')
      .on('click', this._onTestConnection.bind(this));
    html
      .find('.export-settings-button')
      .on('click', this._onExportSettings.bind(this));
    html
      .find('.import-settings-button')
      .on('click', this._onImportSettings.bind(this));
  }

  /**
   * Handle API connection test.
   * @param {Event} event
   * @private
   */
  async _onTestConnection(event) {
    event.preventDefault();
    const button = $(event.currentTarget);
    const originalIcon = button.find('i').attr('class');
    const originalText = button.text();

    button
      .prop('disabled', true)
      .html('<i class="fas fa-spinner fa-spin"></i> Testing...');
    ui.notifications.info(game.i18n.localize('SIMULACRUM.TestingConnection'));

    try {
      const apiEndpoint = SimulacrumSettings.getApiEndpoint();
      // This is a placeholder. Actual API test would involve a fetch request.
      // For now, we'll simulate a successful connection.
      const response = await fetch(`${apiEndpoint}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Add API key if necessary, but avoid hardcoding here
        },
      });

      if (response.ok) {
        ui.notifications.info(
          game.i18n.localize('SIMULACRUM.ConnectionSuccess')
        );
        button.html('<i class="fas fa-check"></i> Success').addClass('success');
      } else {
        const errorData = await response.json();
        ui.notifications.error(
          game.i18n.format('SIMULACRUM.ConnectionFailed', {
            status: response.status,
            message: errorData.error.message || response.statusText,
          })
        );
        button.html('<i class="fas fa-times"></i> Failed').addClass('failure');
      }
    } catch (error) {
      console.error('Simulacrum | API Connection Test Error:', error);
      ui.notifications.error(
        game.i18n.format('SIMULACRUM.ConnectionError', {
          message: error.message,
        })
      );
      button.html('<i class="fas fa-times"></i> Error').addClass('failure');
    } finally {
      setTimeout(() => {
        button
          .prop('disabled', false)
          .html(`${originalIcon} ${originalText}`)
          .removeClass('success failure');
      }, 2000);
    }
  }

  /**
   * Handle exporting settings to a JSON file.
   * @param {Event} event
   * @private
   */
  _onExportSettings(event) {
    event.preventDefault();
    const settings = {};
    for (const setting of game.settings.settings.values()) {
      if (setting.scope === 'world' && setting.module === 'simulacrum') {
        settings[setting.key] = game.settings.get('simulacrum', setting.key);
      }
    }

    const filename = `simulacrum_settings_${new Date().toISOString().slice(0, 10)}.json`;
    saveDataToFile(
      JSON.stringify(settings, null, 2),
      'application/json',
      filename
    );
    ui.notifications.info(game.i18n.localize('SIMULACRUM.SettingsExported'));
  }

  /**
   * Handle importing settings from a JSON file.
   * @param {Event} event
   * @private
   */
  _onImportSettings(event) {
    event.preventDefault();
    new FilePicker({
      type: 'text',
      current: '',
      callback: async (path) => {
        try {
          const response = await fetch(path);
          const importedSettings = await response.json();

          // Basic validation: check if it's an object and contains expected keys
          if (
            typeof importedSettings !== 'object' ||
            importedSettings === null
          ) {
            throw new Error(
              game.i18n.localize('SIMULACRUM.ImportInvalidFormat')
            );
          }

          for (const key in importedSettings) {
            if (game.settings.settings.has(`simulacrum.${key}`)) {
              const setting = game.settings.settings.get(`simulacrum.${key}`);
              // Only import world-scoped settings for this module
              if (
                setting.scope === 'world' &&
                setting.module === 'simulacrum'
              ) {
                await game.settings.set(
                  'simulacrum',
                  key,
                  importedSettings[key]
                );
              }
            }
          }
          ui.notifications.info(
            game.i18n.localize('SIMULACRUM.SettingsImported')
          );
          this.render(true); // Re-render to show updated settings
        } catch (error) {
          console.error('Simulacrum | Settings Import Error:', error);
          ui.notifications.error(
            game.i18n.format('SIMULACRUM.ImportFailed', {
              message: error.message,
            })
          );
        }
      },
      // FoundryVTT v12 uses `source` for file picker, not `target`
      // source: "data" // Or "public" or "forgevtt"
    }).browse();
  }

  /**
   * This method is called when the form is submitted.
   * @param {Event} event
   * @param {object} formData
   * @private
   */
  async _updateObject(_event, _formData) {
    // No direct form submission for settings, actions are handled by buttons
  }
}
