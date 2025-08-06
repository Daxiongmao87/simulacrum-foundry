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

      // Prepare request
      const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
      const modelName = game.settings.get('simulacrum', 'modelName');
      const systemPrompt = game.settings.get('simulacrum', 'systemPrompt');
      const contextLength = game.settings.get('simulacrum', 'contextLength');

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
        functions: this.generateToolSchemas(),
        function_call: 'auto',
        stream: true,
        temperature: 0.7
      };

      // Make streaming request
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${game.settings.get('simulacrum', 'apiKey') || ''}`
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status} ${response.statusText}`);
      }

      // Process streaming response
      await this.processStreamingResponse(response, onChunk, onComplete, abortSignal);

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('AI request cancelled by user');
      } else {
        console.error('AI Service Error:', error);
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
    try {
      const tool = this.toolRegistry.getTool(toolName);
      
      // Check if confirmation is needed (unless YOLO mode)
      const yoloMode = game.settings.get('simulacrum', 'yoloMode');
      if (!yoloMode && tool.shouldConfirmExecute()) {
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