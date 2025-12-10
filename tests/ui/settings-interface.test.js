import { SettingsInterface, registerAdvancedSettings } from '../../scripts/ui/settings-interface.js';

// Test setup helpers
function setupMockGame() {
  return {
    settings: {
      get: jest.fn(),
      set: jest.fn(),
      register: jest.fn()
    }
  };
}

function setupMockUI() {
  return {
    notifications: {
      info: jest.fn(),
      error: jest.fn()
    }
  };
}

function setupMockFormData() {
  return new Map([
    ['enabled', true],
    ['provider', 'openai'],
    ['apiKey', 'sk-test123'],
    ['baseURL', 'https://api.openai.com/v1'],
    ['model', 'gpt-3.5-turbo'],
    ['maxTokens', '4096'],
    ['temperature', '0.7']
  ]);
}

function setupTestEnvironment() {
  const mockGame = setupMockGame();
  const mockUI = setupMockUI();

  global.game = mockGame;
  global.ui = mockUI;
  global.mergeObject = jest.fn((base, obj) => ({ ...base, ...obj }));
  global.Dialog = {
    confirm: jest.fn()
  };
  global.fetch = jest.fn();

  // Mock FormApplication
  global.FormApplication = class {
    static get defaultOptions() {
      return {};
    }
    activateListeners() { }
    render() { }
  };

  return { mockGame, mockUI };
}

describe('SettingsInterface - basic tests', () => {
  let settingsInterface;
  let mockGame;
  let mockUI;
  // eslint-disable-next-line no-unused-vars
  let mockFormData;

  beforeEach(() => {
    // Mock game.settings
    mockGame = setupMockGame();

    // Mock ui.notifications
    mockUI = setupMockUI();

    global.game = mockGame;
    global.ui = mockUI;
    global.mergeObject = jest.fn((base, obj) => ({ ...base, ...obj }));
    global.Dialog = {
      confirm: jest.fn()
    };

    // Mock FormApplication
    global.FormApplication = class {
      static get defaultOptions() {
        return {};
      }
      activateListeners() { }
      render() { }
    };

    mockFormData = new Map([
      ['enabled', true],
      ['provider', 'openai'],
      ['apiKey', 'sk-test123'],
      ['baseURL', 'https://api.openai.com/v1'],
      ['model', 'gpt-3.5-turbo'],
      ['maxTokens', '4096'],
      ['temperature', '0.7']
    ]);

    settingsInterface = new SettingsInterface();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with testing false', () => {
      expect(settingsInterface.testing).toBe(false);
    });
  });
});

describe('SettingsInterface - getData', () => {
  let settingsInterface;
  let mockGame;

  beforeEach(() => {
    mockGame = setupMockGame();
    global.game = mockGame;
    settingsInterface = new SettingsInterface();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('data retrieval', () => {
    it('should return current settings data', () => {
      // Setup mock settings
      mockGame.settings.get.mockImplementation((_module, key) => ({
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-test123',
        model: 'gpt-3.5-turbo',
        maxTokens: 4096,
        temperature: 0.7,
        contextLength: 20,
        customSystemPrompt: ''
      })[key]);

      const data = settingsInterface.getData();

      expect(data).toEqual({
        apiKey: 'sk-test123',
        baseURL: 'https://api.openai.com/v1',
        baseURLPlaceholder: 'https://api.openai.com/v1',
        model: 'gpt-3.5-turbo',
        maxTokens: 4096,
        temperature: 0.7,
        contextLength: 20,
        customSystemPrompt: '',
        provider: 'openai',
        providerIsOpenAI: true,
        providerIsGemini: false,
        testing: false
      });
    });

    it('should derive Gemini placeholder when provider is gemini', () => {
      mockGame.settings.get.mockImplementation((_module, key) => ({
        provider: 'gemini',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'test-key',
        model: 'gemini-pro',
        maxTokens: 4096,
        temperature: 0.7,
        contextLength: 20,
        customSystemPrompt: ''
      })[key]);

      const data = settingsInterface.getData();

      expect(data.baseURLPlaceholder).toBe('https://generativelanguage.googleapis.com/v1beta');
      expect(data.provider).toBe('gemini');
      expect(data.providerIsGemini).toBe(true);
      expect(data.providerIsOpenAI).toBe(false);
    });
  });
});

describe('SettingsInterface - validation methods', () => {
  let settingsInterface;

  beforeEach(() => {
    setupTestEnvironment();
    settingsInterface = new SettingsInterface();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('_validateApiKey', () => {
    it('should validate OpenAI API key format', () => {
      const mockInput = {
        value: 'sk-test123456789012345678901',
        classList: { add: jest.fn(), remove: jest.fn() },
        form: {
          querySelector: jest.fn().mockReturnValue({})
        }
      };

      const event = { target: mockInput };
      settingsInterface._validateApiKey(event);

      expect(mockInput.classList.remove).toHaveBeenCalledWith('valid', 'invalid');
      expect(mockInput.classList.add).toHaveBeenCalledWith('valid');
    });

    it('should mark short keys as valid without erroring', () => {
      const mockInput = {
        value: 'sk-short',
        classList: { add: jest.fn(), remove: jest.fn() },
        form: {
          querySelector: jest.fn().mockReturnValue({})
        }
      };

      const event = { target: mockInput };
      settingsInterface._validateApiKey(event);

      expect(mockInput.classList.add).toHaveBeenCalledWith('valid');
      expect(mockInput.classList.add).not.toHaveBeenCalledWith('invalid');
    });
  });

  describe('_validateBaseURL', () => {
    it('should validate proper URL format', () => {
      const mockInput = {
        value: 'https://api.openai.com/v1',
        classList: { add: jest.fn(), remove: jest.fn() }
      };

      const event = { target: mockInput };
      settingsInterface._validateBaseURL(event);

      expect(mockInput.classList.add).toHaveBeenCalledWith('valid');
    });

    it('should invalidate malformed URL', () => {
      const mockInput = {
        value: 'invalid-url',
        classList: { add: jest.fn(), remove: jest.fn() }
      };

      const event = { target: mockInput };
      settingsInterface._validateBaseURL(event);

      expect(mockInput.classList.add).toHaveBeenCalledWith('invalid');
    });
  });
});

describe('SettingsInterface - form interactions', () => {
  let settingsInterface;
  let mockGame;
  let mockUI;

  beforeEach(() => {
    const { mockGame: mg, mockUI: mu } = setupTestEnvironment();
    mockGame = mg;
    mockUI = mu;
    settingsInterface = new SettingsInterface();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('_onResetDefaults', () => {
    it('should reset form to default values when confirmed', async () => {
      global.Dialog.confirm.mockResolvedValue(true);

      const mockForm = {
        querySelector: jest.fn()
      };

      const mockElements = {
        provider: { value: 'gemini' },
        apiKey: { value: 'old-key' },
        baseURL: { value: 'https://example.com/custom', placeholder: 'https://example.com/custom' },
        model: { value: 'llama2' },
        maxTokens: { value: '2048' },
        temperature: { value: '0.5' },
        contextLength: { value: '10' },
        customSystemPrompt: { value: 'old prompt' }
      };

      mockForm.querySelector.mockImplementation(selector => {
        const field = selector.match(/name="(\w+)"/)?.[1];
        return mockElements[field] || null;
      });

      const event = {
        preventDefault: jest.fn(),
        target: { form: mockForm }
      };

      settingsInterface._validateForm = jest.fn();

      await settingsInterface._onResetDefaults(event);

      expect(mockElements.apiKey.value).toBe('');
      expect(mockElements.baseURL.value).toBe('https://api.openai.com/v1');
      expect(mockElements.baseURL.placeholder).toBe('https://api.openai.com/v1');
      expect(mockElements.model.value).toBe('gpt-3.5-turbo');
      expect(mockElements.contextLength.value).toBe('20');
      expect(mockElements.customSystemPrompt.value).toBe('');
      expect(mockElements.provider.value).toBe('openai');
      expect(mockUI.notifications.info).toHaveBeenCalledWith('Settings reset to defaults');
    });
  });

  describe('_onProviderChange', () => {
    it('should update base URL placeholder and current provider', () => {
      const baseInput = { placeholder: '', value: '', dispatchEvent: jest.fn() };
      const mockForm = {
        querySelector: jest.fn((selector) => {
          if (selector === 'input[name="baseURL"]') return baseInput;
          return null;
        })
      };

      const event = {
        preventDefault: jest.fn(),
        target: {
          value: 'gemini',
          form: mockForm
        }
      };

      settingsInterface.form = mockForm;
      settingsInterface._validateForm = jest.fn();

      settingsInterface._onProviderChange(event);

      expect(settingsInterface.currentProvider).toBe('gemini');
      expect(baseInput.placeholder).toBe('https://generativelanguage.googleapis.com/v1beta');
      expect(settingsInterface._validateForm).toHaveBeenCalled();
    });

    it('should default to openai when no provider provided', () => {
      const baseInput = { placeholder: '', value: '', dispatchEvent: jest.fn() };
      const mockForm = {
        querySelector: jest.fn(() => baseInput)
      };

      settingsInterface.form = mockForm;
      settingsInterface._validateForm = jest.fn();

      settingsInterface._onProviderChange({ target: { value: '', form: mockForm } });

      expect(settingsInterface.currentProvider).toBe('openai');
      expect(baseInput.placeholder).toBe('https://api.openai.com/v1');
    });
  });

  describe('_updateObject', () => {
    it('should save settings successfully', async () => {
      mockGame.settings.set.mockResolvedValue();
      global.SimulacrumCore = { initializeAIClient: jest.fn() };

      const formData = {
        provider: 'openai',
        apiKey: 'sk-test123',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-3.5-turbo',
        maxTokens: '4096',
        temperature: '0.7'
      };

      await settingsInterface._updateObject({}, formData);

      expect(mockGame.settings.set).toHaveBeenCalledWith('simulacrum', 'provider', 'openai');
      expect(mockGame.settings.set).toHaveBeenCalledWith('simulacrum', 'maxTokens', 4096);
      expect(mockGame.settings.set).toHaveBeenCalledWith('simulacrum', 'temperature', 0.7);
      expect(mockUI.notifications.info).toHaveBeenCalledWith('Simulacrum settings saved successfully');
    });

    it('should handle save errors gracefully', async () => {
      const error = new Error('Save failed');
      mockGame.settings.set.mockRejectedValue(error);

      const formData = { enabled: true, provider: 'openai', apiKey: '', baseURL: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' };

      await expect(settingsInterface._updateObject({}, formData)).rejects.toThrow('Save failed');
      expect(mockUI.notifications.error).toHaveBeenCalledWith('Failed to save settings: Save failed');
    });
  });

  describe('static open', () => {
    it('should create and render settings interface', () => {
      const mockRender = jest.fn();
      SettingsInterface.prototype.render = mockRender;

      const instance = SettingsInterface.open();

      expect(instance).toBeInstanceOf(SettingsInterface);
      expect(mockRender).toHaveBeenCalledWith(true);
    });
  });
});

describe('SettingsInterface - API connection testing', () => {
  let settingsInterface;
  let mockUI;

  beforeEach(() => {
    const { mockUI: mu } = setupTestEnvironment();
    mockUI = mu;
    settingsInterface = new SettingsInterface();
    settingsInterface.logger = { info: jest.fn(), error: jest.fn() };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('_testApiConnection', () => {
    it('should test OpenAI-compatible endpoint successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'test-model' }] })
      });

      const config = {
        provider: 'openai',
        apiKey: 'sk-test123',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-3.5-turbo'
      };

      const result = await settingsInterface._testApiConnection(config);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk-test123'
          })
        })
      );

      expect(result).toEqual({
        success: true,
        content: 'Connected to OpenAI-compatible API'
      });
    });

    it('should test Gemini endpoint successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'models/gemini-pro' }] })
      });

      const config = {
        provider: 'gemini',
        apiKey: 'test-key',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-pro'
      };

      const result = await settingsInterface._testApiConnection(config);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models?key=test-key',
        expect.any(Object)
      );

      expect(result).toEqual({
        success: true,
        content: 'Connected to Gemini API'
      });
    });

    it('should handle API connection failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      });

      const config = {
        provider: 'openai',
        apiKey: 'invalid-key',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-3.5-turbo'
      };

      await expect(settingsInterface._testApiConnection(config))
        .rejects.toThrow('API Error 401: Unauthorized');
    });
  });

  describe('_onTestConnection', () => {
    it('should handle successful connection test', async () => {
      const mockButton = {
        find: jest.fn().mockReturnValue({ attr: jest.fn() }),
        toggleClass: jest.fn().mockReturnThis(),
        siblings: jest.fn().mockReturnValue({ text: jest.fn(), toggleClass: jest.fn() }),
        closest: jest.fn()
      };

      const mockForm = {
        find: jest.fn((selector) => {
          const name = selector.match(/name="([^"]+)"/)[1];
          return {
            val: () => ({
              provider: 'openai', apiKey: 'sk-test', baseURL: 'https://test', model: 'gpt'
            }[name])
          };
        })
      };
      mockButton.closest.mockReturnValue(mockForm);

      settingsInterface._testApiConnection = jest.fn().mockResolvedValue({
        success: true,
        content: 'Success message'
      });
      settingsInterface.render = jest.fn();

      const event = {
        preventDefault: jest.fn(),
        currentTarget: mockButton
      };

      await settingsInterface._onTestConnection(event);

      expect(settingsInterface._testApiConnection).toHaveBeenCalled();
      expect(mockUI.notifications.info).toHaveBeenCalledWith('Success message');
    });

    it('should handle connection test failure', async () => {
      const mockButton = {
        find: jest.fn().mockReturnValue({ attr: jest.fn() }),
        toggleClass: jest.fn().mockReturnThis(),
        siblings: jest.fn().mockReturnValue({ text: jest.fn(), toggleClass: jest.fn() }),
        closest: jest.fn()
      };

      const mockForm = {
        find: jest.fn().mockReturnValue({ val: () => 'val' })
      };
      mockButton.closest.mockReturnValue(mockForm);

      settingsInterface._testApiConnection = jest.fn().mockRejectedValue(new Error('Connection failed'));
      settingsInterface.render = jest.fn();

      const event = {
        preventDefault: jest.fn(),
        currentTarget: mockButton
      };

      await settingsInterface._onTestConnection(event);

      expect(mockUI.notifications.error).toHaveBeenCalledWith('Connection failed');
    });
  });
});

// Provider-specific behavior removed entirely

describe('registerAdvancedSettings', () => {
  let mockGame;

  beforeEach(() => {
    mockGame = {
      settings: {
        register: jest.fn()
      }
    };
    global.game = mockGame;
  });

  it('should register maxTokens setting', () => {
    registerAdvancedSettings();

    expect(mockGame.settings.register).toHaveBeenCalledWith(
      'simulacrum',
      'maxTokens',
      expect.objectContaining({
        name: 'Maximum Tokens',
        type: Number,
        default: 4096,
        config: false,
        restricted: true
      })
    );
  });

  it('should register temperature setting', () => {
    registerAdvancedSettings();

    expect(mockGame.settings.register).toHaveBeenCalledWith(
      'simulacrum',
      'temperature',
      expect.objectContaining({
        name: 'Response Temperature',
        type: Number,
        default: 0.7,
        config: false,
        restricted: true
      })
    );
  });
});
