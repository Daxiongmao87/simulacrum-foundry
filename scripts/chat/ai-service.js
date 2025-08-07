import { SimulacrumSettings } from '../settings.js';

export class SimulacrumAIService {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
    this.conversationHistory = [];
    this.abortController = null;
  }

  /**
   * Generate OpenAI-compatible function schemas from tool registry
   */
  generateToolSchemas() {
    const schemas = [];
    for (const [name, tool] of this.toolRegistry.tools.entries()) {
      schemas.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameterSchema
      });
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
          contentPreview: userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : '')
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
          content: systemPrompt || this.getDefaultSystemPrompt()
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
            contentLength: msg.content?.length || 0,
            contentPreview: msg.content?.substring(0, 100) + (msg.content?.length > 100 ? '...' : ''),
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
                // Handle function call streaming
                const functionCall = delta.function_call;
                if (functionCall.name) {
                  functionCalls.push({
                    name: functionCall.name,
                    arguments: functionCall.arguments || ''
                  });
                } else if (functionCall.arguments) {
                  // Append to last function call arguments
                  const lastCall = functionCalls[functionCalls.length - 1];
                  if (lastCall) {
                    lastCall.arguments += functionCall.arguments;
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
          function_calls: functionCalls
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
    
    console.log('📊 Simulacrum | Context history prepared:', {
      maxTokens,
      totalHistoryMessages: this.conversationHistory.length,
      contextMessages: recentHistory.length,
      contextMessageRoles: recentHistory.map(msg => msg.role),
      totalContextLength: recentHistory.reduce((sum, msg) => sum + (msg.content?.length || 0), 0)
    });
    
    return recentHistory;
  }

  /**
   * Default system prompt for Simulacrum
   */
  getDefaultSystemPrompt() {
    return `You are Simulacrum, an AI campaign assistant for FoundryVTT Game Masters. You help manage campaigns by:

- Creating, reading, updating, and deleting game documents (actors, items, scenes, journals, etc.)
- Providing information about the current world, scenes, and game state
- Assisting with campaign management and organization

You have access to tools for document operations. Always use tools when users request document manipulation. Be helpful, concise, and focused on practical campaign assistance.

Current world: ${game.world?.title || 'Unknown'}
System: ${game.system?.title || 'Unknown'} v${game.system?.version || '?'}`;
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