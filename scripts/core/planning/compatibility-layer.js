/**
 * Enhanced Planning Framework - Compatibility Layer
 * Provides seamless integration with existing TodoWrite tool functionality
 */

import { createLogger } from '../../utils/logger.js';

export class CompatibilityLayer {
  constructor() {
    this.logger = createLogger('CompatibilityLayer');
  }

  /**
   * Convert plan steps to TodoWrite format
   * @param {Object} plan - Plan object with steps
   * @returns {Array} Array in TodoWrite format
   */
  convertToTodoFormat(plan) {
    if (!plan || !plan.steps) {
      return [];
    }

    return plan.steps.map(step => ({
      content: step.content,
      status: step.status,
      activeForm: step.activeForm
    }));
  }

  /**
   * Convert TodoWrite format back to plan steps
   * @param {Array} todos - TodoWrite format array
   * @param {Object} existingPlan - Existing plan for context
   * @returns {Array} Array of plan steps
   */
  convertFromTodoFormat(todos, existingPlan = null) {
    if (!Array.isArray(todos)) {
      return [];
    }

    return todos.map((todo, index) => {
      const existingStep = existingPlan?.steps?.[index];
      
      return {
        id: existingStep?.id || `step_${index + 1}_${Date.now()}`,
        content: todo.content || '',
        activeForm: todo.activeForm || todo.content || '',
        status: todo.status || 'pending',
        dependencies: existingStep?.dependencies || [],
        metadata: existingStep?.metadata || {
          order: index + 1,
          category: 'general'
        }
      };
    });
  }

  /**
   * Check if a TodoWrite update is compatible with planning constraints
   * @param {Array} newTodos - New TodoWrite format
   * @param {Object} currentPlan - Current plan state
   * @returns {Object} Compatibility result
   */
  validateTodoCompatibility(newTodos, currentPlan) {
    const issues = [];
    
    if (!Array.isArray(newTodos)) {
      issues.push('TodoWrite format must be an array');
      return { valid: false, issues };
    }

    // Check for multiple in-progress items
    const inProgressCount = newTodos.filter(t => t.status === 'in_progress').length;
    if (inProgressCount > 1) {
      issues.push('Only one todo can be in_progress at a time');
    }

    // Validate required fields
    newTodos.forEach((todo, index) => {
      if (!todo.content || typeof todo.content !== 'string') {
        issues.push(`Todo ${index + 1} missing required content field`);
      }
      if (!todo.activeForm || typeof todo.activeForm !== 'string') {
        issues.push(`Todo ${index + 1} missing required activeForm field`);
      }
      if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
        issues.push(`Todo ${index + 1} has invalid status: ${todo.status}`);
      }
    });

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Merge TodoWrite updates into existing plan
   * @param {Object} plan - Existing plan
   * @param {Array} todoUpdates - TodoWrite format updates
   * @returns {Object} Updated plan
   */
  mergeTodoUpdates(plan, todoUpdates) {
    const validation = this.validateTodoCompatibility(todoUpdates, plan);
    
    if (!validation.valid) {
      throw new Error(`TodoWrite compatibility issues: ${validation.issues.join(', ')}`);
    }

    // Convert todos back to steps while preserving plan metadata
    const updatedSteps = this.convertFromTodoFormat(todoUpdates, plan);
    
    return {
      ...plan,
      steps: updatedSteps,
      modified: new Date()
    };
  }

  /**
   * Create a legacy TodoWrite tool response from plan state
   * @param {Object} plan - Plan object
   * @param {Object} options - Response options
   * @returns {Object} TodoWrite tool response format
   */
  createTodoResponse(plan, options = {}) {
    const todos = this.convertToTodoFormat(plan);
    
    return {
      todos,
      message: options.message || 'Plan updated successfully',
      planId: plan.id,
      totalSteps: plan.steps.length,
      completedSteps: plan.steps.filter(s => s.status === 'completed').length
    };
  }

  /**
   * Extract plan metadata from TodoWrite operations
   * @param {Object} toolResult - TodoWrite tool result
   * @returns {Object} Extracted metadata for plan tracking
   */
  extractPlanMetadata(toolResult) {
    const metadata = {
      source: 'todowrite',
      timestamp: new Date(),
      operation: 'update'
    };

    // Extract additional context if available
    if (toolResult.planId) {
      metadata.planId = toolResult.planId;
    }
    
    if (toolResult.message) {
      metadata.userMessage = toolResult.message;
    }

    return metadata;
  }

  /**
   * Synchronize with existing TodoWrite state
   * @param {Object} plan - Current plan
   * @param {Object} todoState - External TodoWrite state
   * @returns {Object} Synchronized plan
   */
  synchronizeWithTodoState(plan, todoState) {
    if (!todoState || !Array.isArray(todoState.todos)) {
      this.logger.warn('Invalid TodoWrite state for synchronization');
      return plan;
    }

    try {
      // Preserve plan structure while updating from TodoWrite state
      const updatedPlan = this.mergeTodoUpdates(plan, todoState.todos);
      
      this.logger.info(`Synchronized plan ${plan.id} with TodoWrite state`);
      return updatedPlan;
      
    } catch (error) {
      this.logger.error('Failed to synchronize with TodoWrite state:', error);
      return plan;
    }
  }

  /**
   * Generate TodoWrite-compatible status update
   * @param {Object} plan - Plan object
   * @param {string} stepId - Step that was updated
   * @param {string} action - Action performed ('start', 'complete', 'modify')
   * @returns {Object} Status update for TodoWrite compatibility
   */
  generateStatusUpdate(plan, stepId, action) {
    const step = plan.steps.find(s => s.id === stepId);
    const stepIndex = plan.steps.findIndex(s => s.id === stepId);
    
    return {
      action,
      stepIndex: stepIndex + 1,
      stepId,
      content: step?.content || '',
      status: step?.status || 'pending',
      todos: this.convertToTodoFormat(plan),
      planId: plan.id,
      timestamp: new Date()
    };
  }
}