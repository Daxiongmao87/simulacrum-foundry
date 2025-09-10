/**
 * Enhanced Planning Framework - Message Generator
 * Creates preamble and progress messages for user communication
 */

import { createLogger } from '../../utils/logger.js';

export class MessageGenerator {
  constructor() {
    this.logger = createLogger('MessageGenerator');
  }

  /**
   * Generate preamble message for task initiation
   * @param {Object} plan - Plan object
   * @param {Object} options - Generation options
   * @returns {string} 8-12 word preamble message in friendly tone
   */
  generatePreamble(plan, options = {}) {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return 'I\'ll start by analyzing your task requirements.';
    }

    const nextStep = this._getNextStep(plan);
    if (!nextStep) {
      return 'I\'ll review the completed work and finalize.';
    }

    // Extract action verb and key elements from the step
    const action = this._extractActionPhrase(nextStep.content);
    const preamble = `I'll ${action}.`;

    // Ensure it's within 8-12 words
    const words = preamble.split(' ');
    if (words.length > 12) {
      return `I'll ${words.slice(1, 11).join(' ')}.`;
    }

    return preamble;
  }

  /**
   * Generate progress update message
   * @param {Object} plan - Plan object
   * @param {Object} options - Generation options
   * @returns {string} Progress update message
   */
  generateProgressUpdate(plan, options = {}) {
    const stats = this._calculateStats(plan.steps);
    const currentStep = plan.steps.find(s => s.status === 'in_progress');
    
    let message = `Progress: ${stats.completed}/${stats.total} steps completed`;
    
    if (currentStep) {
      message += ` (${currentStep.activeForm})`;
    } else if (stats.completed === stats.total) {
      message += ' - Task complete!';
    } else {
      const nextStep = this._getNextStep(plan);
      if (nextStep) {
        message += ` (Next: ${nextStep.content.toLowerCase()})`;
      }
    }

    return message;
  }

  /**
   * Generate completion summary
   * @param {Object} plan - Plan object
   * @returns {string} Task completion summary
   */
  generateCompletionSummary(plan) {
    const stats = this._calculateStats(plan.steps);
    const duration = this._calculateDuration(plan);
    
    let summary = `Task completed successfully! `;
    summary += `${stats.completed} steps finished`;
    
    if (duration) {
      summary += ` in ${duration}`;
    }
    
    summary += '.';
    
    // Add any important outcomes or next steps
    const outcomes = this._extractOutcomes(plan);
    if (outcomes.length > 0) {
      summary += ` ${outcomes.join(' ')}`;
    }
    
    return summary;
  }

  /**
   * Generate error recovery message
   * @param {string} error - Error description
   * @param {Object} plan - Plan object
   * @param {string} stepId - Step that failed
   * @returns {string} Recovery guidance message
   */
  generateErrorRecovery(error, plan, stepId) {
    const step = plan.steps.find(s => s.id === stepId);
    const stepDescription = step ? step.content : 'current step';
    
    let message = `Issue encountered with ${stepDescription.toLowerCase()}: ${error}. `;
    
    // Suggest recovery options
    if (step && step.dependencies.length > 0) {
      message += 'I\'ll verify the prerequisites and retry.';
    } else {
      message += 'I\'ll adjust the approach and continue.';
    }
    
    return message;
  }

  /**
   * Generate plan modification message
   * @param {Object} oldPlan - Previous plan state
   * @param {Object} newPlan - New plan state
   * @returns {string} Modification explanation
   */
  generateModificationMessage(oldPlan, newPlan) {
    const oldStepCount = oldPlan.steps.length;
    const newStepCount = newPlan.steps.length;
    
    let message = 'Plan updated: ';
    
    if (newStepCount > oldStepCount) {
      const added = newStepCount - oldStepCount;
      message += `added ${added} step${added === 1 ? '' : 's'}`;
    } else if (newStepCount < oldStepCount) {
      const removed = oldStepCount - newStepCount;
      message += `simplified by ${removed} step${removed === 1 ? '' : 's'}`;
    } else {
      message += 'steps reordered for better efficiency';
    }
    
    message += '. Continuing with updated approach.';
    
    return message;
  }

  /**
   * Get next step to be executed
   * @param {Object} plan - Plan object
   * @returns {Object|null} Next step or null
   */
  _getNextStep(plan) {
    // First check for in-progress step
    let nextStep = plan.steps.find(s => s.status === 'in_progress');
    if (nextStep) return nextStep;
    
    // Then find next pending step with met dependencies
    return plan.steps.find(step => {
      if (step.status !== 'pending') return false;
      
      return step.dependencies.every(depId => {
        const depStep = plan.steps.find(s => s.id === depId);
        return depStep && depStep.status === 'completed';
      });
    });
  }

  /**
   * Extract action phrase from step content
   * @param {string} content - Step content
   * @returns {string} Action phrase for preamble
   */
  _extractActionPhrase(content) {
    // Remove common prefixes and simplify
    let action = content.toLowerCase()
      .replace(/^(create|implement|add|build|develop|write|setup|configure)\s+/, '')
      .replace(/^(analyze|review|check|verify|validate|test)\s+/, 'check ')
      .replace(/^(fix|resolve|address|handle)\s+/, 'fix ')
      .replace(/^(update|modify|change|enhance)\s+/, 'update ');
    
    // Limit to key words for conciseness
    const words = action.split(' ');
    if (words.length > 6) {
      action = words.slice(0, 6).join(' ');
    }
    
    return action;
  }

  /**
   * Calculate statistics from plan steps
   * @param {Array} steps - Array of plan steps
   * @returns {Object} Statistics object
   */
  _calculateStats(steps) {
    return {
      total: steps.length,
      completed: steps.filter(s => s.status === 'completed').length,
      inProgress: steps.filter(s => s.status === 'in_progress').length,
      pending: steps.filter(s => s.status === 'pending').length
    };
  }

  /**
   * Calculate duration from plan timestamps
   * @param {Object} plan - Plan object
   * @returns {string|null} Human-readable duration
   */
  _calculateDuration(plan) {
    if (!plan.created || !plan.modified) return null;
    
    const durationMs = plan.modified - plan.created;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    } else if (seconds > 10) {
      return `${seconds} seconds`;
    }
    
    return null;
  }

  /**
   * Extract important outcomes from completed steps
   * @param {Object} plan - Plan object
   * @returns {Array} Array of outcome descriptions
   */
  _extractOutcomes(plan) {
    const outcomes = [];
    
    // Check for specific step categories that produce notable outcomes
    const implementationSteps = plan.steps.filter(s => 
      s.metadata && s.metadata.category === 'implementation' && s.status === 'completed'
    );
    
    if (implementationSteps.length > 0) {
      outcomes.push('Implementation is ready.');
    }
    
    const testSteps = plan.steps.filter(s => 
      s.metadata && s.metadata.category === 'testing' && s.status === 'completed'
    );
    
    if (testSteps.length > 0) {
      outcomes.push('Testing is complete.');
    }
    
    return outcomes;
  }
}