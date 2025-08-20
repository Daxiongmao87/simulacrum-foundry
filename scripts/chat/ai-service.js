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
      console.error(
        'Simulacrum | Failed to generate create_document tool schema:',
        error
      );
      // Optionally, add a fallback schema or handle the error gracefully
    }

    return schemas;
  }

  /**
   * Send message to AI service with streaming response
   */
  async sendMessage(userMessage, onChunk, onComplete, abortSignal) {
    if (abortSignal?.aborted) {
      return;
    }
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
      });

      // Prepare request
      const baseEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
      const isOllama =
        baseEndpoint.includes('localhost') ||
        baseEndpoint.includes('127.0.0.1') ||
        baseEndpoint.includes('ollama');
      const apiEndpoint = isOllama
        ? `${baseEndpoint}/api/chat`
        : `${baseEndpoint}/chat/completions`;
      const modelName = game.settings.get('simulacrum', 'modelName');
      const systemPrompt = game.settings.get('simulacrum', 'systemPrompt');
      const contextLength = game.settings.get('simulacrum', 'contextLength');
      const apiKey = game.settings.get('simulacrum', 'apiKey');

      // Build messages array with system prompt
      const messages = [
        {
          role: 'system',
          content:
            typeof systemPrompt === 'string' && systemPrompt.length > 0
              ? systemPrompt
              : await this.getDefaultSystemPrompt(),
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
          };

      // Make request
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isOllama ? {} : { Authorization: `Bearer ${apiKey || ''}` }),
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      // Response time tracking for potential future use
      // const responseTime = Date.now() - startTime;

      if (!response.ok) {
        let errorBody = 'No error details available';
        try {
          errorBody = await response.text();
          console.error('❌ Simulacrum | API Error Response Body:', errorBody);
        } catch (e) {
          console.error('❌ Simulacrum | Could not read error response:', e);
        }
        const error = new Error(
          `AI API error: ${response.status} ${response.statusText}`
        );
        console.error('❌ Simulacrum | API Request Failed:', {
          status: response.status,
          statusText: response.statusText,
          url: apiEndpoint,
          errorBody,
        });
        throw error;
      }

      if (isOllama) {
        await this.processStreamingResponse(
          response,
          onChunk,
          onComplete,
          abortSignal
        );
        return;
      }

      const data = await response.json();

      const aiResponse = data.choices?.[0]?.message?.content;

      if (!aiResponse) {
        console.warn('⚠️ Simulacrum | No AI response content found in:', data);
      }

      if (onComplete) {
        onComplete(aiResponse);
      }

      return aiResponse;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request cancelled by user
      } else {
        console.error('💥 Simulacrum | AI Service Error:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: error.cause,
        });
        throw error;
      }
    }
  }

  /**
   * Process streaming response from AI service
   */
  async processStreamingResponse(response, onChunk, onComplete, abortSignal) {
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
              console.warn('Failed to parse streaming chunk:', parseError);
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
            console.error('Function call execution error:', error);
            onChunk?.(
              `Error executing ${functionCall.name}: ${error.message}`,
              'error'
            );
          }
        }
      }

      // Add assistant message to history
      if (currentMessage.content || functionCalls.length > 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: currentMessage.content,
          tool_calls: functionCalls,
        });
      }

      onComplete?.(currentMessage, functionCalls);
    } catch (error) {
      console.error('Streaming response error:', error);
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
      console.error('💥 Simulacrum | Tool execution error:', {
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
   */
  getContextualHistory(_maxTokens) {
    // Simple implementation - take recent messages up to context limit
    // In production, would implement proper token counting and truncation
    const recentHistory = this.conversationHistory.slice(-10);

    // Ensure content is an empty string if tool_calls are present
    const formattedHistory = recentHistory.map((msg) => {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        return { ...msg, content: '' }; // Set content to empty string if tool_calls exist
      }
      return msg;
    });

    return formattedHistory;
  }

  /**
   * Default system prompt for Simulacrum - enforces JSON response format for agentic behavior
   */
  async getDefaultSystemPrompt() {
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

    return `You are Simulacrum, an AI campaign assistant for FoundryVTT. You MUST always respond in this exact JSON format:

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
        "gerund": "Single descriptive word ending in -ing"
    }
}

MANDATORY RULES:
- You MUST respond in valid JSON format only
- If you provide tool_calls, you MUST set in_progress: true (tools need to execute first)
- Only set in_progress: false when NO tools are needed and task is complete
- tool_calls can be empty array [] if no tools needed
- reasoning is MANDATORY for each tool call - explain why you chose this tool
- in_progress: true means you will continue working, false means task complete
- gerund is MANDATORY if in_progress=true, null if in_progress=false
- Use gerunds: Creating, Analyzing, Configuring, Updating, Searching, Processing, Validating, Optimizing, Placing, Generating, Calculating, Reviewing, Organizing, Monitoring, Executing, Investigating, Planning, Building, Testing, Implementing

AVAILABLE TOOLS:
${toolList || 'No tools currently available'}

EXAMPLES:

Good response (with tool):
{
    "message": "I'll create a new NPC actor for your tavern scene.",
    "tool_calls": [
        {
            "tool_name": "create_document",
            "parameters": {"documentType": "Actor", "data": {"name": "Innkeeper Bob", "type": "npc"}},
            "reasoning": "Creating an NPC actor to populate the tavern scene as requested"
        }
    ],
    "continuation": {
        "in_progress": true,
        "gerund": "Creating"
    }
}

Good response (no tools):
{
    "message": "The tavern scene looks great! Your NPC has been successfully added.",
    "tool_calls": [],
    "continuation": {
        "in_progress": false,
        "gerund": null
    }
}

ERROR RECOVERY: If you cannot provide valid JSON, respond with:
{
    "message": "I apologize, I encountered a formatting error. Could you please rephrase your request?",
    "tool_calls": [],
    "continuation": {
        "in_progress": false,
        "gerund": null
    }
}

CONTEXT:
Current world: ${game.world?.title || 'Unknown'}
System: ${game.system?.title || 'Unknown'} v${game.system?.version || '?'} 

Remember: You MUST respond in JSON format. No exceptions.`;
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
