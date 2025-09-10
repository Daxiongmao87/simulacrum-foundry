/**
 * SubAgent Architecture - Main Implementation
 * Orchestrates all SubAgent components and provides the main API
 */

import { SubAgentExecutor } from './subagent-executor.js';
import { ContextStateManager } from './context-state-manager.js';
import { TerminationController } from './termination-controller.js';
import { ResourceManager } from './resource-manager.js';
import { CompatibilityBridge } from './compatibility-bridge.js';
import { createLogger } from '../../utils/logger.js';

export class SubAgentArchitecture {
  constructor(toolRegistry, aiClient) {
    this.logger = createLogger('SubAgentArchitecture');
    
    // Initialize core components
    this.executor = new SubAgentExecutor(toolRegistry, aiClient);
    this.contextManager = new ContextStateManager();
    this.terminationController = new TerminationController();
    this.resourceManager = new ResourceManager();
    this.compatibilityBridge = new CompatibilityBridge(null, null); // Would be injected in real system
    
    // Track active executions
    this.activeExecutions = new Map();
  }

  /**
   * Create and execute a SubAgent with full lifecycle management
   * @param {SubAgentConfig} config - SubAgent configuration
   * @param {Object} contextVariables - Initial context variables
   * @param {Object} options - Execution options
   * @returns {Promise<SubAgentResult>} Complete execution result
   */
  async executeSubAgent(config, contextVariables = {}, options = {}) {
    let scope = null;
    let scopeId = null;

    try {
      this.logger.info('Starting SubAgent execution');

      // Validate configuration
      this._validateSubAgentConfig(config);

      // Initialize execution scope first to get scope ID
      const tempContextState = this.contextManager.createContext(
        `temp_${Date.now()}`,
        contextVariables
      );
      
      scope = await this.executor.initializeScope(config, tempContextState);
      scopeId = scope.id;
      
      // Now allocate resources with the actual scope ID
      const resourceAllocation = this.resourceManager.allocateResources(
        scopeId,
        config.constraints.resourceLimits || {}
      );

      if (!resourceAllocation.success) {
        throw new Error(`Resource allocation failed: ${resourceAllocation.error}`);
      }

      // Update context state with correct scope ID
      const contextState = this.contextManager.createContext(scopeId, contextVariables);
      scope.contextState = contextState;

      // Start termination monitoring
      this.terminationController.startMonitoring(scopeId, config.constraints);

      // Track active execution
      this.activeExecutions.set(scopeId, {
        scope,
        startTime: Date.now(),
        config,
        options
      });

      // Execute SubAgent with monitoring
      const result = await this._executeWithMonitoring(scope, options);

      // Update final metrics
      result.executionMetadata = {
        ...result.executionMetadata,
        resourceStats: this.resourceManager.getResourceStats(scopeId),
        contextStats: this.contextManager.getContextStats(scopeId),
        terminationStats: this.terminationController.getMonitorStats(scopeId)
      };

      this.logger.info(`SubAgent execution completed successfully: ${scopeId}`);
      return result;

    } catch (error) {
      this.logger.error('SubAgent execution failed:', error);
      
      // Create error result
      return {
        emittedVariables: new Map(),
        termination: {
          reason: 'ERROR',
          executionDuration: scope ? scope.getExecutionDuration() : 0,
          status: 'ERROR',
          turnsExecuted: scope ? scope.executionTurns : 0
        },
        executionMetadata: {
          error: error.message,
          failed: true
        },
        finalContext: scope ? scope.contextState : null
      };

    } finally {
      // Cleanup resources
      if (scopeId) {
        await this._performCleanup(scopeId);
      }
    }
  }

  /**
   * Create SubAgent configuration from existing agent type
   * @param {string} agentType - Existing agent type
   * @param {Object} agentConfig - Original agent configuration  
   * @returns {SubAgentConfig} SubAgent configuration
   */
  createSubAgentFromExistingAgent(agentType, agentConfig) {
    return this.compatibilityBridge.convertAgentToSubAgent(agentType, agentConfig);
  }

  /**
   * Execute SubAgent using Task tool compatibility mode
   * @param {string} agentType - Agent type for Task tool
   * @param {string} prompt - Execution prompt
   * @param {Object} contextVariables - Context variables
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Task tool compatible result
   */
  async executeViaTaskTool(agentType, prompt, contextVariables = {}, options = {}) {
    try {
      // Create SubAgent config from Task tool parameters
      const taskParams = {
        subagent_type: agentType,
        prompt: prompt,
        context: contextVariables,
        ...options
      };

      const subagentConfig = this.compatibilityBridge.createSubAgentFromTask(taskParams);
      
      // Execute via SubAgent system
      const subagentResult = await this.executeSubAgent(subagentConfig, contextVariables, options);

      // Convert to Task tool format
      return this._convertToTaskToolResult(subagentResult, agentType);

    } catch (error) {
      this.logger.error('Task tool compatibility execution failed:', error);
      throw error;
    }
  }

  /**
   * Create custom termination conditions
   * @param {string} type - Condition type ('goal', 'variable', 'output', 'custom')
   * @param {Object} params - Condition parameters
   * @returns {TerminationCondition} Termination condition
   */
  createTerminationCondition(type, params) {
    switch (type) {
      case 'goal':
        return this.terminationController.createGoalCondition(
          params.description,
          params.evaluator
        );
      
      case 'variable':
        return this.terminationController.createVariableCondition(
          params.variableName,
          params.condition,
          params.description
        );
      
      case 'output':
        return this.terminationController.createOutputCondition(
          params.requiredOutputs,
          params.description
        );
      
      default:
        return {
          type: 'CUSTOM',
          reason: params.reason || 'Custom condition met',
          evaluator: params.evaluator
        };
    }
  }

  /**
   * Get execution statistics for all active SubAgents
   * @returns {Object} Overall execution statistics
   */
  getExecutionStatistics() {
    const activeExecutions = Array.from(this.activeExecutions.values());
    
    return {
      activeSubAgents: activeExecutions.length,
      totalExecutions: this.activeExecutions.size,
      resourceStats: this.resourceManager.getGlobalStats(),
      terminationStats: this.terminationController.getOverallStats(),
      averageExecutionTime: activeExecutions.length > 0 
        ? activeExecutions.reduce((sum, exec) => sum + (Date.now() - exec.startTime), 0) / activeExecutions.length
        : 0
    };
  }

  /**
   * Force termination of a SubAgent execution
   * @param {string} scopeId - Scope identifier
   * @param {string} reason - Termination reason
   * @returns {boolean} Success status
   */
  forceTermination(scopeId, reason) {
    try {
      const execution = this.activeExecutions.get(scopeId);
      if (!execution) {
        this.logger.warn(`No active execution found for scope ${scopeId}`);
        return false;
      }

      // Force termination through controller
      this.terminationController.forceTermination(scopeId, reason);
      
      this.logger.info(`Forced termination of SubAgent execution: ${scopeId}`);
      return true;

    } catch (error) {
      this.logger.error(`Error forcing termination of ${scopeId}:`, error);
      return false;
    }
  }

  /**
   * Register custom SubAgent type
   * @param {string} typeName - Type name
   * @param {Object} typeDefinition - Type definition
   */
  registerCustomSubAgentType(typeName, typeDefinition) {
    this.compatibilityBridge.registerSubAgentType(typeName, typeDefinition);
    this.logger.info(`Registered custom SubAgent type: ${typeName}`);
  }

  /**
   * Execute SubAgent with comprehensive monitoring
   * @private
   */
  async _executeWithMonitoring(scope, options) {
    const monitoringInterval = setInterval(() => {
      try {
        // Update resource usage
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        this.resourceManager.updateUsage(scope.id, {
          memoryMB: memUsage.heapUsed / 1024 / 1024,
          cpuTimeMs: cpuUsage.user / 1000
        });

        // Check limits
        const limitCheck = this.resourceManager.checkLimits(scope.id);
        if (!limitCheck.valid) {
          this.logger.warn(`Resource limit violations for ${scope.id}:`, limitCheck.violations);
        }

      } catch (error) {
        this.logger.warn('Monitoring update failed:', error);
      }
    }, 1000); // Update every second

    try {
      // Execute the SubAgent
      const result = await this.executor.execute(scope);
      
      return result;

    } finally {
      // Stop monitoring
      clearInterval(monitoringInterval);
    }
  }

  /**
   * Perform comprehensive cleanup for a scope
   * @private
   */
  async _performCleanup(scopeId) {
    try {
      // Stop termination monitoring
      this.terminationController.stopMonitoring(scopeId);
      
      // Release resources
      this.resourceManager.releaseResources(scopeId);
      
      // Clear context
      this.contextManager.clearContext(scopeId);
      
      // Remove from active executions
      this.activeExecutions.delete(scopeId);
      
      this.logger.debug(`Cleanup completed for scope ${scopeId}`);

    } catch (error) {
      this.logger.error(`Cleanup failed for scope ${scopeId}:`, error);
    }
  }

  /**
   * Validate SubAgent configuration
   * @private
   */
  _validateSubAgentConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('SubAgent configuration is required');
    }

    if (!config.prompt || typeof config.prompt !== 'string') {
      throw new Error('SubAgent prompt is required');
    }

    if (!Array.isArray(config.toolPermissions)) {
      throw new Error('Tool permissions must be an array');
    }

    if (!config.constraints || typeof config.constraints !== 'object') {
      throw new Error('Execution constraints are required');
    }
  }

  /**
   * Convert SubAgent result to Task tool format
   * @private
   */
  _convertToTaskToolResult(subagentResult, agentType) {
    return {
      success: subagentResult.termination.status === 'SUCCESS',
      agentType: agentType,
      result: Array.from(subagentResult.emittedVariables.entries()).reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {}),
      executionTime: subagentResult.termination.executionDuration,
      turnsExecuted: subagentResult.termination.turnsExecuted,
      terminationReason: subagentResult.termination.reason,
      metadata: subagentResult.executionMetadata
    };
  }
}