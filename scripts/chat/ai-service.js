import { StructuredOutputDetector } from '../core/structured-output-detector.js';

export class SimulacrumAIService {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
    this.conversationHistory = [];
    this.abortController = null;
    this.structuredOutputDetector = new StructuredOutputDetector();
  }

  /**
   * Generate OpenAI-compatible function schemas from tool registry,
   * including dynamically discovered document types for create_document tool.
   */
  async generateToolSchemas() {
    const schemas = [];

    // Add schemas for all registered tools, excluding 'create_document' if it's already in the registry
    // The 'create_document' tool schema will be dynamically generated below.
    for (const [name, tool] of this.toolRegistry.tools.entries()) {
      if (name !== 'create_document') {
        schemas.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameterSchema,
        });
      }
    }

    // Dynamically add create_document tool schema based on available document types
    try {
      const creatableTypes =
        await game.simulacrum.documentDiscoveryEngine.getCreatableDocumentTypes();
      const enumValues = Object.keys(creatableTypes);

      if (enumValues.length > 0) {
        schemas.push({
          name: 'create_document',
          description: `Create a new FoundryVTT document. Available types in current system: ${enumValues.join(', ')}.`,
          parameters: {
            type: 'object',
            properties: {
              documentType: {
                type: 'string',
                enum: enumValues,
                description:
                  'The type of document to create. Use dynamic discovery to find available document types for the active game system.',
              },
              data: {
                type: 'object',
                description:
                  "Additional data to initialize the document with, as a JSON object. This MUST include the 'name' of the document and MAY include a 'type' for subtypes (e.g., 'npc' for an Actor).",
                properties: {
                  name: {
                    type: 'string',
                    description: 'The name of the new document.',
                  },
                  type: {
                    type: 'string',
                    description:
                      'Optional: The specific subtype of the document (system-dependent subtypes discovered dynamically). This is often required for certain documentTypes.',
                  },
                },
                required: ['name'],
              },
            },
            required: ['documentType', 'data'],
          },
        });
      }
    } catch (error) {
      game.simulacrum?.logger?.error(
        'Failed to generate create_document tool schema:',
        error
      );
      // Optionally, add a fallback schema or handle the error gracefully
    }

    return schemas;
  }

  /**
   * Send message to AI service with streaming response
   * @param {string} userMessage - The message to send
   * @param {Function} onChunk - Callback for streaming chunks (optional)
   * @param {Function} onComplete - Callback for completion (optional)
   * @param {AbortSignal} abortSignal - Signal to cancel the request (optional)
   * @param {boolean} useStructuredOutput - Whether to use structured output format (optional)
   */
  async sendMessage(
    userMessage,
    onChunk,
    onComplete,
    abortSignal,
    useStructuredOutput = false
  ) {
    if (abortSignal?.aborted) {
      return;
    }
    try {
      // Add user message to history FIRST
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
      });

      // Prepare request
      const baseEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
      const isOllama =
        baseEndpoint.includes('localhost') ||
        baseEndpoint.includes('127.0.0.1') ||
        baseEndpoint.includes('ollama') ||
        baseEndpoint.includes('11434');

      const apiEndpoint = isOllama
        ? `${baseEndpoint}/chat/completions`
        : `${baseEndpoint}/chat/completions`;
      const modelName = game.settings.get('simulacrum', 'modelName');
      const systemPrompt = game.settings.get('simulacrum', 'systemPrompt');
      const contextLength = game.settings.get('simulacrum', 'contextLength');
      const apiKey = game.settings.get('simulacrum', 'apiKey');

      // Get structured output configuration
      const structuredConfig = await this.getStructuredOutputConfig(
        baseEndpoint,
        modelName,
        isOllama
      );

      // Build messages array with system prompt and history
      const defaultPrompt = await this.getDefaultSystemPrompt();
      const userAdditions =
        typeof systemPrompt === 'string' && systemPrompt.length > 0
          ? `\n\nADDITIONAL INSTRUCTIONS:\n${systemPrompt}`
          : '';

      const systemContent =
        defaultPrompt + userAdditions + structuredConfig.systemPromptAddition;

      const messages = [
        {
          role: 'system',
          content: systemContent,
        },
        ...this.getContextualHistory(contextLength),
        {
          role: 'user',
          content: userMessage,
        },
      ];

      const schemas = await this.generateToolSchemas();

      const requestBody = isOllama
        ? {
            model: modelName,
            messages: messages,
            temperature: 0.7,
            stream: true,
            tools: schemas,
            ...(structuredConfig.useStructuredOutput
              ? structuredConfig.formatConfig
              : {}),
          }
        : {
            model: modelName,
            messages: messages,
            temperature: 0.7,
            ...(schemas.length > 0 ? { tools: schemas } : {}),
            ...(structuredConfig.useStructuredOutput
              ? { response_format: structuredConfig.formatConfig }
              : {}),
          };

      game.simulacrum?.logger?.debug(
        '🔍 Request body:',
        JSON.stringify(requestBody, null, 2)
      );

      // Make request with bounded quick retries (no backoff) to smooth transient CORS/network hiccups
      let response;
      let lastError;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (typeof DEBUG !== 'undefined' && DEBUG === true) {
            console.log(
              'Simulacrum | API Request:',
              JSON.stringify(requestBody, null, 2)
            );
          }

          response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(isOllama ? {} : { Authorization: `Bearer ${apiKey || ''}` }),
            },
            body: JSON.stringify(requestBody),
            signal: abortSignal,
          });

          if (typeof DEBUG !== 'undefined' && DEBUG === true) {
            const responseText = await response.clone().text();
            console.log('Simulacrum | API Response:', responseText);
          }

          // Retry only on transient statuses
          const retryable = [408, 429, 500, 502, 503, 504];
          if (
            !response.ok &&
            retryable.includes(response.status) &&
            attempt < maxAttempts
          ) {
            // Minimal delay to yield event loop; do not lengthen user wait significantly
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          break;
        } catch (err) {
          lastError = err;
          if (err?.name === 'AbortError') {
            throw err;
          }
          // TypeError: Failed to fetch (often CORS) → quick retry
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          throw err;
        }
      }

      // Response time tracking for potential future use
      // const responseTime = Date.now() - startTime;

      if (!response.ok) {
        let errorBody = 'No error details available';
        try {
          errorBody = await response.text();
          game.simulacrum?.logger?.error(
            '❌ API Error Response Body:',
            errorBody
          );
        } catch (e) {
          game.simulacrum?.logger?.error(
            '❌ Could not read error response:',
            e
          );
        }
        const error = new Error(
          `AI API error: ${response.status} ${response.statusText}`
        );
        game.simulacrum?.logger?.error('❌ API Request Failed:', {
          status: response.status,
          statusText: response.statusText,
          url: apiEndpoint,
          errorBody,
        });
        throw error;
      }

      let aiResponse = '';

      if (isOllama) {
        // For Ollama, handle streaming
        let streamedContent = '';

        await this.processStreamingResponse(
          response,
          onChunk,
          (content, functionCalls) => {
            streamedContent = content;
            if (onComplete) {
              onComplete(content, functionCalls);
            }
          },
          abortSignal,
          true // Don't add to history in processStreamingResponse
        );

        aiResponse = streamedContent;
      } else {
        // For non-Ollama APIs
        const data = await response.json();
        aiResponse = data.choices?.[0]?.message?.content || '';

        if (onComplete) {
          onComplete(aiResponse);
        }
      }

      // ALWAYS add assistant response to history after getting response
      this.conversationHistory.push({
        role: 'assistant',
        content: aiResponse,
      });

      return aiResponse;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request cancelled by user
      } else {
        // Check if this is a CORS error
        const isCorsError =
          error.message === 'Failed to fetch' ||
          error.message.includes('CORS') ||
          error.message.includes('cross-origin');

        if (!isCorsError) {
          // Only log non-CORS errors
          game.simulacrum?.logger?.error('💥 AI Service Error:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause,
          });
        }
        throw error;
      }
    }
  }

  /**
   * Send a message specifically for JSON responses (used by agentic loop)
   * @param {string} userMessage - The message to send
   * @param {AbortSignal} abortSignal - Signal to cancel the request
   * @returns {Promise<string>} The AI's JSON response as a string
   */
  async sendJsonMessage(userMessage, abortSignal) {
    return this.sendMessage(userMessage, null, null, abortSignal, true);
  }

  /**
   * Send a message with an error appended to the system prompt, without modifying conversation history
   * Used for JSON parsing error retries
   * @param {string} errorMessage - Error message to append to system prompt
   * @param {AbortSignal} abortSignal - Signal to cancel the request
   * @returns {Promise<string>} The AI's response
   */
  async sendWithSystemAddition(errorMessage, abortSignal) {
    if (abortSignal?.aborted) {
      return;
    }

    try {
      const baseEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
      const isOllama =
        baseEndpoint.includes('localhost') ||
        baseEndpoint.includes('127.0.0.1') ||
        baseEndpoint.includes('ollama') ||
        baseEndpoint.includes('11434');

      const apiEndpoint = isOllama
        ? `${baseEndpoint}/chat/completions`
        : `${baseEndpoint}/chat/completions`;
      const modelName = game.settings.get('simulacrum', 'modelName');
      const systemPrompt = game.settings.get('simulacrum', 'systemPrompt');
      const contextLength = game.settings.get('simulacrum', 'contextLength');
      const apiKey = game.settings.get('simulacrum', 'apiKey');

      // Get structured output configuration
      const structuredConfig = await this.getStructuredOutputConfig(
        baseEndpoint,
        modelName,
        isOllama
      );

      // Build system prompt with error message appended
      const defaultPrompt = await this.getDefaultSystemPrompt();
      const userAdditions =
        typeof systemPrompt === 'string' && systemPrompt.length > 0
          ? `\n\nADDITIONAL INSTRUCTIONS:\n${systemPrompt}`
          : '';

      const systemContent =
        defaultPrompt +
        userAdditions +
        structuredConfig.systemPromptAddition +
        `\n\nERROR TO FIX:\n${errorMessage}`;

      // Use existing conversation history for context without adding new messages
      const messages = [
        {
          role: 'system',
          content: systemContent,
        },
        ...this.getContextualHistory(contextLength),
      ];

      const schemas = await this.generateToolSchemas();

      const requestBody = isOllama
        ? {
            model: modelName,
            messages: messages,
            temperature: 0.7,
            stream: true,
          }
        : {
            model: modelName,
            messages: messages,
            temperature: 0.7,
            stream: true,
            ...(structuredConfig.useNativeStructuredOutput
              ? { response_format: structuredConfig.responseFormat }
              : {}),
            ...(schemas.length > 0 ? { tools: schemas } : {}),
          };

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await this.processStreamingResponse(response, false, abortSignal);
    } catch (error) {
      game.simulacrum?.logger?.error(
        'Failed to send with system addition:',
        error
      );
      throw error;
    }
  }

  /**
   * Send a message with properly formatted conversation context
   * This method is used by the agentic loop and should NOT modify the main conversation history
   * @param {Object} context - AgenticContext instance with conversation history
   * @param {AbortSignal} abortSignal - Signal to cancel the request
   * @returns {Promise<string>} The AI's response
   */
  async sendWithContext(context, abortSignal) {
    if (abortSignal?.aborted) {
      return;
    }

    try {
      // Get the context messages - do NOT extract just the last user message
      const contextMessages = context.toMessagesArray();

      // Prepare request - similar to sendMessage but without modifying conversationHistory
      const baseEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
      const isOllama =
        baseEndpoint.includes('localhost') ||
        baseEndpoint.includes('127.0.0.1') ||
        baseEndpoint.includes('ollama') ||
        baseEndpoint.includes('11434');

      const apiEndpoint = isOllama
        ? `${baseEndpoint}/chat/completions`
        : `${baseEndpoint}/chat/completions`;
      const modelName = game.settings.get('simulacrum', 'modelName');
      const systemPrompt = game.settings.get('simulacrum', 'systemPrompt');
      const apiKey = game.settings.get('simulacrum', 'apiKey');

      // Get structured output configuration
      const structuredConfig = await this.getStructuredOutputConfig(
        baseEndpoint,
        modelName,
        isOllama
      );

      // Build messages array with system prompt and agentic context
      const defaultPrompt = await this.getDefaultSystemPrompt();
      const userAdditions =
        typeof systemPrompt === 'string' && systemPrompt.length > 0
          ? `\n\nADDITIONAL INSTRUCTIONS:\n${systemPrompt}`
          : '';

      const systemContent =
        defaultPrompt + userAdditions + structuredConfig.systemPromptAddition;

      const messages = [
        {
          role: 'system',
          content: systemContent,
        },
        ...contextMessages, // Use the full agentic context, not just the last message
      ];

      const schemas = await this.generateToolSchemas();

      const requestBody = isOllama
        ? {
            model: modelName,
            messages: messages,
            temperature: 0.7,
            stream: true,
            tools: schemas,
            ...(structuredConfig.useStructuredOutput
              ? structuredConfig.formatConfig
              : {}),
          }
        : {
            model: modelName,
            messages: messages,
            temperature: 0.7,
            ...(schemas.length > 0 ? { tools: schemas } : {}),
            ...(structuredConfig.useStructuredOutput
              ? { response_format: structuredConfig.formatConfig }
              : {}),
          };

      game.simulacrum?.logger?.debug(
        '🔍 Agentic sendWithContext request body:',
        JSON.stringify(requestBody, null, 2)
      );

      // Make request with bounded quick retries (no backoff) to smooth transient CORS/network hiccups
      let response;
      let lastError;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (typeof DEBUG !== 'undefined' && DEBUG === true) {
            console.log(
              'Simulacrum | API Request:',
              JSON.stringify(requestBody, null, 2)
            );
          }

          response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(isOllama ? {} : { Authorization: `Bearer ${apiKey || ''}` }),
            },
            body: JSON.stringify(requestBody),
            signal: abortSignal,
          });

          if (typeof DEBUG !== 'undefined' && DEBUG === true) {
            const responseText = await response.clone().text();
            console.log('Simulacrum | API Response:', responseText);
          }

          // Retry only on transient statuses
          const retryable = [408, 429, 500, 502, 503, 504];
          if (
            !response.ok &&
            retryable.includes(response.status) &&
            attempt < maxAttempts
          ) {
            // Minimal delay to yield event loop; do not lengthen user wait significantly
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          break;
        } catch (err) {
          lastError = err;
          if (err?.name === 'AbortError') {
            throw err;
          }
          // TypeError: Failed to fetch (often CORS) → quick retry
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          throw err;
        }
      }

      if (!response.ok) {
        let errorBody = 'No error details available';
        try {
          errorBody = await response.text();
          game.simulacrum?.logger?.error(
            '❌ Agentic API Error Response Body:',
            errorBody
          );
        } catch (e) {
          game.simulacrum?.logger?.error(
            '❌ Could not read agentic error response:',
            e
          );
        }
        const error = new Error(
          `AI API error in agentic loop: ${response.status} ${response.statusText}`
        );
        game.simulacrum?.logger?.error('❌ Agentic API Request Failed:', {
          status: response.status,
          statusText: response.statusText,
          url: apiEndpoint,
          errorBody,
        });
        throw error;
      }

      let aiResponse = '';

      if (isOllama) {
        // For Ollama, handle streaming - but don't add to conversationHistory
        let streamedContent = '';

        await this.processStreamingResponse(
          response,
          null, // No onChunk callback needed for agentic context
          (content, functionCalls) => {
            streamedContent = content;
          },
          abortSignal,
          true // Skip history update - this is critical!
        );

        aiResponse = streamedContent;
      } else {
        // For non-Ollama APIs
        const data = await response.json();
        aiResponse = data.choices?.[0]?.message?.content || '';
      }

      // CRITICAL: Do NOT add to conversationHistory - this is the key fix!
      // The agentic loop manages its own context via AgenticContext
      // The main conversationHistory should only be updated when the entire workflow completes

      return aiResponse;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request cancelled by user
      } else {
        // Check if this is a CORS error
        const isCorsError =
          error.message === 'Failed to fetch' ||
          error.message.includes('CORS') ||
          error.message.includes('cross-origin');

        if (!isCorsError) {
          // Only log non-CORS errors
          game.simulacrum?.logger?.error('💥 Agentic AI Service Error:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause,
          });
        }
        throw error;
      }
    }
  }

  /**
   * Process streaming response from AI service
   * @param {Response} response - The fetch response object
   * @param {Function} onChunk - Callback for streaming chunks
   * @param {Function} onComplete - Callback for completion
   * @param {AbortSignal} abortSignal - Signal to cancel the request
   * @param {boolean} skipHistoryUpdate - If true, don't add to conversation history (caller will handle it)
   */
  async processStreamingResponse(
    response,
    onChunk,
    onComplete,
    abortSignal,
    skipHistoryUpdate = false
  ) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    const currentMessage = { role: 'assistant', content: '' };
    const functionCalls = [];

    try {
      while (true) {
        if (abortSignal?.aborted) {
          throw new Error('Request aborted');
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }

            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta;

              if (delta?.content) {
                currentMessage.content += delta.content;
                onChunk?.(delta.content, 'text');
              }

              if (delta?.function_call) {
                // If a function call is present, ensure content is empty as per OpenAI API spec
                currentMessage.content = '';
                // Handle function call streaming
                const functionCall = delta.function_call;
                if (functionCall.name) {
                  functionCalls.push({
                    tool_name: functionCall.name,
                    parameters: functionCall.arguments || '',
                  });
                } else if (functionCall.arguments) {
                  // Append to last function call arguments
                  const lastCall = functionCalls[functionCalls.length - 1];
                  if (lastCall) {
                    lastCall.parameters += functionCall.arguments;
                  }
                }
              }
            } catch (parseError) {
              game.simulacrum?.logger?.warn(
                'Failed to parse streaming chunk:',
                parseError
              );
            }
          }
        }
      }

      // Process any function calls
      if (functionCalls.length > 0) {
        for (const functionCall of functionCalls) {
          try {
            const args = JSON.parse(functionCall.arguments);
            const result = await this.executeToolCall(
              functionCall.name,
              args,
              abortSignal
            );
            onChunk?.(result, 'tool_result');
          } catch (error) {
            game.simulacrum?.logger?.error(
              'Function call execution error:',
              error
            );
            onChunk?.(
              `Error executing ${functionCall.name}: ${error.message}`,
              'error'
            );
          }
        }
      }

      // Note: History is now handled by the caller, not here

      // For JSON mode, we need to pass the content and function calls separately
      game.simulacrum?.logger?.debug(
        '🔍 Final streaming content:',
        currentMessage.content
      );
      game.simulacrum?.logger?.debug('🔍 Final function calls:', functionCalls);
      if (onComplete) {
        if (typeof onComplete === 'function') {
          onComplete(currentMessage.content, functionCalls);
        }
      }
    } catch (error) {
      game.simulacrum?.logger?.error('Streaming response error:', error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Execute a tool call from AI
   */
  async executeToolCall(toolName, parameters, _abortSignal) {
    try {
      const tool = this.toolRegistry.getTool(toolName);

      // Check if confirmation is needed (unless Gremlin mode)
      const gremlinMode = game.settings.get('simulacrum', 'gremlinMode');

      if (!gremlinMode && tool.shouldConfirmExecute()) {
        const confirmed = await this.toolRegistry.confirmExecution(
          game.user,
          toolName,
          parameters
        );

        if (!confirmed) {
          return { success: false, error: 'Tool execution cancelled by user' };
        }
      }

      // Execute the tool
      const result = await tool.execute(parameters);

      return result;
    } catch (error) {
      game.simulacrum?.logger?.error('💥 Tool execution error:', {
        toolName,
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        parameters,
      });

      return {
        success: false,
        error: {
          message: `Tool execution failed: ${error.message}`,
          code: 'TOOL_EXECUTION_ERROR',
        },
      };
    }
  }

  /**
   * Get contextual conversation history within token limits
   * Excludes the current message that was just added to conversationHistory
   */
  getContextualHistory(_maxTokens) {
    // Exclude the last message (current user message that was just added)
    const historyWithoutCurrent = this.conversationHistory.slice(0, -1);
    // Return full history - let context compaction handle truncation if needed
    return historyWithoutCurrent;
  }

  /**
   * Default system prompt for Simulacrum - natural language communication with tool calls
   */
  async getDefaultSystemPrompt() {
    // Load system prompt from localization array using FoundryVTT's pattern
    let promptTemplate;
    // Load system prompt from localization
    if (!game?.i18n?.localize) {
      game.simulacrum?.logger?.error('Localization system not available');
      throw new Error(
        'Localization system not available - check FoundryVTT initialization'
      );
    }

    const firstLine = game.i18n.localize('SIMULACRUM.SYSTEM_PROMPT_LINES.0');

    if (firstLine !== 'SIMULACRUM.SYSTEM_PROMPT_LINES.0') {
      // Array exists, reconstruct it by accessing indexed elements
      const lines = [];
      let index = 0;
      let currentLine;

      // Keep reading array elements until we can't find more
      while (true) {
        currentLine = game.i18n.localize(
          `SIMULACRUM.SYSTEM_PROMPT_LINES.${index}`
        );
        if (currentLine === `SIMULACRUM.SYSTEM_PROMPT_LINES.${index}`) {
          // This index doesn't exist, we've reached the end
          break;
        }
        lines.push(currentLine);
        index++;
      }

      promptTemplate = lines.join('\n');
    } else {
      game.simulacrum?.logger?.error('System prompt not found in localization');
      throw new Error(
        'System prompt not found in localization - check lang/en.json'
      );
    }

    // Generate dynamic tool list
    const toolSchemas = await this.generateToolSchemas();
    const toolList = toolSchemas
      .map((schema) => {
        let params = '';
        if (schema.parameters && schema.parameters.properties) {
          params = Object.keys(schema.parameters.properties)
            .map((key) => {
              const prop = schema.parameters.properties[key];
              return `${key}: ${prop.type}${prop.enum ? ` (${prop.enum.join(', ')})` : ''}`;
            })
            .join(', ');
        }
        return `- ${schema.name}(${params}): ${schema.description}`;
      })
      .join('\n');

    // Replace template placeholders
    return promptTemplate
      .replace('{TOOL_LIST}', toolList || 'No tools currently available')
      .replace('{WORLD_TITLE}', game.world?.title || 'Unknown')
      .replace('{SYSTEM_TITLE}', game.system?.title || 'Unknown')
      .replace('{SYSTEM_VERSION}', game.system?.version || '?');
  }

  /**
   * Get structured output configuration for API request
   * @param {string} endpoint - API endpoint
   * @param {string} modelName - Model name
   * @param {boolean} isOllama - Whether this is an Ollama endpoint
   * @returns {Promise<Object>} Configuration object with format settings
   */
  async getStructuredOutputConfig(endpoint, modelName, isOllama) {
    const detection =
      await this.structuredOutputDetector.detectStructuredOutputSupport(
        endpoint,
        modelName
      );

    if (detection.supportsStructuredOutput) {
      game.simulacrum?.logger?.debug(
        'Using structured output for',
        detection.provider
      );

      if (isOllama) {
        return {
          useStructuredOutput: true,
          formatConfig: detection.formatConfig,
          systemPromptAddition: '',
        };
      } else {
        return {
          useStructuredOutput: true,
          formatConfig: detection.formatConfig,
          systemPromptAddition: '',
        };
      }
    } else {
      game.simulacrum?.logger?.debug(
        'Falling back to prompt-based JSON formatting'
      );
      return {
        useStructuredOutput: false,
        formatConfig: null,
        systemPromptAddition: detection.fallbackInstructions,
      };
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history for display
   */
  getHistory() {
    return [...this.conversationHistory];
  }
}
