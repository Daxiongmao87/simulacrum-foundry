// Remove unused import - settings accessed via game.settings API

export class SimulacrumAIService {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
    this.conversationHistory = [];
    this.abortController = null;
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
   * @param {boolean} forceJsonMode - Whether to force JSON response format (optional)
   */
  async sendMessage(
    userMessage,
    onChunk,
    onComplete,
    abortSignal,
    forceJsonMode = false
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

      // Build messages array with system prompt and history
      const defaultPrompt = await this.getDefaultSystemPrompt();
      const userAdditions =
        typeof systemPrompt === 'string' && systemPrompt.length > 0
          ? `\n\nADDITIONAL INSTRUCTIONS:\n${systemPrompt}`
          : '';

      const messages = [
        {
          role: 'system',
          content: defaultPrompt + userAdditions,
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
          }
        : {
            model: modelName,
            messages: messages,
            temperature: 0.7,
            ...(forceJsonMode
              ? { response_format: { type: 'json_object' } }
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
          response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(isOllama ? {} : { Authorization: `Bearer ${apiKey || ''}` }),
            },
            body: JSON.stringify(requestBody),
            signal: abortSignal,
          });

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
   * Send a message with properly formatted conversation context
   * This method is used by the agentic loop and should NOT modify the main conversation history
   * @param {Object} context - AgenticContext instance with conversation history
   * @param {AbortSignal} abortSignal - Signal to cancel the request
   * @returns {Promise<string>} The AI's response
   */
  async sendWithContext(context, abortSignal) {
    // Get the last user message from context
    const contextMessages = context.toMessagesArray();
    const lastUserMessage = [...contextMessages]
      .reverse()
      .find((msg) => msg.role === 'user');
    if (!lastUserMessage) {
      throw new Error('No user message found in context');
    }

    // Just send the message normally - let sendMessage handle the conversation history
    return this.sendMessage(
      lastUserMessage.content,
      null,
      null,
      abortSignal,
      true
    );
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
    return historyWithoutCurrent.slice(-10);
  }

  /**
   * Default system prompt for Simulacrum - enforces JSON response format for agentic behavior
   */
  async getDefaultSystemPrompt() {
    // Load system prompt from localization array using FoundryVTT's pattern
    let promptTemplate;
    try {
      // Access the array by reconstructing it from individual indexed elements
      // First, try to get the first element to see if the array exists
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

        if (lines.length > 0) {
          promptTemplate = lines.join('\n');
        } else {
          throw new Error('System prompt array is empty');
        }
      } else {
        throw new Error('System prompt not found in localization');
      }
    } catch (error) {
      game.simulacrum?.logger?.error(
        'Failed to load system prompt from localization:',
        error
      );
      game.simulacrum?.logger?.warn('Using fallback system prompt');

      // Comprehensive fallback prompt with explicit JSON-only instructions
      promptTemplate = `You are Simulacrum, an AI campaign assistant for FoundryVTT designed to output JSON. 

CRITICAL: You MUST respond with raw JSON only. Never use markdown code blocks or any formatting.

Required JSON format:
{
    "message": "Your response to the user",
    "tool_calls": [
        {
            "tool_name": "exact_tool_name",
            "parameters": {"param1": "value1"},
            "reasoning": "Why you're using this specific tool"
        }
    ],
    "continuation": {
        "in_progress": true/false,
        "gerund": "Single descriptive word ending in -ing or null"
    }
}

MANDATORY RULES:
- Respond with raw JSON only - NO markdown, NO code blocks, NO formatting
- If you provide tool_calls, you MUST set in_progress: true
- Only set in_progress: false when NO tools are needed and task is complete
- tool_calls can be empty array [] if no tools needed
- reasoning is MANDATORY for each tool call
- gerund is MANDATORY if in_progress=true, null if in_progress=false

AVAILABLE TOOLS:
{TOOL_LIST}

CONTEXT:
Current world: {WORLD_TITLE}
System: {SYSTEM_TITLE} v{SYSTEM_VERSION}`;
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
