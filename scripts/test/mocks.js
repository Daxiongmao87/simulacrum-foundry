// Mock FoundryVTT APIs for testing

export const mockCONST = {
  USER_ROLES: {
    GM: 3,
    ASSISTANT_GM: 2,
    USER: 0
  }
};

export const mockGame = {
  user: { isGM: true, role: mockCONST.USER_ROLES.GM },
  settings: {
    get: (module, key) => {
      const defaults = {
        'simulacrum': {
          permission: 'GM',
          apiEndpoint: 'https://api.openai.com/v1'
        }
      };
      return defaults[module]?.[key];
    }
  },
  collections: {
    get: (name) => {
      // Return a simple collection mock
      return {
        get: (id) => ({ id, name: 'MockDoc', type: name }),
        values: () => [
          { id: '1', name: 'Doc1', type: name },
          { id: '2', name: 'Doc2', type: name }
        ]
      };
    }
  },
  simulacrum: {
    toolRegistry: null
  }
};
