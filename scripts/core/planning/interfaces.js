/**
 * Enhanced Planning Framework - Core Interfaces
 * Defines the main interfaces for the planning system following the specification
 */

/**
 * @typedef {Object} PlanStep
 * @property {string} id - Unique identifier for the step
 * @property {string} content - Step description (imperative form)
 * @property {string} activeForm - Step description in present continuous form
 * @property {string} status - Step status: 'pending', 'in_progress', 'completed'
 * @property {string[]} dependencies - Array of step IDs this step depends on
 * @property {Object} metadata - Additional step metadata
 */

/**
 * @typedef {Object} PlanState
 * @property {string} id - Unique plan identifier
 * @property {PlanStep[]} steps - Array of plan steps
 * @property {Object} context - Execution context and variables
 * @property {Date} created - Plan creation timestamp
 * @property {Date} modified - Last modification timestamp
 * @property {string} status - Overall plan status
 */

/**
 * @typedef {Object} ProgressReporter
 * @property {string} message - Progress message
 * @property {number} completedSteps - Number of completed steps
 * @property {number} totalSteps - Total number of steps
 * @property {string} currentStep - Description of current step
 */

/**
 * Main interface for planning operations
 */
export class IPlanningFramework {
  /**
   * Decompose a task into structured plan steps
   * @param {string} taskDescription - Natural language task description
   * @param {Object} contextInformation - Project context and existing state
   * @returns {Promise<PlanState>} Structured plan with steps and dependencies
   */
  async createPlan(taskDescription, contextInformation = {}) {
    throw new Error('createPlan must be implemented');
  }

  /**
   * Update an existing plan with new information
   * @param {string} planId - Existing plan identifier
   * @param {Object} updates - Plan updates to apply
   * @returns {Promise<PlanState>} Updated plan state
   */
  async updatePlan(planId, updates) {
    throw new Error('updatePlan must be implemented');
  }

  /**
   * Mark a step as in progress
   * @param {string} planId - Plan identifier
   * @param {string} stepId - Step identifier
   * @returns {Promise<PlanState>} Updated plan state
   */
  async startStep(planId, stepId) {
    throw new Error('startStep must be implemented');
  }

  /**
   * Mark a step as completed
   * @param {string} planId - Plan identifier
   * @param {string} stepId - Step identifier
   * @returns {Promise<PlanState>} Updated plan state
   */
  async completeStep(planId, stepId) {
    throw new Error('completeStep must be implemented');
  }

  /**
   * Get current progress report
   * @param {string} planId - Plan identifier
   * @returns {Promise<ProgressReporter>} Current progress status
   */
  async getProgress(planId) {
    throw new Error('getProgress must be implemented');
  }

  /**
   * Generate preamble message for user communication
   * @param {PlanState} plan - Current plan state
   * @returns {string} 8-12 word preamble message
   */
  generatePreamble(plan) {
    throw new Error('generatePreamble must be implemented');
  }
}