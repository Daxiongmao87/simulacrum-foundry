/**
 * Tests for OpenAIProvider
 */
import { OpenAIProvider } from '../../../scripts/core/providers/openai-provider.js';

// Mock fetch
global.fetch = jest.fn();

describe('OpenAIProvider', () => {
    let provider;

    beforeEach(() => {
        jest.clearAllMocks();
        provider = new OpenAIProvider({
            apiKey: 'test-api-key',
            baseURL: 'https://api.openai.com/v1',
            model: 'gpt-4',
            maxTokens: 2000,
            temperature: 0.5
        });
    });

    describe('constructor', () => {
        it('should set config values', () => {
            expect(provider.baseURL).toBe('https://api.openai.com/v1');
            expect(provider.model).toBe('gpt-4');
        });

        it('should use default baseURL if not provided', () => {
            const defaultProvider = new OpenAIProvider({});
            expect(defaultProvider.baseURL).toBe('https://api.openai.com/v1');
        });

        it('should use default model if not provided', () => {
            const defaultProvider = new OpenAIProvider({});
            expect(defaultProvider.model).toBe('gpt-3.5-turbo');
        });
    });

    describe('sendMessage', () => {
        it('should call generateResponse with message and context', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Response' } }],
                    usage: { total_tokens: 10 },
                    model: 'gpt-4'
                })
            });

            const result = await provider.sendMessage('Hello', [
                { role: 'user', content: 'Previous message' }
            ]);

            expect(result.content).toBe('Response');
        });

        it('should handle empty context', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Reply' } }],
                    usage: {},
                    model: 'gpt-4'
                })
            });

            const result = await provider.sendMessage('Hello');
            expect(result.content).toBe('Reply');
        });
    });

    describe('generateResponse', () => {
        it('should send request with correct headers and body', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'AI response' } }],
                    usage: { prompt_tokens: 5, completion_tokens: 10 },
                    model: 'gpt-4'
                })
            });

            await provider.generateResponse([{ role: 'user', content: 'Test' }]);

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-api-key'
                    })
                })
            );
        });

        it('should return structured response with content and usage', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Hello there!' } }],
                    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
                    model: 'gpt-4'
                })
            });

            const result = await provider.generateResponse([]);

            expect(result.content).toBe('Hello there!');
            expect(result.usage).toEqual({ prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 });
            expect(result.model).toBe('gpt-4');
        });

        it('should handle empty content in response', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: {} }],
                    model: 'gpt-4'
                })
            });

            const result = await provider.generateResponse([]);
            expect(result.content).toBe('');
        });

        it('should throw APIError on non-ok response', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            });

            await expect(provider.generateResponse([])).rejects.toThrow('OpenAI API error');
        });

        it('should throw APIError on network failure', async () => {
            global.fetch.mockRejectedValue(new Error('Network failure'));

            await expect(provider.generateResponse([])).rejects.toThrow('Failed to communicate with OpenAI');
        });

        it('should not include Authorization header when no apiKey', async () => {
            const noKeyProvider = new OpenAIProvider({ model: 'gpt-4' });
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Test' } }],
                    model: 'gpt-4'
                })
            });

            await noKeyProvider.generateResponse([]);

            const callArgs = global.fetch.mock.calls[0][1];
            expect(callArgs.headers.Authorization).toBeUndefined();
        });
    });

    describe('isAvailable', () => {
        it('should always return true', () => {
            expect(provider.isAvailable()).toBe(true);
        });

        it('should return true even without API key', () => {
            const noKeyProvider = new OpenAIProvider({});
            expect(noKeyProvider.isAvailable()).toBe(true);
        });
    });
});
