/**
 * SubAgent Architecture - Core Interfaces
 * Defines interfaces for SubAgent execution patterns, context management, and termination conditions
 */

/**
 * @typedef {Object} SubAgentConfig
 * @property {string} prompt - SubAgent execution prompt
 * @property {Object} modelSettings - AI model configuration
 * @property {string[]} toolPermissions - Allowed tool names for this SubAgent
 * @property {Object} outputDefinitions - Expected output variable definitions
 * @property {ExecutionConstraints} constraints - Execution limits and termination conditions
 */

/**
 * @typedef {Object} ExecutionConstraints
 * @property {number} timeoutMs - Maximum execution time in milliseconds (default: 900000 = 15 minutes)
 * @property {number} maxTurns - Maximum number of execution turns (default: 50)
 * @property {TerminationCondition[]} terminationConditions - Custom termination conditions
 * @property {Object} resourceLimits - Memory and CPU limits
 */

/**
 * @typedef {Object} TerminationCondition
 * @property {string} type - Condition type: 'GOAL', 'TIMEOUT', 'ERROR', 'MAX_TURNS', 'CUSTOM'
 * @property {Function} evaluator - Function to evaluate if condition is met
 * @property {string} reason - Human-readable reason for termination
 */

/**
 * @typedef {Object} ContextState
 * @property {Map<String, Any>} variables - Template variables for substitution
 * @property {Object} executionHistory - History of execution steps
 * @property {Date} created - Context creation timestamp
 * @property {Date} lastUpdated - Last update timestamp
 */

/**
 * @typedef {Object} SubAgentResult
 * @property {Map<String, Any>} emittedVariables - Variables emitted during execution
 * @property {TerminationInfo} termination - Information about how execution ended
 * @property {Object} executionMetadata - Performance and debugging information
 * @property {ContextState} finalContext - Final context state after execution
 */

/**
 * @typedef {Object} TerminationInfo
 * @property {string} reason - Termination reason code
 * @property {number} executionDuration - Total execution time in milliseconds
 * @property {string} status - Final status: 'SUCCESS', 'TIMEOUT', 'ERROR', 'INTERRUPTED'
 * @property {number} turnsExecuted - Number of execution turns completed
 */

/**
 * Main interface for SubAgent operations
 */
export class ISubAgent {
  /**
   * Initialize SubAgent scope with configuration and context
   * @param {SubAgentConfig} config - SubAgent configuration
   * @param {ContextState} contextState - Initial context state
   * @returns {Promise<SubAgentScope>} Initialized execution scope
   */
  async initializeScope(config, contextState) {
    throw new Error('initializeScope must be implemented');
  }

  /**
   * Execute SubAgent with configured constraints
   * @param {SubAgentScope} scope - Execution scope
   * @returns {Promise<SubAgentResult>} Execution result with emitted variables
   */
  async execute(scope) {
    throw new Error('execute must be implemented');
  }

  /**
   * Emit a variable during execution
   * @param {SubAgentScope} scope - Execution scope
   * @param {string} name - Variable name
   * @param {Any} value - Variable value
   * @returns {Promise<void>}
   */
  async emitVariable(scope, name, value) {
    throw new Error('emitVariable must be implemented');
  }

  /**
   * Check if termination conditions are met
   * @param {SubAgentScope} scope - Execution scope
   * @returns {Promise<TerminationCondition|null>} Met condition or null if should continue
   */
  async checkTermination(scope) {
    throw new Error('checkTermination must be implemented');
  }

  /**
   * Clean up resources and finalize execution
   * @param {SubAgentScope} scope - Execution scope
   * @returns {Promise<void>}
   */
  async cleanup(scope) {
    throw new Error('cleanup must be implemented');
  }
}

/**
 * SubAgent execution scope with resource management
 */
export class SubAgentScope {
  constructor(config, contextState) {
    this.id = `scope_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.config = config;
    this.contextState = contextState;
    this.emittedVariables = new Map();
    this.executionStartTime = null;
    this.executionTurns = 0;
    this.status = 'INITIALIZED';
    this.resources = {
      memoryUsage: 0,
      cpuTime: 0
    };
  }

  /**
   * Start execution timing
   */
  startExecution() {
    this.executionStartTime = Date.now();
    this.status = 'EXECUTING';
  }

  /**
   * Get current execution duration
   * @returns {number} Duration in milliseconds
   */
  getExecutionDuration() {
    return this.executionStartTime ? Date.now() - this.executionStartTime : 0;
  }

  /**
   * Increment turn counter
   */
  incrementTurn() {
    this.executionTurns++;
  }

  /**
   * Check if timeout has been reached
   * @returns {boolean} True if timed out
   */
  isTimedOut() {
    const duration = this.getExecutionDuration();
    return duration >= this.config.constraints.timeoutMs;
  }

  /**
   * Check if max turns reached
   * @returns {boolean} True if max turns exceeded
   */
  isMaxTurnsReached() {
    return this.executionTurns >= this.config.constraints.maxTurns;
  }

  /**
   * Update resource usage
   * @param {Object} usage - Resource usage data
   */
  updateResourceUsage(usage) {
    this.resources = { ...this.resources, ...usage };
  }
}