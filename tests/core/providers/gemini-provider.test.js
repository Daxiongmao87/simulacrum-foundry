/**
 * Tests for GeminiProvider
 */
import { GeminiProvider, GEMINI_ERROR_CODES } from '../../../scripts/core/providers/gemini-provider.js';

// Mock logger
jest.mock('../../../scripts/utils/logger.js', () => ({
    createLogger: () => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }),
    isDebugEnabled: () => false
}));

describe('GeminiProvider', () => {
    let provider;

    beforeEach(() => {
        provider = new GeminiProvider({
            apiKey: 'test-api-key',
            baseURL: 'https://api.example.com',
            model: 'gemini-1.5-pro',
            maxTokens: 1000,
            temperature: 0.7
        });
    });

    describe('constructor', () => {
        it('should create provider with config', () => {
            expect(provider.config.apiKey).toBe('test-api-key');
            expect(provider.config.baseURL).toBe('https://api.example.com');
        });
    });

    describe('_getEndpoint', () => {
        it('should build endpoint URL with default action', () => {
            const endpoint = provider._getEndpoint();
            expect(endpoint).toContain('models/gemini-1.5-pro');
            expect(endpoint).toContain(':generateContent');
        });

        it('should build endpoint URL with custom action', () => {
            const endpoint = provider._getEndpoint('countTokens');
            expect(endpoint).toContain(':countTokens');
        });

        it('should handle action with colon prefix', () => {
            const endpoint = provider._getEndpoint(':streamGenerateContent');
            expect(endpoint).toContain(':streamGenerateContent');
        });

        it('should strip trailing slash from baseURL', () => {
            provider.config.baseURL = 'https://api.example.com/';
            const endpoint = provider._getEndpoint();
            expect(endpoint).not.toContain('//models');
        });
    });

    describe('_mapRole', () => {
        it('should map assistant to model', () => {
            expect(provider._mapRole('assistant')).toBe('model');
        });

        it('should map model to model', () => {
            expect(provider._mapRole('model')).toBe('model');
        });

        it('should map tool to user', () => {
            expect(provider._mapRole('tool')).toBe('user');
        });

        it('should return null for system', () => {
            expect(provider._mapRole('system')).toBeNull();
        });

        it('should map unknown roles to user', () => {
            expect(provider._mapRole('unknown')).toBe('user');
            expect(provider._mapRole('user')).toBe('user');
        });
    });

    describe('_buildContents', () => {
        it('should build contents from string messages', () => {
            const messages = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' }
            ];
            const contents = provider._buildContents(messages);

            expect(contents).toHaveLength(2);
            expect(contents[0].role).toBe('user');
            expect(contents[0].parts[0].text).toBe('Hello');
        });

        it('should build contents from array content', () => {
            const messages = [
                { role: 'user', content: [{ text: 'Part 1' }, { text: 'Part 2' }] }
            ];
            const contents = provider._buildContents(messages);

            expect(contents[0].parts[0].text).toContain('Part 1');
            expect(contents[0].parts[0].text).toContain('Part 2');
        });

        it('should handle tool calls in assistant message', () => {
            const messages = [
                {
                    role: 'assistant',
                    content: '',
                    tool_calls: [{ function: { name: 'testTool', arguments: '{}' } }]
                }
            ];
            const contents = provider._buildContents(messages);

            expect(contents[0].parts[0].text).toContain('testTool');
        });

        it('should handle tool response messages', () => {
            const messages = [
                { role: 'tool', content: 'Tool result', tool_call_id: 'call_123' }
            ];
            const contents = provider._buildContents(messages);

            expect(contents[0].parts[0].text).toContain('Tool');
            expect(contents[0].parts[0].text).toContain('result');
        });

        it('should skip system messages', () => {
            const messages = [
                { role: 'system', content: 'System prompt' },
                { role: 'user', content: 'Hello' }
            ];
            const contents = provider._buildContents(messages);

            expect(contents).toHaveLength(1);
            expect(contents[0].role).toBe('user');
        });

        it('should skip null messages', () => {
            const messages = [null, { role: 'user', content: 'Hello' }];
            const contents = provider._buildContents(messages);

            expect(contents).toHaveLength(1);
        });

        it('should handle object content by stringifying', () => {
            const messages = [
                { role: 'user', content: { key: 'value' } }
            ];
            const contents = provider._buildContents(messages);

            expect(contents[0].parts[0].text).toContain('key');
        });
    });

    describe('_sanitizeParameters', () => {
        it('should add default type if missing', () => {
            const result = provider._sanitizeParameters({});
            expect(result.type).toBe('object');
        });

        it('should handle null schema', () => {
            const result = provider._sanitizeParameters(null);
            expect(result.type).toBe('object');
        });

        it('should promote property-level required to top-level', () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { type: 'string', required: true }
                }
            };
            const result = provider._sanitizeParameters(schema);

            expect(result.required).toContain('name');
            expect(result.properties.name.required).toBeUndefined();
        });

        it('should recursively sanitize nested object schemas', () => {
            const schema = {
                type: 'object',
                properties: {
                    nested: {
                        type: 'object',
                        properties: {
                            field: { type: 'string' }
                        }
                    }
                }
            };
            const result = provider._sanitizeParameters(schema);

            expect(result.properties.nested.type).toBe('object');
        });

        it('should sanitize array item schemas', () => {
            const schema = {
                type: 'object',
                properties: {
                    list: {
                        type: 'array',
                        items: { type: 'object', properties: { id: { type: 'string' } } }
                    }
                }
            };
            const result = provider._sanitizeParameters(schema);

            expect(result.properties.list.items.type).toBe('object');
        });
    });

    describe('_mapTools', () => {
        it('should map OpenAI tools to Gemini format', () => {
            const tools = [
                { type: 'function', function: { name: 'testTool', description: 'A test', parameters: { type: 'object' } } }
            ];
            const result = provider._mapTools(tools);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('testTool');
            expect(result[0].description).toBe('A test');
        });

        it('should filter out tools without names', () => {
            const tools = [
                { type: 'function', function: { description: 'No name' } },
                { type: 'function', function: { name: 'valid' } }
            ];
            const result = provider._mapTools(tools);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('valid');
        });

        it('should handle null tools', () => {
            const result = provider._mapTools(null);
            expect(result).toEqual([]);
        });
    });

    describe('isAvailable', () => {
        it('should return true when apiKey and baseURL are set', async () => {
            const result = await provider.isAvailable();
            expect(result).toBe(true);
        });

        it('should return false when apiKey is missing', async () => {
            provider.config.apiKey = '';
            const result = await provider.isAvailable();
            expect(result).toBe(false);
        });

        it('should return false when baseURL is missing', async () => {
            provider.config.baseURL = '';
            const result = await provider.isAvailable();
            expect(result).toBe(false);
        });
    });

    describe('GEMINI_ERROR_CODES', () => {
        it('should export TOOL_CALL_FAILURE error code', () => {
            expect(GEMINI_ERROR_CODES.TOOL_CALL_FAILURE).toBe('TOOL_CALL_FAILURE');
        });
    });
});
