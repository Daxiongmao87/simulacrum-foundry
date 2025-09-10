/**
 * SubAgent Architecture - SubAgent Executor
 * Core execution engine with lifecycle management and termination control
 */

import { ISubAgent, SubAgentScope } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class SubAgentExecutor extends ISubAgent {
  constructor(toolRegistry, aiClient) {
    super();
    this.logger = createLogger('SubAgentExecutor');
    this.toolRegistry = toolRegistry;
    this.aiClient = aiClient;
    this.activeScopes = new Map();
  }

  /**
   * Initialize SubAgent scope with configuration and context
   */
  async initializeScope(config, contextState = {}) {
    try {
      // Validate configuration
      this._validateConfig(config);

      // Create execution scope
      const scope = new SubAgentScope(config, {
        variables: new Map(Object.entries(contextState.variables || {})),
        executionHistory: [],
        created: new Date(),
        lastUpdated: new Date()
      });

      // Apply default constraints if not provided
      scope.config.constraints = {
        timeoutMs: 900000, // 15 minutes default
        maxTurns: 50,
        terminationConditions: [],
        resourceLimits: {
          maxMemoryMB: 100,
          maxCpuTimeMs: 300000 // 5 minutes CPU time
        },
        ...config.constraints
      };

      // Validate tool permissions
      this._validateToolPermissions(scope.config.toolPermissions);

      // Store active scope
      this.activeScopes.set(scope.id, scope);

      this.logger.info(`Initialized SubAgent scope ${scope.id}`);
      return scope;

    } catch (error) {
      this.logger.error('Error initializing SubAgent scope:', error);
      throw new Error(`SubAgent initialization failed: ${error.message}`);
    }
  }

  /**
   * Execute SubAgent with configured constraints
   */
  async execute(scope) {
    try {
      scope.startExecution();
      this.logger.info(`Starting SubAgent execution for scope ${scope.id}`);

      let result = null;
      let terminationCondition = null;

      // Main execution loop
      while (!terminationCondition) {
        // Check termination conditions before each turn
        terminationCondition = await this.checkTermination(scope);
        if (terminationCondition) {
          break;
        }

        // Increment turn counter
        scope.incrementTurn();
        this.logger.debug(`SubAgent turn ${scope.executionTurns} for scope ${scope.id}`);

        // Execute one turn
        try {
          await this._executeTurn(scope);
        } catch (error) {
          this.logger.error(`Turn execution failed for scope ${scope.id}:`, error);
          terminationCondition = {
            type: 'ERROR',
            reason: `Execution error: ${error.message}`,
            evaluator: () => true
          };
          break;
        }

        // Update context timestamp
        scope.contextState.lastUpdated = new Date();
      }

      // Create final result
      result = await this._createExecutionResult(scope, terminationCondition);
      
      // Cleanup resources
      await this.cleanup(scope);

      this.logger.info(`SubAgent execution completed for scope ${scope.id} - ${terminationCondition.type}`);
      return result;

    } catch (error) {
      this.logger.error('Error during SubAgent execution:', error);
      await this.cleanup(scope);
      throw error;
    }
  }

  /**
   * Emit a variable during execution
   */
  async emitVariable(scope, name, value) {
    if (!scope || !name) {
      throw new Error('Scope and variable name are required');
    }

    scope.emittedVariables.set(name, {
      value,
      timestamp: new Date(),
      turn: scope.executionTurns
    });

    // Also update context state
    scope.contextState.variables.set(name, value);

    this.logger.debug(`Variable emitted in scope ${scope.id}: ${name}`);
  }

  /**
   * Check if termination conditions are met
   */
  async checkTermination(scope) {
    // Check timeout
    if (scope.isTimedOut()) {
      return {
        type: 'TIMEOUT',
        reason: `Execution timeout after ${scope.getExecutionDuration()}ms`,
        evaluator: () => true
      };
    }

    // Check max turns
    if (scope.isMaxTurnsReached()) {
      return {
        type: 'MAX_TURNS',
        reason: `Maximum turns reached: ${scope.executionTurns}`,
        evaluator: () => true
      };
    }

    // Check resource limits
    const resourceCheck = this._checkResourceLimits(scope);
    if (resourceCheck) {
      return resourceCheck;
    }

    // Check custom termination conditions
    for (const condition of scope.config.constraints.terminationConditions) {
      try {
        if (await condition.evaluator(scope)) {
          return condition;
        }
      } catch (error) {
        this.logger.warn(`Termination condition evaluation failed:`, error);
      }
    }

    return null; // Continue execution
  }

  /**
   * Clean up resources and finalize execution
   */
  async cleanup(scope) {
    try {
      // Remove from active scopes
      this.activeScopes.delete(scope.id);

      // Mark scope as completed
      scope.status = 'COMPLETED';

      // Log cleanup
      this.logger.debug(`Cleaned up SubAgent scope ${scope.id}`);

    } catch (error) {
      this.logger.error('Error during SubAgent cleanup:', error);
    }
  }

  /**
   * Execute a single turn of SubAgent processing
   * @private
   */
  async _executeTurn(scope) {
    // Update resource usage
    const memoryUsage = process.memoryUsage();
    scope.updateResourceUsage({
      memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // MB
      cpuTime: process.cpuUsage().user / 1000 // ms
    });

    // Process template substitution in prompt
    const processedPrompt = this._processTemplateVariables(scope.config.prompt, scope.contextState.variables);

    // Simulate AI execution with tool calls
    // In real implementation, this would call the actual AI client
    const aiResponse = await this._simulateAIExecution(scope, processedPrompt);
    
    // Process any tool calls in the response
    if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
      await this._processToolCalls(scope, aiResponse.toolCalls);
    }

    // Record execution step
    scope.contextState.executionHistory.push({
      turn: scope.executionTurns,
      prompt: processedPrompt,
      response: aiResponse,
      timestamp: new Date()
    });
  }

  /**
   * Process template variables in text
   * @private
   */
  _processTemplateVariables(text, variables) {
    let processed = text;
    
    for (const [name, value] of variables.entries()) {
      const placeholder = new RegExp(`\\{\\{${name}\\}\\}`, 'g');
      processed = processed.replace(placeholder, String(value));
    }
    
    return processed;
  }

  /**
   * Simulate AI execution for demonstration
   * @private
   */
  async _simulateAIExecution(scope, prompt) {
    // This is a simplified simulation
    // Real implementation would use the actual AI client
    return {
      content: `Executed turn ${scope.executionTurns} for SubAgent`,
      toolCalls: [],
      usage: { tokens: 100 }
    };
  }

  /**
   * Process tool calls with permission validation
   * @private
   */
  async _processToolCalls(scope, toolCalls) {
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name || toolCall.name;
      
      // Check tool permissions
      if (!scope.config.toolPermissions.includes(toolName)) {
        throw new Error(`Tool '${toolName}' not permitted for this SubAgent`);
      }

      // Execute tool (simplified)
      try {
        const tool = this.toolRegistry.getTool(toolName);
        if (tool) {
          const result = await tool.execute(toolCall.function?.arguments || toolCall.arguments);
          
          // Store tool result in context
          scope.contextState.variables.set(`_tool_${toolName}_result`, result);
        }
      } catch (error) {
        this.logger.warn(`Tool execution failed: ${toolName}`, error);
        throw error;
      }
    }
  }

  /**
   * Check resource limits
   * @private
   */
  _checkResourceLimits(scope) {
    const limits = scope.config.constraints.resourceLimits;
    
    if (scope.resources.memoryUsage > limits.maxMemoryMB) {
      return {
        type: 'ERROR',
        reason: `Memory limit exceeded: ${scope.resources.memoryUsage}MB > ${limits.maxMemoryMB}MB`,
        evaluator: () => true
      };
    }

    if (scope.resources.cpuTime > limits.maxCpuTimeMs) {
      return {
        type: 'ERROR', 
        reason: `CPU time limit exceeded: ${scope.resources.cpuTime}ms > ${limits.maxCpuTimeMs}ms`,
        evaluator: () => true
      };
    }

    return null;
  }

  /**
   * Create execution result
   * @private
   */
  async _createExecutionResult(scope, terminationCondition) {
    return {
      emittedVariables: new Map(scope.emittedVariables),
      termination: {
        reason: terminationCondition.type,
        executionDuration: scope.getExecutionDuration(),
        status: terminationCondition.type === 'ERROR' ? 'ERROR' : 'SUCCESS',
        turnsExecuted: scope.executionTurns
      },
      executionMetadata: {
        scopeId: scope.id,
        resourceUsage: scope.resources,
        historyLength: scope.contextState.executionHistory.length
      },
      finalContext: scope.contextState
    };
  }

  /**
   * Validate SubAgent configuration
   * @private
   */
  _validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('SubAgent configuration is required');
    }

    if (!config.prompt || typeof config.prompt !== 'string') {
      throw new Error('SubAgent prompt is required and must be a string');
    }

    if (!Array.isArray(config.toolPermissions)) {
      throw new Error('Tool permissions must be an array');
    }
  }

  /**
   * Validate tool permissions
   * @private
   */
  _validateToolPermissions(toolPermissions) {
    for (const toolName of toolPermissions) {
      if (!this.toolRegistry.getTool(toolName)) {
        this.logger.warn(`Tool '${toolName}' not found in registry`);
      }
    }
  }
}