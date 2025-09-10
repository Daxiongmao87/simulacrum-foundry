/**
 * Enhanced Planning Framework - Main Implementation
 * Orchestrates all planning components and provides the main API
 */

import { PlanningEngine } from './planning-engine.js';
import { StatusTracker } from './status-tracker.js';
import { MessageGenerator } from './message-generator.js';
import { CompatibilityLayer } from './compatibility-layer.js';
import { createLogger } from '../../utils/logger.js';

export class EnhancedPlanningFramework {
  constructor() {
    this.logger = createLogger('EnhancedPlanningFramework');
    this.planningEngine = new PlanningEngine();
    this.statusTracker = new StatusTracker();
    this.messageGenerator = new MessageGenerator();
    this.compatibilityLayer = new CompatibilityLayer();
  }

  /**
   * Main entry point: Create a structured plan from task description
   * @param {string} taskDescription - Natural language task description
   * @param {Object} contextInformation - Project context and existing state
   * @param {Object} options - Planning options
   * @returns {Promise<Object>} Complete planning response
   */
  async createStructuredPlan(taskDescription, contextInformation = {}, options = {}) {
    try {
      // Validate inputs
      this._validateCreatePlanInputs(taskDescription, contextInformation);

      // Create the plan using the planning engine
      const plan = await this.planningEngine.createPlan(taskDescription, contextInformation);
      
      // Validate plan consistency
      const validation = this.statusTracker.validatePlanConsistency(plan);
      if (!validation.valid) {
        throw new Error(`Plan validation failed: ${validation.issues.join(', ')}`);
      }

      // Generate preamble message
      const preambleMessage = this.messageGenerator.generatePreamble(plan);
      
      // Generate initial progress update
      const progressUpdate = this.messageGenerator.generateProgressUpdate(plan);

      // Create TodoWrite-compatible response
      const todoResponse = this.compatibilityLayer.createTodoResponse(plan, {
        message: 'Planning framework initialized'
      });

      const response = {
        structured_plan: plan,
        preamble_message: preambleMessage,
        progress_update: progressUpdate,
        todo_compatibility: todoResponse,
        validation: validation
      };

      this.logger.info(`Created structured plan ${plan.id} with ${plan.steps.length} steps`);
      return response;

    } catch (error) {
      this.logger.error('Error creating structured plan:', error);
      throw new Error(`Planning framework error: ${error.message}`);
    }
  }

  /**
   * Update an existing plan with modifications
   * @param {string} planId - Plan identifier
   * @param {Object} updates - Plan updates to apply
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Updated planning response
   */
  async updatePlan(planId, updates, options = {}) {
    try {
      // Update the plan
      const updatedPlan = await this.planningEngine.updatePlan(planId, updates);
      
      // Validate updated plan
      const validation = this.statusTracker.validatePlanConsistency(updatedPlan);
      if (!validation.valid) {
        this.logger.warn(`Plan validation issues after update: ${validation.issues.join(', ')}`);
      }

      // Generate modification message
      const originalPlan = { steps: [] }; // Would normally get from before update
      const modificationMessage = this.messageGenerator.generateModificationMessage(
        originalPlan, 
        updatedPlan
      );

      // Generate updated progress
      const progressUpdate = this.messageGenerator.generateProgressUpdate(updatedPlan);

      const response = {
        structured_plan: updatedPlan,
        preamble_message: modificationMessage,
        progress_update: progressUpdate,
        validation: validation
      };

      this.logger.info(`Updated plan ${planId}`);
      return response;

    } catch (error) {
      this.logger.error('Error updating plan:', error);
      throw error;
    }
  }

  /**
   * Start execution of a specific step
   * @param {string} planId - Plan identifier
   * @param {string} stepId - Step identifier to start
   * @returns {Promise<Object>} Step execution response
   */
  async startStep(planId, stepId) {
    try {
      // Get current plan to check status transitions
      const currentPlan = this.planningEngine.activePlans.get(planId);
      if (!currentPlan) {
        throw new Error(`Plan ${planId} not found`);
      }

      const step = currentPlan.steps.find(s => s.id === stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found`);
      }

      // Validate status transition
      if (!this.statusTracker.isValidTransition(step.status, 'in_progress')) {
        throw new Error(`Invalid status transition from ${step.status} to in_progress`);
      }

      // Track the status change
      this.statusTracker.trackStatusChange(planId, stepId, step.status, 'in_progress');

      // Start the step
      const updatedPlan = await this.planningEngine.startStep(planId, stepId);
      
      // Generate status update for TodoWrite compatibility
      const statusUpdate = this.compatibilityLayer.generateStatusUpdate(
        updatedPlan, 
        stepId, 
        'start'
      );

      const response = {
        structured_plan: updatedPlan,
        step_started: stepId,
        preamble_message: this.messageGenerator.generatePreamble(updatedPlan),
        progress_update: this.messageGenerator.generateProgressUpdate(updatedPlan),
        status_update: statusUpdate
      };

      this.logger.info(`Started step ${stepId} in plan ${planId}`);
      return response;

    } catch (error) {
      this.logger.error('Error starting step:', error);
      throw error;
    }
  }

  /**
   * Complete execution of a specific step
   * @param {string} planId - Plan identifier
   * @param {string} stepId - Step identifier to complete
   * @returns {Promise<Object>} Step completion response
   */
  async completeStep(planId, stepId) {
    try {
      // Get current plan for status tracking
      const currentPlan = this.planningEngine.activePlans.get(planId);
      if (!currentPlan) {
        throw new Error(`Plan ${planId} not found`);
      }

      const step = currentPlan.steps.find(s => s.id === stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found`);
      }

      // Track the status change
      this.statusTracker.trackStatusChange(planId, stepId, step.status, 'completed');

      // Complete the step
      const updatedPlan = await this.planningEngine.completeStep(planId, stepId);
      
      // Generate appropriate response based on completion status
      let responseMessage;
      if (updatedPlan.status === 'completed') {
        responseMessage = this.messageGenerator.generateCompletionSummary(updatedPlan);
      } else {
        responseMessage = this.messageGenerator.generateProgressUpdate(updatedPlan);
      }

      // Generate status update for TodoWrite compatibility
      const statusUpdate = this.compatibilityLayer.generateStatusUpdate(
        updatedPlan, 
        stepId, 
        'complete'
      );

      const response = {
        structured_plan: updatedPlan,
        step_completed: stepId,
        plan_completed: updatedPlan.status === 'completed',
        progress_update: responseMessage,
        status_update: statusUpdate
      };

      this.logger.info(`Completed step ${stepId} in plan ${planId}`);
      return response;

    } catch (error) {
      this.logger.error('Error completing step:', error);
      throw error;
    }
  }

  /**
   * Handle errors and provide recovery guidance
   * @param {string} planId - Plan identifier
   * @param {string} stepId - Step that encountered error
   * @param {string} error - Error description
   * @returns {Promise<Object>} Error recovery response
   */
  async handleStepError(planId, stepId, error) {
    try {
      const plan = this.planningEngine.activePlans.get(planId);
      if (!plan) {
        throw new Error(`Plan ${planId} not found`);
      }

      // Generate recovery message
      const recoveryMessage = this.messageGenerator.generateErrorRecovery(error, plan, stepId);
      
      // Track error in status history
      this.statusTracker.trackStatusChange(planId, stepId, 'in_progress', 'pending', {
        error: error,
        recovery: true
      });

      // Reset step to pending for retry
      const step = plan.steps.find(s => s.id === stepId);
      if (step) {
        step.status = 'pending';
      }

      const response = {
        structured_plan: plan,
        error_recovery: recoveryMessage,
        failed_step: stepId,
        next_step: this.statusTracker.getNextAvailableStep(plan.steps)?.id || null
      };

      this.logger.warn(`Step error handled for ${stepId}: ${error}`);
      return response;

    } catch (error) {
      this.logger.error('Error handling step error:', error);
      throw error;
    }
  }

  /**
   * Get current plan progress and status
   * @param {string} planId - Plan identifier
   * @returns {Promise<Object>} Current progress information
   */
  async getProgress(planId) {
    try {
      const plan = this.planningEngine.activePlans.get(planId);
      if (!plan) {
        throw new Error(`Plan ${planId} not found`);
      }

      const progress = await this.planningEngine.getProgress(planId);
      const validation = this.statusTracker.validatePlanConsistency(plan);
      const nextStep = this.statusTracker.getNextAvailableStep(plan.steps);

      return {
        plan_id: planId,
        progress_report: progress,
        validation_status: validation,
        next_available_step: nextStep?.id || null,
        plan_status: plan.status
      };

    } catch (error) {
      this.logger.error('Error getting progress:', error);
      throw error;
    }
  }

  /**
   * Integrate with TodoWrite updates
   * @param {string} planId - Plan identifier
   * @param {Array} todoUpdates - TodoWrite format updates
   * @returns {Promise<Object>} Integration response
   */
  async integrateWithTodoWrite(planId, todoUpdates) {
    try {
      const plan = this.planningEngine.activePlans.get(planId);
      if (!plan) {
        throw new Error(`Plan ${planId} not found`);
      }

      // Merge TodoWrite updates into plan
      const updatedPlan = this.compatibilityLayer.mergeTodoUpdates(plan, todoUpdates);
      
      // Update the stored plan
      this.planningEngine.activePlans.set(planId, updatedPlan);

      // Generate response
      const response = {
        structured_plan: updatedPlan,
        integration_success: true,
        progress_update: this.messageGenerator.generateProgressUpdate(updatedPlan)
      };

      this.logger.info(`Integrated TodoWrite updates for plan ${planId}`);
      return response;

    } catch (error) {
      this.logger.error('Error integrating with TodoWrite:', error);
      throw error;
    }
  }

  /**
   * Validate inputs for plan creation
   * @private
   */
  _validateCreatePlanInputs(taskDescription, contextInformation) {
    if (!taskDescription || typeof taskDescription !== 'string') {
      throw new Error('Task description must be a non-empty string');
    }

    if (taskDescription.length < 1 || taskDescription.length > 2000) {
      throw new Error('Task description must be between 1 and 2000 characters');
    }

    if (contextInformation && typeof contextInformation !== 'object') {
      throw new Error('Context information must be an object');
    }
  }
}