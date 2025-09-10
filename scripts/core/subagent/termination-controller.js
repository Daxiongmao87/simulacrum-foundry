/**
 * SubAgent Architecture - Termination Controller
 * Manages termination conditions, timeout monitoring, and graceful shutdown
 */

import { createLogger } from '../../utils/logger.js';

export class TerminationController {
  constructor() {
    this.logger = createLogger('TerminationController');
    this.monitors = new Map(); // scopeId -> monitor data
  }

  /**
   * Start monitoring termination conditions for a scope
   * @param {string} scopeId - Scope identifier
   * @param {ExecutionConstraints} constraints - Execution constraints
   */
  startMonitoring(scopeId, constraints) {
    const monitor = {
      scopeId,
      startTime: Date.now(),
      constraints,
      checkCount: 0,
      lastCheck: null,
      terminated: false
    };

    this.monitors.set(scopeId, monitor);
    this.logger.debug(`Started monitoring termination for scope ${scopeId}`);
  }

  /**
   * Check all termination conditions for a scope
   * @param {SubAgentScope} scope - SubAgent execution scope
   * @returns {TerminationCondition|null} Met condition or null if should continue
   */
  async checkTermination(scope) {
    const monitor = this.monitors.get(scope.id);
    if (!monitor) {
      throw new Error(`No monitor found for scope ${scope.id}`);
    }

    if (monitor.terminated) {
      return null; // Already terminated
    }

    monitor.checkCount++;
    monitor.lastCheck = Date.now();

    // Check built-in termination conditions
    const builtinCondition = await this._checkBuiltinConditions(scope, monitor);
    if (builtinCondition) {
      return builtinCondition;
    }

    // Check custom termination conditions
    const customCondition = await this._checkCustomConditions(scope, monitor);
    if (customCondition) {
      return customCondition;
    }

    return null; // Continue execution
  }

  /**
   * Force termination of a scope
   * @param {string} scopeId - Scope identifier
   * @param {string} reason - Reason for forced termination
   * @returns {TerminationCondition} Termination condition
   */
  forceTermination(scopeId, reason) {
    const monitor = this.monitors.get(scopeId);
    if (monitor) {
      monitor.terminated = true;
    }

    this.logger.warn(`Forced termination for scope ${scopeId}: ${reason}`);

    return {
      type: 'FORCED',
      reason: reason || 'Manual termination',
      evaluator: () => true,
      timestamp: new Date()
    };
  }

  /**
   * Stop monitoring a scope
   * @param {string} scopeId - Scope identifier
   */
  stopMonitoring(scopeId) {
    const monitor = this.monitors.get(scopeId);
    if (monitor) {
      monitor.terminated = true;
      this.monitors.delete(scopeId);
      this.logger.debug(`Stopped monitoring scope ${scopeId}`);
    }
  }

  /**
   * Get monitoring statistics for a scope
   * @param {string} scopeId - Scope identifier
   * @returns {Object|null} Monitor statistics or null if not found
   */
  getMonitorStats(scopeId) {
    const monitor = this.monitors.get(scopeId);
    if (!monitor) {
      return null;
    }

    return {
      scopeId: monitor.scopeId,
      runtime: Date.now() - monitor.startTime,
      checkCount: monitor.checkCount,
      lastCheck: monitor.lastCheck,
      terminated: monitor.terminated,
      timeoutRemaining: Math.max(0, monitor.constraints.timeoutMs - (Date.now() - monitor.startTime))
    };
  }

  /**
   * Create goal-based termination condition
   * @param {string} description - Goal description
   * @param {Function} evaluator - Function that returns true when goal is met
   * @returns {TerminationCondition} Goal termination condition
   */
  createGoalCondition(description, evaluator) {
    return {
      type: 'GOAL',
      reason: `Goal achieved: ${description}`,
      evaluator: async (scope) => {
        try {
          return await evaluator(scope);
        } catch (error) {
          this.logger.warn(`Goal condition evaluation error: ${error.message}`);
          return false;
        }
      }
    };
  }

  /**
   * Create variable-based termination condition
   * @param {string} variableName - Variable name to check
   * @param {Function} condition - Condition function (value) => boolean
   * @param {string} description - Condition description
   * @returns {TerminationCondition} Variable-based termination condition
   */
  createVariableCondition(variableName, condition, description) {
    return {
      type: 'VARIABLE',
      reason: `Variable condition met: ${description}`,
      evaluator: async (scope) => {
        try {
          const value = scope.contextState.variables.get(variableName);
          return value !== undefined && condition(value);
        } catch (error) {
          this.logger.warn(`Variable condition evaluation error: ${error.message}`);
          return false;
        }
      }
    };
  }

  /**
   * Create output-based termination condition
   * @param {string[]} requiredOutputs - Required output variable names
   * @param {string} description - Condition description
   * @returns {TerminationCondition} Output-based termination condition
   */
  createOutputCondition(requiredOutputs, description) {
    return {
      type: 'OUTPUT',
      reason: `Required outputs available: ${description}`,
      evaluator: async (scope) => {
        try {
          return requiredOutputs.every(output => 
            scope.emittedVariables.has(output)
          );
        } catch (error) {
          this.logger.warn(`Output condition evaluation error: ${error.message}`);
          return false;
        }
      }
    };
  }

  /**
   * Check built-in termination conditions
   * @private
   */
  async _checkBuiltinConditions(scope, monitor) {
    const runtime = Date.now() - monitor.startTime;

    // Check timeout
    if (runtime >= monitor.constraints.timeoutMs) {
      return {
        type: 'TIMEOUT',
        reason: `Execution timeout after ${runtime}ms`,
        evaluator: () => true,
        timestamp: new Date()
      };
    }

    // Check max turns
    if (scope.executionTurns >= monitor.constraints.maxTurns) {
      return {
        type: 'MAX_TURNS',
        reason: `Maximum turns reached: ${scope.executionTurns}`,
        evaluator: () => true,
        timestamp: new Date()
      };
    }

    // Check resource limits
    const resourceCheck = this._checkResourceLimits(scope, monitor);
    if (resourceCheck) {
      return resourceCheck;
    }

    return null;
  }

  /**
   * Check custom termination conditions
   * @private
   */
  async _checkCustomConditions(scope, monitor) {
    const conditions = monitor.constraints.terminationConditions || [];

    for (const condition of conditions) {
      try {
        const result = await condition.evaluator(scope);
        if (result) {
          return {
            ...condition,
            timestamp: new Date()
          };
        }
      } catch (error) {
        this.logger.warn(`Custom termination condition failed: ${error.message}`);
        
        // If condition evaluation fails consistently, terminate with error
        return {
          type: 'ERROR',
          reason: `Termination condition evaluation error: ${error.message}`,
          evaluator: () => true,
          timestamp: new Date()
        };
      }
    }

    return null;
  }

  /**
   * Check resource limits
   * @private
   */
  _checkResourceLimits(scope, monitor) {
    const limits = monitor.constraints.resourceLimits;
    if (!limits) {
      return null;
    }

    // Check memory usage
    if (limits.maxMemoryMB && scope.resources.memoryUsage > limits.maxMemoryMB) {
      return {
        type: 'RESOURCE_LIMIT',
        reason: `Memory limit exceeded: ${scope.resources.memoryUsage}MB > ${limits.maxMemoryMB}MB`,
        evaluator: () => true,
        timestamp: new Date()
      };
    }

    // Check CPU time
    if (limits.maxCpuTimeMs && scope.resources.cpuTime > limits.maxCpuTimeMs) {
      return {
        type: 'RESOURCE_LIMIT',
        reason: `CPU time limit exceeded: ${scope.resources.cpuTime}ms > ${limits.maxCpuTimeMs}ms`,
        evaluator: () => true,
        timestamp: new Date()
      };
    }

    return null;
  }

  /**
   * Cleanup terminated monitors
   */
  cleanup() {
    const terminated = [];
    
    for (const [scopeId, monitor] of this.monitors.entries()) {
      if (monitor.terminated) {
        terminated.push(scopeId);
      }
    }

    terminated.forEach(scopeId => this.monitors.delete(scopeId));
    
    if (terminated.length > 0) {
      this.logger.debug(`Cleaned up ${terminated.length} terminated monitors`);
    }
  }

  /**
   * Get statistics for all active monitors
   * @returns {Object} Overall monitoring statistics
   */
  getOverallStats() {
    const monitors = Array.from(this.monitors.values());
    
    return {
      activeMonitors: monitors.length,
      terminatedCount: monitors.filter(m => m.terminated).length,
      averageRuntime: monitors.length > 0 
        ? monitors.reduce((sum, m) => sum + (Date.now() - m.startTime), 0) / monitors.length 
        : 0,
      totalChecks: monitors.reduce((sum, m) => sum + m.checkCount, 0)
    };
  }
}