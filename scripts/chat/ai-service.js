import { SimulacrumSettings } from '../settings.js';

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
          parameters: tool.parameterSchema
        });
      }
    }

    // Dynamically add create_document tool schema based on available document types
    try {
      const creatableTypes = await game.simulacrum.documentDiscoveryEngine.getCreatableDocumentTypes();
      const enumValues = Object.keys(creatableTypes);

      if (enumValues.length > 0) {
        schemas.push({
          name: "create_document",
          description: "Create a new FoundryVTT document (e.g., Actor, Item, Scene, JournalEntry).",
          parameters: {
            type: "object",
            properties: {
              documentType: {
                type: "string",
                enum: enumValues,
                description: "The type of document to create (e.g., 'Actor', 'Item', 'Scene', 'JournalEntry', or a specific subtype like 'character', 'weapon')."
              },
              data: {
                type: "object",
                description: "Additional data to initialize the document with, as a JSON object. This MUST include the 'name' of the document and MAY include a 'type' for subtypes (e.g., 'npc' for an Actor).",
                properties: {
                  name: {
                    type: "string",
                    description: "The name of the new document."
                  },
                  type: {
                    type: "string",
                    description: "Optional: The specific subtype of the document (e.g., 'npc' for an Actor, 'weapon' for an Item). This is often required for certain documentTypes."
                  }
                },
                required: ["name"]
              }
            },
            required: ["documentType", "data"]
          }
        });
      }
    } catch (error) {
      console.error("Simulacrum | Failed to generate create_document tool schema:", error);
      // Optionally, add a fallback schema or handle the error gracefully
    }

    return schemas;
  }

  /**
   * Send message to AI service with streaming response
   */
  async sendMessage(userMessage, onChunk, onComplete, abortSignal) {
    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage
      });
      
      console.log('📜 Simulacrum | Conversation history updated:', {
        totalMessages: this.conversationHistory.length,
        lastMessage: {
          role: 'user',
          contentLength: userMessage.length,
          contentPreview: (userMessage ?? '').substring(0, 100) + ((userMessage ?? '').length > 100 ? '...' : '')
        }
      });

      // Prepare request
      const baseEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
      const apiEndpoint = `${baseEndpoint}/chat/completions`;
      const modelName = game.settings.get('simulacrum', 'modelName');
      const systemPrompt = game.settings.get('simulacrum', 'systemPrompt');
      const contextLength = game.settings.get('simulacrum', 'contextLength');
      const apiKey = game.settings.get('simulacrum', 'apiKey');

      console.log('🔍 Simulacrum | AI Service Debug - Request Setup:', {
        apiEndpoint,
        modelName,
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
        contextLength,
        systemPromptLength: (systemPrompt || this.getDefaultSystemPrompt()).length,
        historyMessages: this.conversationHistory.length
      });

      // Build messages array with system prompt
      const messages = [
        {
          role: 'system',
          content: (typeof systemPrompt === 'string' && systemPrompt.length > 0) ? systemPrompt : await this.getDefaultSystemPrompt()
        },
        ...this.getContextualHistory(contextLength),
        {
          role: 'user',
          content: userMessage
        }
      ];

      const requestBody = {
        model: modelName,
        messages: messages,
        temperature: 0.7
      };

      // DEBUG: Log complete request payload
      console.log('📤 Simulacrum | Outgoing Request Payload:', {
        url: apiEndpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey ? '[REDACTED]' : '[MISSING]'}`,
          'User-Agent': navigator.userAgent
        },
        body: {
          ...requestBody,
          messages: requestBody.messages.map((msg, idx) => ({
            index: idx,
            role: msg.role,
            contentLength: String(msg.content ?? '').length || 0,
            contentPreview: String(msg.content ?? '').substring(0, 100) + (String(msg.content ?? '').length > 100 ? '...' : ''),
            hasToolCalls: !!msg.function_calls
          }))
        }
      });

      // DEBUG: Log raw request body (first 2000 chars)
      const requestBodyStr = JSON.stringify(requestBody, null, 2);
      console.log('📝 Simulacrum | Raw Request Body (first 2000 chars):', requestBodyStr.substring(0, 2000) + (requestBodyStr.length > 2000 ? '...[TRUNCATED]' : ''));

      // Make streaming request
      console.log('⏳ Simulacrum | Sending request to API...');
      const startTime = Date.now();
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey || ''}`
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal
      });

      const responseTime = Date.now() - startTime;
      console.log('📡 Simulacrum | Response received:', {
        status: response.status,
        statusText: response.statusText,
        responseTime: `${responseTime}ms`,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok
      });

      if (!response.ok) {
        // Try to get error response body for debugging
        let errorBody = 'No error details available';
        try {
          errorBody = await response.text();
          console.error('❌ Simulacrum | API Error Response Body:', errorBody);
        } catch (e) {
          console.error('❌ Simulacrum | Could not read error response:', e);
        }
        
        const error = new Error(`AI API error: ${response.status} ${response.statusText}`);
        console.error('❌ Simulacrum | API Request Failed:', {
          status: response.status,
          statusText: response.statusText,
          url: apiEndpoint,
          errorBody
        });
        throw error;
      }

      // Get JSON response
      const data = await response.json();
      
      // DEBUG: Log complete response payload
      console.log('📥 Simulacrum | Response Payload:', {
        id: data.id,
        object: data.object,
        created: data.created,
        model: data.model,
        choices: data.choices?.map((choice, idx) => ({
          index: idx,
          finishReason: choice.finish_reason,
          messageRole: choice.message?.role,
          messageContentLength: choice.message?.content?.length || 0,
          messageContentPreview: choice.message?.content?.substring(0, 200) + (choice.message?.content?.length > 200 ? '...' : ''),
          hasFunctionCall: !!choice.message?.function_call,
          hasToolCalls: !!choice.message?.tool_calls
        })),
        usage: data.usage,
        systemFingerprint: data.system_fingerprint
      });
      
      // DEBUG: Log raw response (first 3000 chars)
      const responseStr = JSON.stringify(data, null, 2);
      console.log('📄 Simulacrum | Raw Response (first 3000 chars):', responseStr.substring(0, 3000) + (responseStr.length > 3000 ? '...[TRUNCATED]' : ''));
      
      const aiResponse = data.choices?.[0]?.message?.content;
      
      if (!aiResponse) {
        console.warn('⚠️ Simulacrum | No AI response content found in:', data);
      }
      
      console.log('✅ Simulacrum | AI Response extracted:', {
        responseLength: aiResponse?.length || 0,
        responsePreview: aiResponse?.substring(0, 100) + (aiResponse?.length > 100 ? '...' : '')
      });
      
      if (onComplete) {
        onComplete(aiResponse);
      }
      
      return aiResponse;

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('🚫 Simulacrum | AI request cancelled by user');
      } else {
        console.error('💥 Simulacrum | AI Service Error:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: error.cause
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
    let currentMessage = { role: 'assistant', content: '' };
    let functionCalls = [];

    try {
      while (true) {
        if (abortSignal?.aborted) {
          throw new Error('Request aborted');
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

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
                    parameters: functionCall.arguments || ''
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
            const result = await this.executeToolCall(functionCall.name, args);
            onChunk?.(result, 'tool_result');
          } catch (error) {
            console.error('Function call execution error:', error);
            onChunk?.(`Error executing ${functionCall.name}: ${error.message}`, 'error');
          }
        }
      }

      // Add assistant message to history
      if (currentMessage.content || functionCalls.length > 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: currentMessage.content,
          tool_calls: functionCalls
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
  async executeToolCall(toolName, parameters) {
    console.log('🔧 Simulacrum | Tool Call Debug - Starting execution:', {
      toolName,
      parameters,
      parametersType: typeof parameters,
      parametersKeys: Object.keys(parameters || {}),
      toolRegistrySize: this.toolRegistry?.tools?.size || 0
    });
    
    try {
      const tool = this.toolRegistry.getTool(toolName);
      
      console.log('🛠️ Simulacrum | Tool retrieved:', {
        toolName,
        toolFound: !!tool,
        toolType: typeof tool,
        toolMethods: tool ? Object.getOwnPropertyNames(Object.getPrototypeOf(tool)) : []
      });
      
      // Check if confirmation is needed (unless YOLO mode)
      const yoloMode = game.settings.get('simulacrum', 'yoloMode');
      console.log('🎯 Simulacrum | Tool confirmation check:', {
        yoloMode,
        needsConfirmation: tool.shouldConfirmExecute ? tool.shouldConfirmExecute() : 'method not available'
      });
      
      if (!yoloMode && tool.shouldConfirmExecute()) {
        console.log('⏳ Simulacrum | Requesting user confirmation for tool execution...');
        const confirmed = await this.toolRegistry.confirmExecution(
          game.user, 
          toolName, 
          parameters
        );
        
        console.log('✅/❌ Simulacrum | User confirmation result:', confirmed);
        
        if (!confirmed) {
          console.log('🚫 Simulacrum | Tool execution cancelled by user');
          return { success: false, error: 'Tool execution cancelled by user' };
        }
      }

      // Execute the tool
      console.log('⚡ Simulacrum | Executing tool:', toolName);
      const startTime = Date.now();
      
      const result = await tool.execute(parameters);
      
      const executionTime = Date.now() - startTime;
      console.log('✅ Simulacrum | Tool execution completed:', {
        toolName,
        executionTime: `${executionTime}ms`,
        resultType: typeof result,
        resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
        success: result?.success,
        hasError: !!result?.error
      });
      
      // DEBUG: Log result preview
      const resultStr = JSON.stringify(result, null, 2);
      console.log('📋 Simulacrum | Tool Result (first 1000 chars):', resultStr.substring(0, 1000) + (resultStr.length > 1000 ? '...[TRUNCATED]' : ''));
      
      return result;

    } catch (error) {
      console.error('💥 Simulacrum | Tool execution error:', {
        toolName,
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        parameters
      });
      
      return {
        success: false,
        error: {
          message: `Tool execution failed: ${error.message}`,
          code: 'TOOL_EXECUTION_ERROR'
        }
      };
    }
  }

  /**
   * Get contextual conversation history within token limits
   */
  getContextualHistory(maxTokens) {
    // Simple implementation - take recent messages up to context limit
    // In production, would implement proper token counting and truncation
    const recentHistory = this.conversationHistory.slice(-10);

    // Ensure content is an empty string if tool_calls are present
    const formattedHistory = recentHistory.map(msg => {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        return { ...msg, content: '' }; // Set content to empty string if tool_calls exist
      }
      return msg;
    });
    
    console.log('📊 Simulacrum | Context history prepared:', {
      maxTokens,
      totalHistoryMessages: this.conversationHistory.length,
      contextMessages: formattedHistory.length,
      contextMessageRoles: formattedHistory.map(msg => msg.role),
      totalContextLength: formattedHistory.reduce((sum, msg) => sum + (msg.content?.length || 0), 0)
    });
    
    return formattedHistory;
  }

  /**
   * Default system prompt for Simulacrum - enforces JSON response format for agentic behavior
   */
  async getDefaultSystemPrompt() {
    const toolSchemas = await this.generateToolSchemas();
    const toolList = toolSchemas.map(schema => {
      let params = '';
      if (schema.parameters && schema.parameters.properties) {
        params = Object.keys(schema.parameters.properties).map(key => {
          const prop = schema.parameters.properties[key];
          return `${key}: ${prop.type}${prop.enum ? ` (${prop.enum.join(', ')})` : ''}`; 
        }).join(', ');
      }
      return `- ${schema.name}(${params}): ${schema.description}`;
    }).join('\n');
    
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