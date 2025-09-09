// Mock FoundryVTT globals first (v13-aligned)
global.AbstractSidebarTab = class MockAbstractSidebarTab {
  static DEFAULT_OPTIONS = {
    id: 'mock',
    classes: ["tab", "sidebar-tab"],
    tag: 'section',
    window: { frame: false, positioned: false, resizable: false },
    actions: {}
  };
  constructor() {
    this.element = null;
    this.messages = [];
  }
  render() { return this; }
  _prepareContext() { return Promise.resolve({}); }
  _activateListeners() {}
  _attachPartListeners() {}
};

global.HandlebarsApplicationMixin = (BaseClass) => class extends BaseClass {
  static PARTS = {};
  static DEFAULT_OPTIONS = BaseClass.DEFAULT_OPTIONS || {};
  render(options = {}) { return this; }
};

global.foundry = {
  utils: {
    mergeObject: (obj1, obj2) => ({ ...obj1, ...obj2 }),
    randomID: () => 'test-id-' + Math.random().toString(36).slice(2)
  },
  applications: {
    sidebar: {
      Sidebar: class { static TABS = {}; }
    },
    api: { HandlebarsApplicationMixin: global.HandlebarsApplicationMixin }
  }
};

global.game = {
  user: {
    id: 'test-user',
    name: 'Test User',
    avatar: 'icons/svg/mystery-man.svg',
    isGM: false
  },
  i18n: { localize: (k) => k }
};

global.CONFIG = { ui: {} };

global.TextEditor = {
  enrichHTML: jest.fn((content) => Promise.resolve(content))
};

global.console = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

// Mock conversation commands module
jest.mock('../../scripts/ui/conversation-commands.js', () => ({
  ConversationCommands: {
    handleConversationCommand: jest.fn()
  }
}));

// Import module dynamically after globals are set up to avoid hoisting issues
let SimulacrumSidebarTab;
let registerSimulacrumSidebarTab;
beforeAll(async () => {
  const mod = await import('../../scripts/ui/simulacrum-sidebar-tab.js');
  SimulacrumSidebarTab = mod.SimulacrumSidebarTab;
  registerSimulacrumSidebarTab = mod.registerSimulacrumSidebarTab;
});

describe('SimulacrumSidebarTab', () => {
  let sidebarTab;

  beforeEach(() => {
    sidebarTab = new SimulacrumSidebarTab();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should seed a welcome assistant message', () => {
      expect(Array.isArray(sidebarTab.messages)).toBe(true);
      expect(sidebarTab.messages.length).toBeGreaterThanOrEqual(1);
      const first = sidebarTab.messages[0];
      expect(first.role).toBe('assistant');
      expect(first.content).toBe('SIMULACRUM.WelcomeMessage');
    });

    it('should have correct static properties', () => {
      expect(SimulacrumSidebarTab.tabName).toBe('simulacrum');
      expect(SimulacrumSidebarTab.PARTS).toBeDefined();
      expect(SimulacrumSidebarTab.PARTS.log).toBeDefined();
      expect(SimulacrumSidebarTab.PARTS.input).toBeDefined();
    });
  });

  describe('_prepareContext', () => {
    it('should prepare context with messages and user info', async () => {
      sidebarTab.messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const context = await sidebarTab._prepareContext();

      expect(context.messages).toEqual(sidebarTab.messages);
      expect(context.isGM).toBe(false);
      expect(context.user).toBe(game.user);
    });
  });

  describe('addMessage', () => {
    it('should add a user message', async () => {
      sidebarTab.messages = [];
      const renderSpy = jest.spyOn(sidebarTab, 'render').mockReturnThis();
      await sidebarTab.addMessage('user', 'Hello world');

      const last = sidebarTab.messages[sidebarTab.messages.length - 1];
      expect(last.role).toBe('user');
      expect(last.content).toBe('Hello world');
      expect(last.user).toBe(game.user);
      expect(renderSpy).toHaveBeenCalledWith({ parts: ['log'] });
    });

    it('should add an assistant message', async () => {
      sidebarTab.messages = [];
      const renderSpy = jest.spyOn(sidebarTab, 'render').mockReturnThis();
      await sidebarTab.addMessage('assistant', 'Hello there!');

      const last = sidebarTab.messages[sidebarTab.messages.length - 1];
      expect(last.role).toBe('assistant');
      expect(last.content).toBe('Hello there!');
      expect(last.user).toBeNull();
      expect(renderSpy).toHaveBeenCalledWith({ parts: ['log'] });
    });

    it('should add message with display content', async () => {
      sidebarTab.messages = [];
      await sidebarTab.addMessage('assistant', 'Raw content', '**Formatted** content');

      const last = sidebarTab.messages[sidebarTab.messages.length - 1];
      expect(last.content).toBe('Raw content');
      expect(last.display).not.toBe(null);
    });

    it('should generate unique IDs and timestamps', async () => {
      sidebarTab.messages = [];
      await sidebarTab.addMessage('user', 'Message 1');
      await sidebarTab.addMessage('user', 'Message 2');

      const a = sidebarTab.messages[0];
      const b = sidebarTab.messages[1];
      expect(a.id).toBeDefined();
      expect(b.id).toBeDefined();
      expect(a.id).not.toBe(b.id);
      expect(a.timestamp).toBeDefined();
      expect(b.timestamp).toBeDefined();
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages', async () => {
      await sidebarTab.addMessage('user', 'Hello');
      await sidebarTab.addMessage('assistant', 'Hi');
      
      sidebarTab.clearMessages();
      
      expect(sidebarTab.messages).toEqual([]);
    });
  });

  describe('_scrollToBottom', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delegate to scrollBottom safely', () => {
      const scrollSpy = jest.spyOn(sidebarTab, 'scrollBottom').mockResolvedValue();
      sidebarTab._scrollToBottom();
      jest.advanceTimersByTime(10);
      expect(scrollSpy).toHaveBeenCalled();
    });

    it('should handle missing element gracefully', () => {
      sidebarTab.element = null;

      expect(() => {
        sidebarTab._scrollToBottom();
        jest.advanceTimersByTime(10);
      }).not.toThrow();
    });

    it('should handle missing chat log gracefully', () => {
      sidebarTab.element = {
        querySelector: jest.fn().mockReturnValue(null)
      };

      expect(() => {
        sidebarTab._scrollToBottom();
        jest.advanceTimersByTime(10);
      }).not.toThrow();
    });
  });

  describe('_activateListeners', () => {
    let mockHtml, mockTextarea, mockForm;

    beforeEach(() => {
      mockTextarea = { addEventListener: jest.fn(), focus: jest.fn() };
      mockForm = { addEventListener: jest.fn(), querySelector: jest.fn(() => mockTextarea) };
      mockHtml = { querySelector: jest.fn((selector) => selector === '.chat-form' ? mockForm : (selector === 'textarea[name="message"]' ? mockTextarea : null)) };

      // Mock super._activateListeners
      const mockSuper = Object.getPrototypeOf(Object.getPrototypeOf(sidebarTab));
      mockSuper._activateListeners = jest.fn();
    });

    it('should call super._activateListeners', () => {
      const mockSuper = Object.getPrototypeOf(Object.getPrototypeOf(sidebarTab));
      sidebarTab._activateListeners(mockHtml);
      
      expect(mockSuper._activateListeners).toHaveBeenCalledWith(mockHtml);
    });

    it('should add keydown listener to message input', () => {
      sidebarTab._activateListeners(mockHtml);
      expect(mockHtml.querySelector).toHaveBeenCalledWith('textarea[name="message"]');
      expect(mockTextarea.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should focus on message input', () => {
      sidebarTab._activateListeners(mockHtml);
      expect(mockTextarea.focus).toHaveBeenCalled();
    });

    it('should handle Enter key press by invoking send action', () => {
      const sendSpy = jest.spyOn(SimulacrumSidebarTab, '_onSendMessage').mockResolvedValue();
      sidebarTab._activateListeners(mockHtml);
      const keydownHandler = mockTextarea.addEventListener.mock.calls.find(c => c[0] === 'keydown')[1];
      const mockEvent = { key: 'Enter', preventDefault: jest.fn() };
      keydownHandler(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalled();
    });

    it('should handle Enter with Shift held consistently', () => {
      const sendSpy = jest.spyOn(SimulacrumSidebarTab, '_onSendMessage').mockResolvedValue();
      sidebarTab._activateListeners(mockHtml);
      const keydownHandler = mockTextarea.addEventListener.mock.calls.find(c => c[0] === 'keydown')[1];
      const mockEvent = { key: 'Enter', shiftKey: true, preventDefault: jest.fn() };
      keydownHandler(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalled();
    });

    it('should handle missing form/textarea gracefully', () => {
      const emptyHtml = { querySelector: jest.fn().mockReturnValue(null) };
      expect(() => sidebarTab._activateListeners(emptyHtml)).not.toThrow();
    });
  });

  describe('Instance Methods', () => {
    it('should render with updated context after adding message', async () => {
      const renderSpy = jest.spyOn(sidebarTab, 'render').mockReturnThis();
      const scrollSpy = jest.spyOn(sidebarTab, '_scrollToBottom');
      await sidebarTab.addMessage('user', 'Test message');
      expect(renderSpy).toHaveBeenCalledWith({ parts: ['log'] });
      expect(scrollSpy).toHaveBeenCalled();
    });

    it('should render after clearing messages', () => {
      const renderSpy = jest.spyOn(sidebarTab, 'render').mockReturnThis();
      sidebarTab.messages = [{ id: '1', role: 'user', content: 'test' }];
      sidebarTab.clearMessages();
      expect(renderSpy).toHaveBeenCalledWith({ parts: ['log'] });
    });
  });

  describe('Process status handling', () => {
    it('caps long process labels to prevent layout issues', async () => {
      const listeners = {};
      global.Hooks = {
        on: jest.fn((evt, cb) => { listeners[evt] = cb; })
      };
      const tab = new SimulacrumSidebarTab();
      const longLabel = 'X'.repeat(300);
      // fire start
      listeners['simulacrum:processStatus']?.({ state: 'start', callId: 'c1', label: longLabel, toolName: 'tool' });
      const ctx = await tab._prepareContext();
      expect(ctx.processActive).toBe(true);
      expect(ctx.processLabel.length).toBeLessThanOrEqual(120);
      // end should clear
      listeners['simulacrum:processStatus']?.({ state: 'end', callId: 'c1' });
      const ctx2 = await tab._prepareContext();
      expect(ctx2.processActive).toBe(false);
      delete global.Hooks;
    });
  });
});

describe('registerSimulacrumSidebarTab', () => {
  beforeEach(() => {
    foundry.applications.sidebar.Sidebar.TABS = {};
    global.CONFIG.ui = {};
  });

  it('should register sidebar tab and class', () => {
    registerSimulacrumSidebarTab();
    expect(foundry.applications.sidebar.Sidebar.TABS.simulacrum).toBeDefined();
    expect(foundry.applications.sidebar.Sidebar.TABS.simulacrum.icon).toBe('fa-solid fa-hand-sparkles');
    expect(foundry.applications.sidebar.Sidebar.TABS.simulacrum.tooltip).toBe('SIMULACRUM.SidebarTab.Title');
    expect(CONFIG.ui.simulacrum).toBe(SimulacrumSidebarTab);
  });

  it('should not throw during registration', () => {
    expect(() => registerSimulacrumSidebarTab()).not.toThrow();
  });
});
