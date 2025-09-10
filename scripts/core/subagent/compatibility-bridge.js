/**
 * SubAgent Architecture - Compatibility Bridge
 * Integrates SubAgent system with existing agent ecosystem and Task tool framework
 */

import { createLogger } from '../../utils/logger.js';

export class CompatibilityBridge {
  constructor(taskTool, agentRegistry) {
    this.logger = createLogger('CompatibilityBridge');
    this.taskTool = taskTool;
    this.agentRegistry = agentRegistry;
    this.subagentMappings = new Map(); // Maps SubAgent configs to existing agents
  }

  /**
   * Convert existing agent configuration to SubAgent format
   * @param {string} agentType - Existing agent type (e.g., 'github-expert', 'project-investigator')
   * @param {Object} agentConfig - Original agent configuration
   * @returns {SubAgentConfig} SubAgent-compatible configuration
   */
  convertAgentToSubAgent(agentType, agentConfig) {
    try {
      const baseConfig = {
        prompt: this._buildSubAgentPrompt(agentType, agentConfig),
        modelSettings: {
          model: agentConfig.model || 'gpt-3.5-turbo',
          temperature: agentConfig.temperature || 0.7,
          maxTokens: agentConfig.maxTokens || 2000
        },
        toolPermissions: this._getAgentToolPermissions(agentType),
        outputDefinitions: this._getAgentOutputDefinitions(agentType),
        constraints: {
          timeoutMs: agentConfig.timeout || 900000,
          maxTurns: agentConfig.maxTurns || 50,
          terminationConditions: this._getAgentTerminationConditions(agentType),
          resourceLimits: {
            maxMemoryMB: 100,
            maxCpuTimeMs: 300000
          }
        }
      };

      this.subagentMappings.set(`${agentType}_${Date.now()}`, {
        originalType: agentType,
        originalConfig: agentConfig,
        subagentConfig: baseConfig
      });

      this.logger.debug(`Converted ${agentType} to SubAgent configuration`);
      return baseConfig;

    } catch (error) {
      this.logger.error(`Error converting ${agentType} to SubAgent:`, error);
      throw error;
    }
  }

  /**
   * Execute SubAgent using Task tool framework
   * @param {SubAgentConfig} config - SubAgent configuration
   * @param {Object} contextVariables - Context variables
   * @returns {Promise<SubAgentResult>} Execution result
   */
  async executeViaTaskTool(config, contextVariables = {}) {
    try {
      // Map SubAgent config to Task tool parameters
      const taskParams = {
        description: this._extractTaskDescription(config),
        prompt: this._processPromptTemplate(config.prompt, contextVariables),
        subagent_type: this._mapToExistingAgentType(config),
        timeout: config.constraints.timeoutMs,
        context: contextVariables
      };

      this.logger.info('Executing SubAgent via Task tool framework');
      
      // Execute via Task tool (simplified - real implementation would call actual Task tool)
      const taskResult = await this._simulateTaskExecution(taskParams);

      // Convert Task result to SubAgent result format
      return this._convertTaskResultToSubAgent(taskResult, config);

    } catch (error) {
      this.logger.error('Error executing SubAgent via Task tool:', error);
      throw error;
    }
  }

  /**
   * Create SubAgent configuration from Task tool parameters
   * @param {Object} taskParams - Task tool parameters
   * @returns {SubAgentConfig} SubAgent configuration
   */
  createSubAgentFromTask(taskParams) {
    const agentType = taskParams.subagent_type || 'general-purpose';
    
    return {
      prompt: taskParams.prompt || taskParams.description,
      modelSettings: {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000
      },
      toolPermissions: this._getAgentToolPermissions(agentType),
      outputDefinitions: this._getTaskOutputDefinitions(taskParams),
      constraints: {
        timeoutMs: taskParams.timeout || 900000,
        maxTurns: 50,
        terminationConditions: [],
        resourceLimits: {
          maxMemoryMB: 100,
          maxCpuTimeMs: 300000
        }
      }
    };
  }

  /**
   * Register custom SubAgent type with the system
   * @param {string} typeName - Custom SubAgent type name
   * @param {Object} typeDefinition - Type definition with defaults and constraints
   */
  registerSubAgentType(typeName, typeDefinition) {
    const registration = {
      typeName,
      definition: typeDefinition,
      registered: new Date(),
      defaultConfig: {
        toolPermissions: typeDefinition.allowedTools || ['*'],
        constraints: {
          timeoutMs: typeDefinition.defaultTimeout || 900000,
          maxTurns: typeDefinition.defaultMaxTurns || 50,
          ...typeDefinition.constraints
        },
        ...typeDefinition.defaults
      }
    };

    this.subagentMappings.set(`type_${typeName}`, registration);
    this.logger.info(`Registered custom SubAgent type: ${typeName}`);
  }

  /**
   * Get all registered SubAgent types
   * @returns {Array} Array of registered SubAgent types
   */
  getRegisteredTypes() {
    const types = [];
    
    for (const [key, mapping] of this.subagentMappings.entries()) {
      if (key.startsWith('type_')) {
        types.push({
          name: mapping.typeName,
          definition: mapping.definition,
          registered: mapping.registered
        });
      }
    }

    return types;
  }

  /**
   * Create backward-compatible wrapper for existing agent calls
   * @param {string} agentType - Original agent type
   * @param {string} prompt - Agent prompt
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result in original format
   */
  async executeCompatibleAgent(agentType, prompt, options = {}) {
    try {
      // Convert to SubAgent format
      const subagentConfig = this.convertAgentToSubAgent(agentType, {
        ...options,
        prompt
      });

      // Execute via SubAgent system
      const subagentResult = await this.executeViaTaskTool(subagentConfig, options.context || {});

      // Convert back to original agent result format
      return this._convertSubAgentToOriginalFormat(subagentResult, agentType);

    } catch (error) {
      this.logger.error(`Error in compatible agent execution for ${agentType}:`, error);
      throw error;
    }
  }

  /**
   * Build SubAgent prompt from original agent configuration
   * @private
   */
  _buildSubAgentPrompt(agentType, config) {
    const agentPrompts = {
      'github-expert': 'You are a GitHub expert agent. Handle all GitHub-related operations including issue reading, writing, editing, interpreting, managing, and workflow coordination. {{task_description}}',
      'project-investigator': 'You are a project investigation agent. Conduct thorough analysis of project content, investigate implementation patterns, and examine project structure. {{task_description}}',
      'implementation-tester': 'You are an implementation testing agent. Test and validate code implementations after changes have been made. {{task_description}}',
      'general-purpose': 'You are a general-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. {{task_description}}'
    };

    const basePrompt = agentPrompts[agentType] || agentPrompts['general-purpose'];
    
    if (config.prompt) {
      return `${basePrompt}\n\nSpecific instructions: ${config.prompt}`;
    }

    return basePrompt;
  }

  /**
   * Get tool permissions for agent types
   * @private
   */
  _getAgentToolPermissions(agentType) {
    const permissions = {
      'github-expert': ['Bash', 'Glob', 'Grep', 'LS', 'Read', 'WebFetch', 'TodoWrite', 'WebSearch', 'BashOutput', 'KillBash'],
      'project-investigator': ['Bash', 'Glob', 'Grep', 'LS', 'Read', 'WebFetch', 'TodoWrite', 'WebSearch', 'BashOutput', 'KillBash'],
      'implementation-tester': ['*'], // All tools for testing
      'general-purpose': ['*'], // All tools for general purpose
      'output-style-setup': ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
      'statusline-setup': ['Read', 'Edit']
    };

    return permissions[agentType] || ['*'];
  }

  /**
   * Get output definitions for agent types
   * @private
   */
  _getAgentOutputDefinitions(agentType) {
    const definitions = {
      'github-expert': {
        issues_found: { type: 'array', description: 'GitHub issues found or created' },
        workflow_status: { type: 'string', description: 'Workflow coordination status' }
      },
      'project-investigator': {
        findings: { type: 'object', description: 'Investigation findings and patterns' },
        structure_analysis: { type: 'object', description: 'Project structure analysis' }
      },
      'implementation-tester': {
        test_results: { type: 'object', description: 'Testing results and validation' },
        issues_found: { type: 'array', description: 'Issues identified during testing' }
      },
      'general-purpose': {
        result: { type: 'any', description: 'General task result' }
      }
    };

    return definitions[agentType] || definitions['general-purpose'];
  }

  /**
   * Get termination conditions for agent types
   * @private
   */
  _getAgentTerminationConditions(agentType) {
    // Most agents terminate when their specific outputs are available
    return []; // Using default termination conditions for now
  }

  /**
   * Extract task description from config
   * @private
   */
  _extractTaskDescription(config) {
    // Extract task description from prompt or provide default
    const promptMatch = config.prompt.match(/\{\{task_description\}\}/);
    if (promptMatch) {
      return 'Execute SubAgent task as configured';
    }
    
    return config.prompt.slice(0, 100) + '...';
  }

  /**
   * Process prompt template with context variables
   * @private
   */
  _processPromptTemplate(prompt, contextVariables) {
    let processed = prompt;
    
    for (const [key, value] of Object.entries(contextVariables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processed = processed.replace(placeholder, String(value));
    }
    
    return processed;
  }

  /**
   * Map SubAgent config to existing agent type
   * @private
   */
  _mapToExistingAgentType(config) {
    // Simple heuristic mapping based on tool permissions and prompt content
    const prompt = config.prompt.toLowerCase();
    
    if (prompt.includes('github') || prompt.includes('issue')) {
      return 'github-expert';
    }
    
    if (prompt.includes('investigate') || prompt.includes('analyze')) {
      return 'project-investigator';
    }
    
    if (prompt.includes('test') || prompt.includes('validate')) {
      return 'implementation-tester';
    }
    
    return 'general-purpose';
  }

  /**
   * Simulate task execution (placeholder for real Task tool integration)
   * @private
   */
  async _simulateTaskExecution(taskParams) {
    // This would be replaced with actual Task tool execution
    return {
      success: true,
      result: `Task executed: ${taskParams.description}`,
      duration: Math.random() * 5000,
      toolCalls: []
    };
  }

  /**
   * Convert Task result to SubAgent result format
   * @private
   */
  _convertTaskResultToSubAgent(taskResult, config) {
    const emittedVariables = new Map();
    
    // Extract variables from task result
    if (taskResult.result) {
      emittedVariables.set('result', taskResult.result);
    }
    
    return {
      emittedVariables,
      termination: {
        reason: taskResult.success ? 'GOAL' : 'ERROR',
        executionDuration: taskResult.duration || 0,
        status: taskResult.success ? 'SUCCESS' : 'ERROR',
        turnsExecuted: 1
      },
      executionMetadata: {
        originalTaskResult: taskResult,
        toolCalls: taskResult.toolCalls || []
      },
      finalContext: {
        variables: emittedVariables,
        executionHistory: [taskResult]
      }
    };
  }

  /**
   * Convert SubAgent result back to original agent format
   * @private
   */
  _convertSubAgentToOriginalFormat(subagentResult, agentType) {
    return {
      success: subagentResult.termination.status === 'SUCCESS',
      result: subagentResult.emittedVariables.get('result') || 'Task completed',
      duration: subagentResult.termination.executionDuration,
      agentType: agentType,
      metadata: subagentResult.executionMetadata
    };
  }

  /**
   * Get task output definitions from parameters
   * @private
   */
  _getTaskOutputDefinitions(taskParams) {
    return {
      result: { type: 'any', description: 'Task execution result' },
      metadata: { type: 'object', description: 'Task execution metadata' }
    };
  }
}