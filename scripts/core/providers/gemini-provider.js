/* eslint-disable complexity, max-lines-per-function, no-unused-vars */
/**
 * Gemini AI Provider - Google's Gemini API implementation
 * Extracted from AIClient for consistency with OpenAI/Mock providers
 */

import { AIProvider } from './base-provider.js';
import { createLogger, isDebugEnabled } from '../../utils/logger.js';

export const GEMINI_ERROR_CODES = Object.freeze({
    TOOL_CALL_FAILURE: 'TOOL_CALL_FAILURE'
});

const GEMINI_FINISH_REASON_TO_ERROR_CODE = Object.freeze({
    MALFORMED_FUNCTION_CALL: GEMINI_ERROR_CODES.TOOL_CALL_FAILURE
});

function mapGeminiFinishReasonToErrorCode(reason) {
    if (!reason) return null;
    return GEMINI_FINISH_REASON_TO_ERROR_CODE[reason] || null;
}

/**
 * Gemini AI Provider
 * Implements the AIProvider interface for Google's Gemini API
 */
export class GeminiProvider extends AIProvider {
    /**
     * Create a Gemini provider instance
     * @param {Object} config - Provider configuration
     * @param {string} config.apiKey - Gemini API key
     * @param {string} config.baseURL - Gemini API base URL
     * @param {string} config.model - Model name (e.g., gemini-1.5-pro-latest)
     * @param {number} [config.maxTokens] - Maximum output tokens
     * @param {number} [config.temperature] - Temperature for generation
     */
    constructor(config = {}) {
        super(config);
        this.logger = createLogger('GeminiProvider');
    }

    /**
     * Get the Gemini API endpoint URL
     * @param {string} [action='generateContent'] - API action
     * @returns {string} Full endpoint URL
     * @private
     */
    _getEndpoint(action = 'generateContent') {
        const base = (this.config.baseURL || '').replace(/\/$/, '');
        const model = encodeURIComponent(this.config.model || 'gemini-1.5-pro-latest');
        const suffix = action.startsWith(':') ? action : `:${action}`;
        return `${base}/models/${model}${suffix}`;
    }

    /**
     * Map OpenAI-style role to Gemini role
     * @param {string} role - OpenAI role (user, assistant, system, tool)
     * @returns {string|null} Gemini role or null for system
     * @private
     */
    _mapRole(role) {
        switch (role) {
            case 'assistant':
            case 'model':
                return 'model';
            case 'tool':
                return 'user';
            case 'system':
                return null;
            default:
                return 'user';
        }
    }

    /**
     * Build Gemini contents array from OpenAI-style messages
     * @param {Array} messages - OpenAI-style message array
     * @returns {Array} Gemini contents array
     * @private
     */
    _buildContents(messages) {
        const contents = [];
        for (const message of messages || []) {
            if (!message) continue;
            const role = this._mapRole(message.role);
            if (!role) continue;

            let text = '';
            if (typeof message.content === 'string') {
                text = message.content;
            } else if (Array.isArray(message.content)) {
                text = message.content
                    .map(part => (typeof part === 'string' ? part : part?.text || ''))
                    .filter(Boolean)
                    .join('\n');
            } else if (message.content != null) {
                text = JSON.stringify(message.content);
            }

            if (!text && message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
                text = message.tool_calls
                    .map(call => {
                        const fn = call?.function || {};
                        return `Requested tool ${fn.name || 'unknown'} with args ${fn.arguments || '{}'}`;
                    })
                    .join('\n');
            }

            if (!text && message.role === 'tool') {
                const toolLabel = message.tool_call_id ? ` (${message.tool_call_id})` : '';
                text = `Tool response${toolLabel}: ${String(message.content ?? '')}`;
            }

            if (!text) continue;
            contents.push({ role, parts: [{ text }] });
        }
        return contents;
    }

    /**
     * Sanitize schema for Gemini's stricter requirements
     * @param {Object} schema - OpenAI-style JSON schema
     * @returns {Object} Gemini-compatible schema
     * @private
     */
    _sanitizeParameters(schema) {
        if (!schema || typeof schema !== 'object') {
            return { type: 'object' };
        }

        const base = { ...schema };
        base.type = base.type || 'object';

        const properties = base.properties && typeof base.properties === 'object'
            ? base.properties
            : {};

        const sanitizedProperties = {};
        const requiredSet = new Set(Array.isArray(base.required) ? base.required : []);

        for (const [key, value] of Object.entries(properties)) {
            if (!value || typeof value !== 'object') {
                sanitizedProperties[key] = value;
                continue;
            }

            const propertySchema = { ...value };
            if (propertySchema.required === true) {
                requiredSet.add(key);
            }
            delete propertySchema.required;

            if (propertySchema.type === 'object' || propertySchema.properties) {
                sanitizedProperties[key] = this._sanitizeParameters(propertySchema);
            } else {
                if (propertySchema.items && typeof propertySchema.items === 'object') {
                    const itemsSchema = propertySchema.items;
                    if (itemsSchema.type === 'object' || itemsSchema.properties) {
                        propertySchema.items = this._sanitizeParameters(itemsSchema);
                    } else {
                        propertySchema.items = { ...itemsSchema };
                    }
                }
                sanitizedProperties[key] = propertySchema;
            }
        }

        base.properties = sanitizedProperties;

        if (requiredSet.size > 0) {
            base.required = Array.from(requiredSet);
        } else {
            delete base.required;
        }

        return base;
    }

    /**
     * Map OpenAI-style tools to Gemini function declarations
     * @param {Array} tools - OpenAI-style tools array
     * @returns {Array} Gemini function declarations
     * @private
     */
    _mapTools(tools) {
        return (tools || [])
            .map(tool => tool?.function)
            .filter(Boolean)
            .map(fn => ({
                name: fn.name,
                description: fn.description || '',
                parameters: this._sanitizeParameters(fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : { type: 'object' })
            }))
            .filter(decl => decl.name);
    }

    /**
     * Send a chat request to Gemini API
     * @param {Array} messages - Array of message objects
     * @param {Object} [options={}] - Request options
     * @param {Array} [options.tools] - Tools for function calling
     * @param {string} [options.systemPrompt] - System prompt
     * @param {AbortSignal} [options.signal] - Abort signal
     * @returns {Promise<Object>} Gemini API response
     */
    async chat(messages, options = {}) {
        const { tools, systemPrompt, signal } = options;
        const contents = this._buildContents(messages);

        if (!contents.length) {
            contents.push({ role: 'user', parts: [{ text: '' }] });
        }

        const body = { contents };

        const generationConfig = {};
        if (typeof this.config.maxTokens === 'number') {
            generationConfig.maxOutputTokens = this.config.maxTokens;
        }
        if (typeof this.config.temperature === 'number') {
            generationConfig.temperature = this.config.temperature;
        }
        if (Object.keys(generationConfig).length) {
            body.generationConfig = generationConfig;
        }

        if (systemPrompt) {
            body.systemInstruction = {
                role: 'system',
                parts: [{ text: systemPrompt }]
            };
        }

        const functionDeclarations = this._mapTools(tools);
        if (functionDeclarations.length) {
            body.tools = [{ functionDeclarations }];
        }

        const headers = { 'Content-Type': 'application/json' };
        if (this.config.apiKey) {
            headers['x-goog-api-key'] = this.config.apiKey;
        }

        const response = await fetch(this._getEndpoint('generateContent'), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal
        });

        if (!response.ok) {
            let errorText;
            try {
                const errorData = await response.json();
                errorText = errorData.error?.message || JSON.stringify(errorData);
            } catch {
                try {
                    errorText = await response.text();
                } catch {
                    errorText = 'API error';
                }
            }
            throw new Error(`${response.status} - ${errorText}`);
        }

        const data = await response.json();
        if (!data.model && this.config.model) {
            data.model = this.config.model;
        }

        // Normalize Gemini finish reasons into provider-agnostic error codes
        if (data.candidates && Array.isArray(data.candidates)) {
            for (const candidate of data.candidates) {
                const errorCode = mapGeminiFinishReasonToErrorCode(candidate.finishReason);
                if (!errorCode) continue;

                const correlationId = `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                this.logger.warn('Gemini tool call failure detected', {
                    response: data,
                    modelVersion: data.model || this.config.model,
                    responseId: data.responseId || 'unknown',
                    candidateIndex: candidate.index ?? 0,
                    finishReason: candidate.finishReason,
                    errorCode,
                    correlationId
                });

                return {
                    ...data,
                    errorCode,
                    errorMetadata: {
                        provider: 'gemini',
                        finishReason: candidate.finishReason,
                        candidateIndex: candidate.index ?? 0,
                        correlationId
                    },
                    _originalResponse: data
                };
            }
        }

        return data;
    }

    /**
     * Generate a response (convenience method matching AIProvider interface)
     * @param {Array} messages - Messages array
     * @param {Object} [options={}] - Options
     * @returns {Promise<Object>} Response
     */
    async generateResponse(messages, options = {}) {
        return this.chat(messages, options);
    }

    /**
     * Send a simple message (convenience method)
     * @param {string} message - Message content
     * @param {Object} [context={}] - Additional context
     * @returns {Promise<Object>} Response
     */
    async sendMessage(message, context = {}) {
        const messages = [{ role: 'user', content: message }];
        return this.chat(messages, context);
    }

    /**
     * Check if provider is available
     * @returns {Promise<boolean>} Whether provider is available
     */
    async isAvailable() {
        return !!this.config.apiKey && !!this.config.baseURL;
    }
}
