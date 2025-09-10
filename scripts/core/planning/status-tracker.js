/**
 * Enhanced Planning Framework - Status Tracker
 * Manages step status transitions and persistence
 */

import { createLogger } from '../../utils/logger.js';

export class StatusTracker {
  constructor() {
    this.logger = createLogger('StatusTracker');
    this.statusHistory = new Map(); // Track status changes
  }

  /**
   * Validate status transition
   * @param {string} currentStatus - Current step status
   * @param {string} newStatus - Proposed new status
   * @returns {boolean} True if transition is valid
   */
  isValidTransition(currentStatus, newStatus) {
    const validTransitions = {
      'pending': ['in_progress'],
      'in_progress': ['completed', 'pending'], // Can go back to pending if needed
      'completed': [] // Completed steps cannot change status
    };

    if (!validTransitions[currentStatus]) {
      return false;
    }

    return validTransitions[currentStatus].includes(newStatus);
  }

  /**
   * Track a status change
   * @param {string} planId - Plan identifier
   * @param {string} stepId - Step identifier
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {Object} metadata - Additional change metadata
   */
  trackStatusChange(planId, stepId, oldStatus, newStatus, metadata = {}) {
    const key = `${planId}:${stepId}`;
    
    if (!this.statusHistory.has(key)) {
      this.statusHistory.set(key, []);
    }

    const history = this.statusHistory.get(key);
    history.push({
      timestamp: new Date(),
      oldStatus,
      newStatus,
      metadata
    });

    // Keep only last 10 status changes per step to manage memory
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    this.logger.debug(`Status change tracked: ${key} ${oldStatus} -> ${newStatus}`);
  }

  /**
   * Get status history for a step
   * @param {string} planId - Plan identifier
   * @param {string} stepId - Step identifier
   * @returns {Array} Array of status changes
   */
  getStatusHistory(planId, stepId) {
    const key = `${planId}:${stepId}`;
    return this.statusHistory.get(key) || [];
  }

  /**
   * Get completion statistics for a plan
   * @param {Array} steps - Array of plan steps
   * @returns {Object} Statistics about step completion
   */
  getCompletionStats(steps) {
    const total = steps.length;
    const completed = steps.filter(s => s.status === 'completed').length;
    const inProgress = steps.filter(s => s.status === 'in_progress').length;
    const pending = steps.filter(s => s.status === 'pending').length;

    return {
      total,
      completed,
      inProgress,
      pending,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  /**
   * Find next available step that can be started
   * @param {Array} steps - Array of plan steps
   * @returns {Object|null} Next step that can be started, or null
   */
  getNextAvailableStep(steps) {
    // Find steps that are pending and have all dependencies met
    return steps.find(step => {
      if (step.status !== 'pending') {
        return false;
      }

      // Check if all dependencies are completed
      return step.dependencies.every(depId => {
        const depStep = steps.find(s => s.id === depId);
        return depStep && depStep.status === 'completed';
      });
    });
  }

  /**
   * Validate plan consistency
   * @param {Object} plan - Plan to validate
   * @returns {Object} Validation result with any issues found
   */
  validatePlanConsistency(plan) {
    const issues = [];
    const stats = this.getCompletionStats(plan.steps);

    // Check for multiple in-progress steps
    if (stats.inProgress > 1) {
      issues.push('Multiple steps marked as in_progress - only one step should be active at a time');
    }

    // Check for circular dependencies
    const circularDeps = this._findCircularDependencies(plan.steps);
    if (circularDeps.length > 0) {
      issues.push(`Circular dependencies detected: ${circularDeps.join(', ')}`);
    }

    // Check for invalid dependencies
    const invalidDeps = this._findInvalidDependencies(plan.steps);
    if (invalidDeps.length > 0) {
      issues.push(`Invalid dependencies (steps reference non-existent steps): ${invalidDeps.join(', ')}`);
    }

    return {
      valid: issues.length === 0,
      issues,
      stats
    };
  }

  /**
   * Find circular dependencies in plan steps
   * @param {Array} steps - Array of plan steps
   * @returns {Array} Array of step IDs involved in circular dependencies
   */
  _findCircularDependencies(steps) {
    const visited = new Set();
    const recursionStack = new Set();
    const circular = [];

    const dfs = (stepId) => {
      if (recursionStack.has(stepId)) {
        circular.push(stepId);
        return true;
      }
      if (visited.has(stepId)) {
        return false;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (step) {
        for (const depId of step.dependencies) {
          if (dfs(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        dfs(step.id);
      }
    }

    return [...new Set(circular)];
  }

  /**
   * Find invalid dependencies (references to non-existent steps)
   * @param {Array} steps - Array of plan steps
   * @returns {Array} Array of invalid dependency references
   */
  _findInvalidDependencies(steps) {
    const stepIds = new Set(steps.map(s => s.id));
    const invalid = [];

    for (const step of steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          invalid.push(`${step.id} -> ${depId}`);
        }
      }
    }

    return invalid;
  }
}