// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

/**
 * Tests for SimulacrumPanel
 */

// Mock dependencies before any imports
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCreateLogger = jest.fn(() => mockLogger);

// Use doMock for ES6 module compatibility
jest.doMock('../../scripts/utils/logger.js', () => ({
  createLogger: mockCreateLogger
}));

// Mock FoundryVTT Application class
class MockApplication {
  constructor() {
    this.element = null;
  }
  
  static get defaultOptions() {
    return {
      id: 'mock-app',
      title: 'Mock App',
      template: 'mock.hbs',
      width: 400,
      height: 300
    };
  }
  
  activateListeners(html) {
    // Mock implementation
  }
  
  render(force = false) {
    // Mock implementation
    return Promise.resolve();
  }
}

global.Application = MockApplication;

// Mock foundry utils
global.foundry = {
  utils: {
    mergeObject: jest.fn((obj1, obj2) => ({ ...obj1, ...obj2 }))
  }
};

// Mock game object
global.game = {
  user: {
    isGM: false
  },
  settings: {
    sheet: {
      render: jest.fn(),
      activateTab: jest.fn()
    }
  }
};

// Dynamically import after mocks
let SimulacrumPanel;

// Import the module after all mocks are set up
beforeAll(async () => {
  const module = await import('../../scripts/ui/panel-interface.js');
  SimulacrumPanel = module.SimulacrumPanel;
});

describe('SimulacrumPanel - Constructor', () => {
  let panel;
  
  beforeEach(() => {
    jest.clearAllMocks();
    panel = new SimulacrumPanel();
  });

  it('should create panel instance', () => {
    expect(panel).toBeInstanceOf(SimulacrumPanel);
    expect(panel).toBeInstanceOf(MockApplication);
  });

  it('should create logger with correct component name', () => {
    expect(mockCreateLogger).toHaveBeenCalledWith('SimulacrumPanel');
    expect(panel.logger).toBe(mockLogger);
  });
});

describe('SimulacrumPanel - defaultOptions', () => {
  it('should return correct default options', () => {
    const options = SimulacrumPanel.defaultOptions;
    
    expect(foundry.utils.mergeObject).toHaveBeenCalled();
    expect(options.id).toBe('simulacrum-panel');
    expect(options.title).toBe('Simulacrum AI Assistant');
    expect(options.template).toBe('modules/simulacrum/templates/panel.hbs');
    expect(options.width).toBe(720);
    expect(options.height).toBe(600);
    expect(options.resizable).toBe(true);
    expect(options.minimizable).toBe(true);
    expect(options.classes).toEqual(['simulacrum', 'simulacrum-panel']);
  });

  it('should merge with parent default options', () => {
    SimulacrumPanel.defaultOptions;
    
    expect(foundry.utils.mergeObject).toHaveBeenCalledWith(
      MockApplication.defaultOptions,
      expect.objectContaining({
        id: 'simulacrum-panel',
        title: 'Simulacrum AI Assistant'
      })
    );
  });
});

describe('SimulacrumPanel - activateListeners', () => {
  let panel, mockHtml, mockButton, mockInput;

  beforeEach(() => {
    jest.clearAllMocks();
    panel = new SimulacrumPanel();
    
    // Create mock jQuery elements
    mockButton = { on: jest.fn() };
    mockInput = { on: jest.fn() };
    
    mockHtml = {
      find: jest.fn((selector) => {
        if (selector === '.simulacrum-chat-input button') return mockButton;
        if (selector === '.simulacrum-chat-input input') return mockInput;
        if (selector === '.simulacrum-settings-button') return mockButton;
        return { on: jest.fn() };
      })
    };
    
    // Mock super.activateListeners
    jest.spyOn(MockApplication.prototype, 'activateListeners').mockImplementation(() => {});
  });

  it('should call parent activateListeners', () => {
    panel.activateListeners(mockHtml);
    expect(MockApplication.prototype.activateListeners).toHaveBeenCalledWith(mockHtml);
  });

  it('should register chat submit button listener', () => {
    panel.activateListeners(mockHtml);
    
    expect(mockHtml.find).toHaveBeenCalledWith('.simulacrum-chat-input button');
    expect(mockButton.on).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('should register chat input keydown listener', () => {
    panel.activateListeners(mockHtml);
    
    expect(mockHtml.find).toHaveBeenCalledWith('.simulacrum-chat-input input');
    expect(mockInput.on).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('should register settings button listener', () => {
    panel.activateListeners(mockHtml);
    
    expect(mockHtml.find).toHaveBeenCalledWith('.simulacrum-settings-button');
    expect(mockButton.on).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('should handle Enter key in input field', () => {
    panel.activateListeners(mockHtml);
    
    // Get the keydown handler
    const keydownHandler = mockInput.on.mock.calls.find(call => call[0] === 'keydown')[1];
    
    const enterEvent = { key: 'Enter' };
    jest.spyOn(panel, '_onChatSubmit').mockImplementation(() => {});
    
    keydownHandler(enterEvent);
    
    expect(panel._onChatSubmit).toHaveBeenCalledWith(enterEvent);
  });

  it('should ignore non-Enter keys in input field', () => {
    panel.activateListeners(mockHtml);
    
    const keydownHandler = mockInput.on.mock.calls.find(call => call[0] === 'keydown')[1];
    
    const spaceEvent = { key: ' ' };
    jest.spyOn(panel, '_onChatSubmit').mockImplementation(() => {});
    
    keydownHandler(spaceEvent);
    
    expect(panel._onChatSubmit).not.toHaveBeenCalled();
  });
});

describe('SimulacrumPanel - _onChatSubmit', () => {
  let panel, mockEvent, mockInputField;

  beforeEach(() => {
    jest.clearAllMocks();
    panel = new SimulacrumPanel();
    
    mockInputField = {
      val: jest.fn().mockReturnValue('test message'),
      val: jest.fn()
    };
    
    // Mock element for input field finding
    panel.element = {
      find: jest.fn().mockReturnValue(mockInputField)
    };
    
    mockEvent = {
      preventDefault: jest.fn()
    };
    
    // Mock render method
    jest.spyOn(panel, 'render').mockResolvedValue();
  });

  it('should prevent default event behavior', async () => {
    await panel._onChatSubmit(mockEvent);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('should find and process input field', async () => {
    // Set up mock to return value then allow clearing
    mockInputField.val = jest.fn()
      .mockReturnValueOnce('test message') // first call gets value
      .mockReturnValueOnce(undefined); // second call sets empty value

    await panel._onChatSubmit(mockEvent);
    
    expect(panel.element.find).toHaveBeenCalledWith('.simulacrum-chat-input input[type="text"]');
    expect(mockInputField.val).toHaveBeenCalledWith(); // get value
    expect(mockInputField.val).toHaveBeenCalledWith(''); // clear value
  });

  it('should log user input', async () => {
    mockInputField.val = jest.fn()
      .mockReturnValueOnce('test message')
      .mockReturnValueOnce(undefined);

    await panel._onChatSubmit(mockEvent);
    
    expect(mockLogger.info).toHaveBeenCalledWith('User input:', 'test message');
  });

  it('should trigger panel re-render', async () => {
    mockInputField.val = jest.fn()
      .mockReturnValueOnce('test message')
      .mockReturnValueOnce(undefined);

    await panel._onChatSubmit(mockEvent);
    
    expect(panel.render).toHaveBeenCalledWith(true);
  });

  it('should handle empty input gracefully', async () => {
    mockInputField.val = jest.fn().mockReturnValue('   '); // whitespace only

    await panel._onChatSubmit(mockEvent);
    
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(panel.render).not.toHaveBeenCalled();
  });

  it('should handle trim empty string', async () => {
    mockInputField.val = jest.fn().mockReturnValue('');

    await panel._onChatSubmit(mockEvent);
    
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(panel.render).not.toHaveBeenCalled();
  });

  it('should handle null input value', async () => {
    mockInputField.val = jest.fn().mockReturnValue(null);

    await panel._onChatSubmit(mockEvent);
    
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(panel.render).not.toHaveBeenCalled();
  });
});

describe('SimulacrumPanel - _onOpenSettings', () => {
  let panel, mockEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    panel = new SimulacrumPanel();
    
    mockEvent = {
      preventDefault: jest.fn()
    };
  });

  it('should prevent default event behavior', () => {
    panel._onOpenSettings(mockEvent);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('should render settings sheet', () => {
    panel._onOpenSettings(mockEvent);
    expect(game.settings.sheet.render).toHaveBeenCalledWith(true);
  });
});

describe('SimulacrumPanel - getData', () => {
  let panel;

  beforeEach(() => {
    jest.clearAllMocks();
    panel = new SimulacrumPanel();
  });

  it('should return data object with isGM from current user', () => {
    game.user.isGM = true;
    
    const data = panel.getData();
    
    expect(data.isGM).toBe(true);
  });

  it('should return data object with isGM false for non-GM user', () => {
    game.user.isGM = false;
    
    const data = panel.getData();
    
    expect(data.isGM).toBe(false);
  });

  it('should return default messages array', () => {
    const data = panel.getData();
    
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0]).toEqual({
      role: 'assistant',
      content: 'Hello! How can I assist you with your campaign documents today?'
    });
  });

  it('should return consistent data structure', () => {
    const data = panel.getData();
    
    expect(typeof data).toBe('object');
    expect(data).toHaveProperty('isGM');
    expect(data).toHaveProperty('messages');
    expect(Array.isArray(data.messages)).toBe(true);
  });
});

describe('SimulacrumPanel - Integration', () => {
  let panel;

  beforeEach(() => {
    jest.clearAllMocks();
    panel = new SimulacrumPanel();
  });

  it('should handle full workflow from construction to data fetching', () => {
    // Test construction
    expect(panel).toBeInstanceOf(SimulacrumPanel);
    expect(mockCreateLogger).toHaveBeenCalledWith('SimulacrumPanel');
    
    // Test configuration
    const options = SimulacrumPanel.defaultOptions;
    expect(options.id).toBe('simulacrum-panel');
    
    // Test data retrieval
    const data = panel.getData();
    expect(data).toHaveProperty('isGM');
    expect(data).toHaveProperty('messages');
  });

  it('should handle event listener registration and execution flow', () => {
    const mockHtml = {
      find: jest.fn().mockReturnValue({ on: jest.fn() })
    };
    
    jest.spyOn(MockApplication.prototype, 'activateListeners').mockImplementation(() => {});
    
    panel.activateListeners(mockHtml);
    
    expect(MockApplication.prototype.activateListeners).toHaveBeenCalledWith(mockHtml);
    expect(mockHtml.find).toHaveBeenCalledTimes(3); // chat button, input, settings button
  });
});