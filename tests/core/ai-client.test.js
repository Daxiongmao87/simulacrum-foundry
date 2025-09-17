// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { AIClient, AIProvider, MockAIProvider, OpenAIProvider } from '../../scripts/core/ai-client.js';
// Use global.fetch provided by tests/setup.js

// Common test setup
let mockConfig;

const setupAIClientTests = () => {
  global.fetch.mockClear();
  mockConfig = {
    apiKey: 'test-api-key',
    model: 'test-model',
    maxTokens: 1000,
  };
};

describe('AIClient - initialization', () => {
  beforeEach(setupAIClientTests);

  test('should initialize with provided configuration', () => {
    mockConfig.baseURL = 'https://api.openai.com/v1';
    const client = new AIClient(mockConfig);
    expect(client.apiKey).toBe(mockConfig.apiKey);
    expect(client.baseURL).toBe(mockConfig.baseURL);
    expect(client.model).toBe(mockConfig.model);
    expect(client.maxTokens).toBe(mockConfig.maxTokens);
    // provider-agnostic: no provider asserted
  });

  test('should use default maxTokens if not provided', () => {
    mockConfig.baseURL = 'https://api.openai.com/v1';
    delete mockConfig.maxTokens;
    const client = new AIClient(mockConfig);
    expect(client.maxTokens).toBe(4096); // Default value from ARCHITECTURE.md
  });

  // provider-agnostic: no unsupported baseURL error
});

describe('AIClient - chat OpenAI', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'https://api.openai.com/v1';
  });

  test('should send correct request and return response', async () => {
      const mockResponse = { choices: [{ message: { content: 'Hello' } }] };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
    });

      const client = new AIClient(mockConfig);
      const messages = [{ role: 'user', content: 'Hi' }];
      const response = await client.chat(messages);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
          body: JSON.stringify({
            model: 'test-model',
            messages: messages,
            max_tokens: 1000,
          }),
        })
      );
      expect(response.choices[0].message.content).toBe('Hello');
  });

});

describe('AIClient - chat OpenAI tools', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'https://api.openai.com/v1';
  });

  test('should handle tools in chat request', async () => {
    const mockResponse = { choices: [{ message: { content: 'Hello' } }] };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new AIClient(mockConfig);
    const messages = [{ role: 'user', content: 'Hi' }];
    const tools = [{ type: 'function', function: { name: 'test_tool' } }];
    await client.chat(messages, tools);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          model: 'test-model',
          messages: messages,
          max_tokens: 1000,
          tools: tools,
          tool_choice: 'auto',
        }),
      })
    );
  });
});

describe('AIClient - chat OpenAI errors', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'https://api.openai.com/v1';
  });

  test('should throw error on API failure', async () => {
    const mockError = { message: 'API error' };
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve(mockError),
    });

    const client = new AIClient(mockConfig);
    const messages = [{ role: 'user', content: 'Hi' }];
    await expect(client.chat(messages)).rejects.toThrow('400 - API error');
  });
});

describe('AIClient - chat Ollama', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'http://localhost:11434/v1';
  });

  test('should send correct request and return response', async () => {
      const mockResponse = { choices: [{ message: { content: 'Hello' } }] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
    });

      const client = new AIClient(mockConfig);
      const messages = [{ role: 'user', content: 'Hi' }];
      const response = await client.chat(messages);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            model: 'test-model',
            messages: messages,
            max_tokens: 1000,
          }),
        })
      );
      expect(response.choices[0].message.content).toBe('Hello');
  });

});

describe('AIClient - chat Gemini', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'https://generativelanguage.googleapis.com/v1beta';
    mockConfig.provider = 'gemini';
    mockConfig.model = 'gemini-pro';
  });

  test('should send Gemini request with system prompt and tools', async () => {
    const mockResponse = {
      model: 'models/gemini-pro',
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello from Gemini' }]
          }
        }
      ]
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const client = new AIClient(mockConfig);
    const messages = [{ role: 'user', content: 'Hi' }];
    const tools = [{ type: 'function', function: { name: 'lookup', description: 'Lookup data', parameters: { type: 'object', properties: {} } } }];

    const response = await client.chatWithSystem(messages, () => 'Be helpful', tools, { provider: 'gemini' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['x-goog-api-key']).toBe('test-api-key');

    const parsedBody = JSON.parse(options.body);
    expect(parsedBody.systemInstruction.parts[0].text).toBe('Be helpful');
    expect(parsedBody.contents[0].role).toBe('user');
    expect(parsedBody.tools[0].functionDeclarations[0].name).toBe('lookup');

    expect(response).toEqual(mockResponse);
  });

  test('should sanitize tool schemas for Gemini', () => {
    const client = new AIClient(mockConfig);
    const tools = [
      {
        type: 'function',
        function: {
          name: 'outer_tool',
          description: 'Test tool',
          parameters: {
            type: 'object',
            properties: {
              requiredField: { type: 'string', required: true },
              nested: {
                type: 'object',
                properties: {
                  innerRequired: { type: 'number', required: true },
                  innerOptional: { type: 'string' }
                }
              }
            },
            required: ['nested']
          }
        }
      }
    ];

    const declarations = client._mapToolsForGemini(tools);

    expect(declarations).toHaveLength(1);
    const parameters = declarations[0].parameters;

    expect(parameters.required).toEqual(expect.arrayContaining(['nested', 'requiredField']));
    expect(parameters.properties.requiredField.required).toBeUndefined();
    expect(parameters.properties.nested.required).toEqual(expect.arrayContaining(['innerRequired']));
    expect(parameters.properties.nested.properties.innerRequired.required).toBeUndefined();
  });
});

describe('AIClient - chat Ollama tools', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'http://localhost:11434/v1';
  });

  test('should handle tools in chat request (Ollama format)', async () => {
    const mockResponse = { message: { content: 'Hello' } };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new AIClient(mockConfig);
    const messages = [{ role: 'user', content: 'Hi' }];
    const tools = [{ type: 'function', function: { name: 'test_tool' } }];
    await client.chat(messages, tools);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          model: 'test-model',
          messages: messages,
          max_tokens: 1000,
          tools: tools,
          tool_choice: 'auto',
        }),
      })
    );
  });
});

describe('AIClient - chat Ollama errors', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'http://localhost:11434/v1';
  });

  test('should throw error on API failure', async () => {
    const mockError = { error: 'API error' };
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve(mockError),
    });

    const client = new AIClient(mockConfig);
    const messages = [{ role: 'user', content: 'Hi' }];
    await expect(client.chat(messages)).rejects.toThrow('500 - {"error":"API error"}');
  });
});

describe('AIClient - validateConnection OpenAI', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'https://api.openai.com/v1';
  });

  test('should return true if model is found', async () => {
      const mockModels = { data: [{ id: 'test-model' }, { id: 'other-model' }] };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
    });

      const client = new AIClient(mockConfig);
      await expect(client.validateConnection()).resolves.toBe(true);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        })
      );
  });

  test('should return false if model is not found', async () => {
      const mockModels = { data: [{ id: 'other-model' }] };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
    });

      const client = new AIClient(mockConfig);
      await expect(client.validateConnection()).resolves.toBe(false);
  });

  test('should throw error on API failure', async () => {
      const mockError = { message: 'Connection error' };
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve(mockError),
    });

      const client = new AIClient(mockConfig);
      await expect(client.validateConnection()).rejects.toThrow('AI API connection error: 401 - Connection error');
  });
});

describe('AIClient - validateConnection Ollama', () => {
  beforeEach(() => {
    setupAIClientTests();
    mockConfig.baseURL = 'http://localhost:11434/v1';
  });

  test('should return true if model is found', async () => {
      const mockModels = { data: [{ id: 'test-model' }, { id: 'other-model' }] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
    });

      const client = new AIClient(mockConfig);
      await expect(client.validateConnection()).resolves.toBe(true);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.objectContaining({
          method: 'GET',
        })
      );
  });

  test('should return false if model is not found', async () => {
      const mockModels = { data: [{ id: 'other-model' }] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
    });

      const client = new AIClient(mockConfig);
      await expect(client.validateConnection()).resolves.toBe(false);
  });

  test('should throw error on API failure', async () => {
      const mockError = { message: 'Connection error' };
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve(mockError),
    });

      const client = new AIClient(mockConfig);
      await expect(client.validateConnection()).rejects.toThrow('AI API connection error: 500 - Connection error');
  });

  test('should handle text response fallback on error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject('Invalid JSON'),
        text: () => Promise.resolve('Server error'),
    });

      const client = new AIClient(mockConfig);
      await expect(client.validateConnection()).rejects.toThrow('AI API connection error: 500 - Server error');
  });

  test('should handle fallback to default error message', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject('Invalid JSON'),
        text: () => Promise.reject('Text error'),
    });

      const client = new AIClient(mockConfig);
      await expect(client.validateConnection()).rejects.toThrow('AI API connection error: 500 - Connection error');
  });
});

describe('AIProvider base class', () => {
  test('should throw error when sendMessage not implemented', async () => {
    const provider = new AIProvider({});
    await expect(provider.sendMessage('test')).rejects.toThrow('sendMessage must be implemented by subclass');
  });

  test('should throw error when generateResponse not implemented', async () => {
    const provider = new AIProvider({});
    await expect(provider.generateResponse([])).rejects.toThrow('generateResponse must be implemented by subclass');
  });

  test('should return true for isAvailable by default', () => {
    const provider = new AIProvider({});
    expect(provider.isAvailable()).toBe(true);
  });
});

describe('MockAIProvider', () => {
  test('should return mock response for sendMessage', async () => {
    const provider = new MockAIProvider({});
    const response = await provider.sendMessage('test message', []);
    
    expect(response.content).toContain('Mock response to: test message');
    expect(response.usage).toBeDefined();
    expect(response.model).toBe('mock-model');
  });

  test('should handle generateResponse with messages', async () => {
    const provider = new MockAIProvider({});
    const messages = [{role: 'user', content: 'test'}];
    const response = await provider.generateResponse(messages);
    
    expect(response.content).toContain('Mock response to: test');
  });

  test('should handle empty messages array', async () => {
    const provider = new MockAIProvider({});
    const response = await provider.generateResponse([]);
    
    expect(response.content).toContain('Mock response to:');
  });
});

describe('OpenAIProvider', () => {
  let mockFetch;
  
  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  test('should not enforce API key pre-check', async () => {
    const provider = new OpenAIProvider({ baseURL: 'https://api.openai.com/v1' });
    // Without a mocked successful fetch, this will still error later, but not due to pre-check
    await expect(provider.generateResponse([])).rejects.toThrow('Failed to communicate with OpenAI');
  });

  test('should be available without API key (defer to API)', async () => {
    const provider = new OpenAIProvider({ baseURL: 'https://api.openai.com/v1' });
    expect(provider.isAvailable()).toBe(true);
  });

  test('should return true for isAvailable when API key present', async () => {
    const provider = new OpenAIProvider({apiKey: 'test'});
    expect(provider.isAvailable()).toBe(true);
  });

  test('should handle API errors gracefully', async () => {
    const provider = new OpenAIProvider({apiKey: 'test'});
    
    // Test that it actually calls the expected error path
    await expect(provider.generateResponse([]))
      .rejects.toThrow('Failed to communicate with OpenAI');
  });

  test('should handle network errors', async () => {
    const provider = new OpenAIProvider({apiKey: 'test'});

    // Test that it throws some error - we're testing coverage paths
    await expect(provider.generateResponse([]))
      .rejects.toThrow('Failed to communicate with OpenAI');
  });
});

describe('AIClient - error handling and edge cases', () => {
  beforeEach(setupAIClientTests);

  test('should throw error when no baseURL configured for chat', async () => {
    const client = new AIClient({apiKey: 'test'});
    await expect(client.chat([])).rejects.toThrow('No baseURL configured for AI client');
  });

  // Provider-agnostic: no unsupported provider error expected here

  test('should detect OpenAI provider', () => {
    const client = new AIClient();
    expect(client.detectProvider('https://api.openai.com/v1')).toBe('openai');
  });

  test('should detect Ollama provider', () => {
    const client = new AIClient();
    expect(client.detectProvider('http://localhost:11434')).toBe('ollama');
    expect(client.detectProvider('http://ollama.example.com')).toBe('ollama');
  });

  test('should detect Anthropic provider', () => {
    const client = new AIClient();
    expect(client.detectProvider('https://api.anthropic.com/v1')).toBe('anthropic');
  });

  test('should return null for unknown provider', () => {
    const client = new AIClient();
    expect(client.detectProvider('https://unknown.com')).toBeNull();
    expect(client.detectProvider()).toBeNull();
  });

  // Provider-agnostic: remove supported provider check

  test('should handle text fallback in OpenAI error response', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.reject('Invalid JSON'),
      text: () => Promise.resolve('Text error message')
    });

    mockConfig.baseURL = 'https://api.openai.com/v1';
    const client = new AIClient(mockConfig);
    await expect(client.chat([])).rejects.toThrow('400 - Text error message');
  });

  test('should handle complete error fallback in OpenAI', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject('Invalid JSON'),
      text: () => Promise.reject('Text error')
    });

    mockConfig.baseURL = 'https://api.openai.com/v1';
    const client = new AIClient(mockConfig);
    await expect(client.chat([])).rejects.toThrow('500 - API error');
  });

  test('should handle tools transformation in Ollama', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({message: {content: 'response'}})
    });

    mockConfig.baseURL = 'http://localhost:11434/v1';
    const client = new AIClient(mockConfig);
    const tools = [{type: 'function', function: {name: 'test'}}];
    
    await client.chat([], tools);
    
    const callBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(callBody.tools).toBeDefined();
    expect(callBody.tools[0].function.name).toBe('test');
  });
});

describe('AIClient - provider system', () => {
  beforeEach(setupAIClientTests);

  test('should register and use providers', () => {
    const client = new AIClient();
    const mockProvider = new MockAIProvider({});

    client.registerProvider('test', mockProvider, true);
    expect(client.defaultProvider).toBe('test');
    expect(client.isProviderAvailable('test')).toBe(true);
  });

  test('should throw error when registering invalid provider', () => {
    const client = new AIClient();
    expect(() => client.registerProvider('test', {})).toThrow('Provider must extend AIProvider');
  });

  test('should set default provider', () => {
    const client = new AIClient();
    const mockProvider = new MockAIProvider({});
    client.registerProvider('test', mockProvider);
    client.setDefaultProvider('test');
    expect(client.defaultProvider).toBe('test');
  });

  test('should throw error when setting unregistered provider as default', () => {
    const client = new AIClient();
    expect(() => client.setDefaultProvider('nonexistent')).toThrow("Provider 'nonexistent' not registered");
  });

  test('should get available providers', () => {
    const client = new AIClient();
    const mockProvider = new MockAIProvider({});
    client.registerProvider('test', mockProvider);
    const providers = client.getAvailableProviders();
    expect(providers).toEqual([{name: 'test', available: true}]);
  });

  test('should initialize with default providers', () => {
    const client = new AIClient();
    client.initialize({
      openai: { apiKey: 'test', default: true }
    });
    expect(client.isProviderAvailable('mock')).toBe(true);
    expect(client.isProviderAvailable('openai')).toBe(true);
    expect(client.defaultProvider).toBe('openai');
  });

  test('should use mock as default when no other default set', () => {
    const client = new AIClient();
    client.initialize({});
    expect(client.defaultProvider).toBe('mock');
  });

  test('should send message through provider', async () => {
    const client = new AIClient();
    const mockProvider = new MockAIProvider({});
    
    client.registerProvider('test', mockProvider, true);
    const response = await client.sendMessage('Hello', {provider: 'test'});
    
    expect(response.content).toContain('Mock response to: Hello');
    expect(response.provider).toBe('test');
  });

  test('falls back to chat when provider not found for sendMessage', async () => {
    setupAIClientTests();
    mockConfig.baseURL = 'https://api.openai.com/v1';
    const mockResponse = { choices: [{ message: { content: 'Fallback reply' } }] };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const client = new AIClient(mockConfig);
    const response = await client.sendMessage('Hello', { provider: 'nonexistent' });

    expect(response.content).toBe('Fallback reply');
    expect(response.provider).toBe('nonexistent');
  });

  test('should error when no baseURL configured for fallback sendMessage', async () => {
    const client = new AIClient();
    await expect(client.sendMessage('Hello', { provider: 'missing' }))
      .rejects.toThrow('No baseURL configured for AI client');
  });

  test('should throw error when provider not available for sendMessage', async () => {
    const client = new AIClient({ baseURL: 'https://api.openai.com/v1', model: 'test-model' });
    // Create a mock provider that extends AIProvider but is not available
    const mockProvider = new (class extends AIProvider { 
      isAvailable() { return false; } 
      async sendMessage() { return {}; }
      async generateResponse() { return {}; }
    })({});
    client.registerProvider('unavailable', mockProvider);
    
    await expect(client.sendMessage('Hello', {provider: 'unavailable'}))
      .rejects.toThrow("Provider 'unavailable' is not available");
  });

  test('should handle provider error in sendMessage', async () => {
    const client = new AIClient();
    const mockProvider = new (class extends AIProvider { 
      isAvailable() { return true; } 
      async sendMessage() { throw new Error('Provider error'); }
      async generateResponse() { return {}; }
    })({});
    client.registerProvider('error', mockProvider);
    
    await expect(client.sendMessage('Hello', {provider: 'error'}))
      .rejects.toThrow('AI request failed: Provider error');
  });

  test('should generate response through provider', async () => {
    const client = new AIClient();
    const mockProvider = new MockAIProvider({});
    
    client.registerProvider('gen', mockProvider, true);
    const messages = [{role: 'user', content: 'Hello'}];
    const response = await client.generateResponse(messages, {provider: 'gen'});
    
    expect(response.content).toContain('Mock response to: Hello');
    expect(response.provider).toBe('gen');
  });

  test('falls back to chat when provider not found for generateResponse', async () => {
    setupAIClientTests();
    mockConfig.baseURL = 'https://api.openai.com/v1';
    const mockResponse = { choices: [{ message: { content: 'Generated' } }] };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const client = new AIClient(mockConfig);
    const result = await client.generateResponse([{ role: 'user', content: 'Hi' }], { provider: 'missing' });

    expect(result.content).toBe('Generated');
    expect(result.provider).toBe('missing');
  });

  test('should error when no baseURL configured for fallback generateResponse', async () => {
    const client = new AIClient();
    await expect(client.generateResponse([{ role: 'user', content: 'Hi' }], { provider: 'missing' }))
      .rejects.toThrow('No baseURL configured for AI client');
  });

  test('should throw error when provider not available for generateResponse', async () => {
    const client = new AIClient({ baseURL: 'https://api.openai.com/v1', model: 'test-model' });
    const mockProvider = new (class extends AIProvider { 
      isAvailable() { return false; } 
      async sendMessage() { return {}; }
      async generateResponse() { return {}; }
    })({});
    client.registerProvider('unavailable', mockProvider);
    
    await expect(client.generateResponse([], {provider: 'unavailable'}))
      .rejects.toThrow("Provider 'unavailable' is not available");
  });

  test('should handle provider error in generateResponse', async () => {
    const client = new AIClient();
    const mockProvider = new (class extends AIProvider { 
      isAvailable() { return true; } 
      async sendMessage() { return {}; }
      async generateResponse() { throw new Error('Generation error'); }
    })({});
    client.registerProvider('error', mockProvider);
    
    await expect(client.generateResponse([], {provider: 'error'}))
      .rejects.toThrow('AI request failed: Generation error');
  });
});
