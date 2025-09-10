/**
 * Workflow Standardization - Main Orchestration Class
 * Complete workflow standardization system with MVP-driven planning and validation
 */

import { IWorkflowStandardization, TaskSpec, WorkflowInstance, CompletionReport } from './interfaces.js';
import WorkflowEngine from './workflow-engine.js';
import MVPDecomposer from './mvp-decomposer.js';
import ValidationController from './validation-controller.js';
import TemplateManager from './template-manager.js';
import DependencyTracker from './dependency-tracker.js';
import { createLogger } from '../../utils/logger.js';

export class WorkflowStandardization extends IWorkflowStandardization {
  constructor() {
    super();
    this.logger = createLogger('WorkflowStandardization');
    
    this.workflowEngine = new WorkflowEngine();
    this.mvpDecomposer = new MVPDecomposer();
    this.validationController = new ValidationController();
    this.templateManager = new TemplateManager();
    this.dependencyTracker = new DependencyTracker();
    
    this.activeWorkflows = new Map();
    this.workflowHistory = [];
    this.systemStats = {
      totalWorkflowsCreated: 0,
      successfulCompletions: 0,
      averageCompletionTime: 0,
      systemStartTime: Date.now()
    };

    this.logger.info('Workflow Standardization system initialized');
  }

  /**
   * Create standardized workflow from task specification
   * @param {TaskSpec} taskSpec - Task specification
   * @param {string} templateName - Optional template name
   * @param {ValidationCriteria} validationCriteria - Validation criteria
   * @param {Object} options - Creation options
   * @returns {Promise<WorkflowInstance>} Created workflow instance
   */
  async createWorkflow(taskSpec, templateName = null, validationCriteria = null, options = {}) {
    try {
      this.logger.info(`Creating workflow for task: ${taskSpec.title}`);
      
      if (!taskSpec.isValid()) {
        throw new Error('Invalid task specification provided');
      }

      const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      let workflowInstance;
      
      if (templateName) {
        workflowInstance = this.templateManager.instantiateTemplate(templateName, taskSpec, options.templateCustomizations);
      } else {
        const suggestedTemplates = this.templateManager.suggestTemplates(taskSpec);
        if (suggestedTemplates.length > 0 && suggestedTemplates[0].score > 0.7) {
          const bestTemplate = suggestedTemplates[0];
          this.logger.info(`Auto-selected template: ${bestTemplate.name} (score: ${bestTemplate.score.toFixed(2)})`);
          workflowInstance = this.templateManager.instantiateTemplate(bestTemplate.name, taskSpec, options.templateCustomizations);
        } else {
          workflowInstance = await this._createWorkflowFromScratch(workflowId, taskSpec, options);
        }
      }

      if (validationCriteria) {
        this._integrateValidationCriteria(workflowInstance, validationCriteria);
      }

      const dependencyTracking = this.dependencyTracker.trackWorkflowDependencies(workflowInstance);
      
      workflowInstance.dependencyTracking = dependencyTracking;
      workflowInstance.createdAt = Date.now();
      workflowInstance.options = options;

      this.activeWorkflows.set(workflowInstance.id, workflowInstance);
      this.systemStats.totalWorkflowsCreated++;

      this.logger.info(`Workflow created successfully: ${workflowInstance.id} with ${workflowInstance.steps.length} steps`);
      
      return workflowInstance;

    } catch (error) {
      this.logger.error(`Workflow creation failed for task: ${taskSpec.title}`, error);
      throw new Error(`Failed to create workflow: ${error.message}`);
    }
  }

  /**
   * Execute workflow with comprehensive monitoring and validation
   * @param {WorkflowInstance} workflowInstance - Workflow to execute
   * @param {Object} options - Execution options
   * @returns {Promise<CompletionReport>} Execution results
   */
  async executeWorkflow(workflowInstance, options = {}) {
    try {
      this.logger.info(`Starting workflow execution: ${workflowInstance.id}`);

      const executionOptions = {
        maxRetries: 3,
        continueOnOptionalFailure: true,
        enableRecovery: true,
        validateCheckpoints: true,
        trackDependencies: true,
        ...options
      };

      workflowInstance.executionStartTime = Date.now();
      
      const report = await this.workflowEngine.executeWorkflow(workflowInstance, executionOptions);
      
      this._recordWorkflowCompletion(workflowInstance, report);
      
      if (report.success) {
        this.systemStats.successfulCompletions++;
      }

      this._updateSystemStats(report);

      this.activeWorkflows.delete(workflowInstance.id);
      
      this.logger.info(`Workflow execution completed: ${workflowInstance.id} - Status: ${report.status}`);
      
      return report;

    } catch (error) {
      this.logger.error(`Workflow execution failed: ${workflowInstance.id}`, error);
      
      const errorReport = new CompletionReport(workflowInstance, {
        met: false,
        error: error.message,
        details: 'Workflow execution failed with unhandled error'
      });
      
      this._recordWorkflowCompletion(workflowInstance, errorReport);
      this.activeWorkflows.delete(workflowInstance.id);
      
      return errorReport;
    }
  }

  /**
   * Validate workflow checkpoint
   * @param {WorkflowInstance} workflowInstance - Workflow instance
   * @param {string} checkpointId - Checkpoint identifier
   * @param {Object} context - Validation context
   * @returns {Promise<Object>} Validation result
   */
  async validateCheckpoint(workflowInstance, checkpointId, context = {}) {
    try {
      const checkpoint = workflowInstance.checkpoints.get(checkpointId);
      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      this.logger.debug(`Validating checkpoint: ${checkpoint.name}`);
      
      const result = await this.validationController.executeCheckpoint(checkpoint, workflowInstance, context);
      
      checkpoint.lastValidated = Date.now();
      checkpoint.validationResult = result;
      
      return result;

    } catch (error) {
      this.logger.error(`Checkpoint validation failed: ${checkpointId}`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get workflow status and progress
   * @param {string} workflowId - Workflow identifier
   * @returns {Object|null} Workflow status
   */
  getWorkflowStatus(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return null;
    }

    const dependencyStatus = this.dependencyTracker.getDependencyStatus(workflowId);
    const engineStatus = this.workflowEngine.getWorkflowStatus(workflowId);

    return {
      id: workflow.id,
      taskTitle: workflow.taskSpec.title,
      status: workflow.status,
      progress: workflow.getProgress(),
      currentStep: workflow.currentStep,
      totalSteps: workflow.steps.length,
      checkpoints: {
        total: workflow.checkpoints.size,
        passed: Array.from(workflow.checkpoints.values()).filter(c => c.status === 'PASSED').length,
        failed: Array.from(workflow.checkpoints.values()).filter(c => c.status === 'FAILED').length
      },
      dependencies: dependencyStatus,
      engine: engineStatus,
      createdAt: workflow.createdAt,
      executionTime: workflow.executionStartTime ? Date.now() - workflow.executionStartTime : 0,
      errors: workflow.errors.length,
      results: workflow.results.size
    };
  }

  /**
   * Pause workflow execution
   * @param {string} workflowId - Workflow identifier
   * @param {string} reason - Pause reason
   * @returns {boolean} Success status
   */
  pauseWorkflow(workflowId, reason = 'Manual pause') {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return false;
    }

    if (workflow.status === 'RUNNING') {
      workflow.status = 'PAUSED';
      workflow.pauseReason = reason;
      workflow.pausedAt = Date.now();
      
      this.logger.info(`Workflow paused: ${workflowId} - ${reason}`);
      return true;
    }

    return false;
  }

  /**
   * Resume paused workflow
   * @param {string} workflowId - Workflow identifier
   * @returns {boolean} Success status
   */
  resumeWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return false;
    }

    if (workflow.status === 'PAUSED') {
      workflow.status = 'RUNNING';
      workflow.resumedAt = Date.now();
      
      if (workflow.pausedAt) {
        workflow.totalPauseTime = (workflow.totalPauseTime || 0) + (workflow.resumedAt - workflow.pausedAt);
      }
      
      this.logger.info(`Workflow resumed: ${workflowId}`);
      return true;
    }

    return false;
  }

  /**
   * Cancel workflow execution
   * @param {string} workflowId - Workflow identifier
   * @param {string} reason - Cancellation reason
   * @returns {boolean} Success status
   */
  cancelWorkflow(workflowId, reason = 'Manual cancellation') {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return false;
    }

    workflow.status = 'CANCELLED';
    workflow.cancelReason = reason;
    workflow.cancelledAt = Date.now();
    
    this.workflowEngine.forceStop(workflowId, reason);
    
    this.logger.info(`Workflow cancelled: ${workflowId} - ${reason}`);
    return true;
  }

  /**
   * Get workflow recovery options for failed workflow
   * @param {string} workflowId - Workflow identifier
   * @returns {Array} Available recovery options
   */
  getWorkflowRecoveryOptions(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow || workflow.status !== 'FAILED') {
      return [];
    }

    const options = [];

    if (workflow.currentStep > 0) {
      options.push({
        type: 'resume_from_current',
        description: 'Resume from current failed step',
        riskLevel: 'medium'
      });

      const lastSuccessfulCheckpoint = this._findLastSuccessfulCheckpoint(workflow);
      if (lastSuccessfulCheckpoint) {
        options.push({
          type: 'rollback_to_checkpoint',
          description: `Rollback to checkpoint: ${lastSuccessfulCheckpoint.name}`,
          checkpoint: lastSuccessfulCheckpoint,
          riskLevel: 'low'
        });
      }
    }

    const currentStep = workflow.getCurrentStep();
    if (currentStep && currentStep.fallback) {
      options.push({
        type: 'use_fallback',
        description: 'Use fallback approach for current step',
        riskLevel: 'low'
      });
    }

    if (workflow.errors.length > 0) {
      const lastError = workflow.errors[workflow.errors.length - 1];
      if (lastError.step !== undefined) {
        options.push({
          type: 'skip_failed_step',
          description: 'Skip failed step and continue',
          riskLevel: 'high',
          warning: 'May result in incomplete functionality'
        });
      }
    }

    return options;
  }

  /**
   * Attempt workflow recovery
   * @param {string} workflowId - Workflow identifier
   * @param {string} recoveryType - Recovery option type
   * @param {Object} options - Recovery options
   * @returns {Promise<boolean>} Recovery success
   */
  async attemptWorkflowRecovery(workflowId, recoveryType, options = {}) {
    try {
      const workflow = this.activeWorkflows.get(workflowId);
      if (!workflow) {
        return false;
      }

      this.logger.info(`Attempting workflow recovery: ${workflowId} using ${recoveryType}`);

      switch (recoveryType) {
        case 'resume_from_current':
          workflow.status = 'RUNNING';
          workflow.errors = [];
          return true;

        case 'rollback_to_checkpoint':
          if (options.checkpoint) {
            workflow.currentStep = options.checkpoint.stepIndex;
            workflow.status = 'RUNNING';
            workflow.errors = [];
            return true;
          }
          return false;

        case 'use_fallback':
          const currentStep = workflow.getCurrentStep();
          if (currentStep && currentStep.fallback) {
            currentStep.implementation = currentStep.fallback;
            workflow.status = 'RUNNING';
            return true;
          }
          return false;

        case 'skip_failed_step':
          workflow.currentStep++;
          workflow.status = 'RUNNING';
          const skippedStep = workflow.steps[workflow.currentStep - 1];
          if (skippedStep) {
            skippedStep.status = 'SKIPPED';
            skippedStep.skipReason = 'Recovery skip';
          }
          return true;

        default:
          return false;
      }

    } catch (error) {
      this.logger.error(`Workflow recovery failed: ${workflowId}`, error);
      return false;
    }
  }

  /**
   * Get system statistics
   * @returns {Object} Comprehensive system statistics
   */
  getSystemStatistics() {
    const engineStats = this.workflowEngine.getExecutionStatistics();
    const validationStats = this.validationController.getValidationStatistics();
    const templateStats = this.templateManager.getManagerStatistics();
    const dependencyStats = this.dependencyTracker.getTrackerStatistics();

    return {
      system: {
        ...this.systemStats,
        uptime: Date.now() - this.systemStats.systemStartTime,
        activeWorkflows: this.activeWorkflows.size,
        totalWorkflowHistory: this.workflowHistory.length,
        successRate: this.systemStats.totalWorkflowsCreated > 0 
          ? (this.systemStats.successfulCompletions / this.systemStats.totalWorkflowsCreated) * 100 
          : 0
      },
      execution: engineStats,
      validation: validationStats,
      templates: templateStats,
      dependencies: dependencyStats
    };
  }

  /**
   * Create workflow from scratch using MVP decomposition
   * @private
   */
  async _createWorkflowFromScratch(workflowId, taskSpec, options) {
    this.logger.info(`Creating custom workflow for: ${taskSpec.title}`);

    const decomposition = this.mvpDecomposer.decomposeTask(taskSpec, options.decompositionOptions);
    
    const workflowInstance = new WorkflowInstance(workflowId, null, taskSpec);
    workflowInstance.steps = decomposition.steps;
    workflowInstance.decomposition = decomposition;

    this._addDefaultCheckpoints(workflowInstance, decomposition);

    return workflowInstance;
  }

  /**
   * Add default validation checkpoints
   * @private
   */
  _addDefaultCheckpoints(workflowInstance, decomposition) {
    const checkpoints = new Map();

    if (decomposition.mvpCore && decomposition.mvpCore.steps.length > 0) {
      const mvpCheckpoint = this.validationController.createCheckpointFromTemplate('basic_completion', {
        id: 'mvp_core_complete',
        name: 'MVP Core Completion',
        description: 'Validate MVP core functionality is complete'
      });
      mvpCheckpoint.stepIndex = decomposition.mvpCore.steps[decomposition.mvpCore.steps.length - 1].id;
      checkpoints.set(mvpCheckpoint.id, mvpCheckpoint);
    }

    const finalCheckpoint = this.validationController.createCheckpointFromTemplate('basic_completion', {
      id: 'workflow_complete',
      name: 'Workflow Completion',
      description: 'Validate complete workflow execution'
    });
    finalCheckpoint.stepIndex = workflowInstance.steps.length - 1;
    checkpoints.set(finalCheckpoint.id, finalCheckpoint);

    workflowInstance.checkpoints = checkpoints;
  }

  /**
   * Integrate validation criteria into workflow
   * @private
   */
  _integrateValidationCriteria(workflowInstance, validationCriteria) {
    for (const checkpoint of validationCriteria.checkpoints) {
      workflowInstance.checkpoints.set(checkpoint.id, checkpoint);
    }

    if (validationCriteria.completionCriteria) {
      workflowInstance.taskSpec.completionCriteria = validationCriteria.completionCriteria;
    }
  }

  /**
   * Record workflow completion
   * @private
   */
  _recordWorkflowCompletion(workflowInstance, report) {
    this.workflowHistory.push({
      workflowId: workflowInstance.id,
      taskTitle: workflowInstance.taskSpec.title,
      status: report.status,
      success: report.success,
      duration: report.duration,
      steps: workflowInstance.steps.length,
      errors: workflowInstance.errors.length,
      completedAt: Date.now()
    });

    if (this.workflowHistory.length > 1000) {
      this.workflowHistory = this.workflowHistory.slice(-500);
    }
  }

  /**
   * Update system statistics
   * @private
   */
  _updateSystemStats(report) {
    if (this.systemStats.totalWorkflowsCreated > 0) {
      const totalDuration = this.workflowHistory.reduce((sum, h) => sum + h.duration, 0);
      this.systemStats.averageCompletionTime = totalDuration / this.systemStats.totalWorkflowsCreated;
    }
  }

  /**
   * Find last successful checkpoint
   * @private
   */
  _findLastSuccessfulCheckpoint(workflow) {
    const checkpoints = Array.from(workflow.checkpoints.values())
      .filter(cp => cp.status === 'PASSED' && cp.stepIndex < workflow.currentStep)
      .sort((a, b) => b.stepIndex - a.stepIndex);
    
    return checkpoints[0] || null;
  }

  /**
   * Cleanup old workflow data
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of cleaned items
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const cutoffTime = Date.now() - maxAge;
    let cleanedUp = 0;

    this.workflowHistory = this.workflowHistory.filter(h => h.completedAt > cutoffTime);
    
    cleanedUp += this.dependencyTracker.cleanupCompletedWorkflows(maxAge);
    
    for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
      if (workflow.createdAt < cutoffTime && 
          ['COMPLETED', 'FAILED', 'CANCELLED'].includes(workflow.status)) {
        this.activeWorkflows.delete(workflowId);
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      this.logger.info(`Cleaned up ${cleanedUp} old workflow records`);
    }

    return cleanedUp;
  }

  /**
   * Export workflow configuration
   * @param {string} workflowId - Workflow identifier
   * @returns {Object|null} Workflow configuration
   */
  exportWorkflowConfiguration(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId) || 
                    this.workflowHistory.find(h => h.workflowId === workflowId);
    
    if (!workflow) {
      return null;
    }

    return {
      taskSpec: workflow.taskSpec,
      steps: workflow.steps,
      checkpoints: Array.from(workflow.checkpoints?.values() || []),
      decomposition: workflow.decomposition,
      options: workflow.options,
      exportedAt: Date.now()
    };
  }

  /**
   * Import and create workflow from configuration
   * @param {Object} config - Workflow configuration
   * @returns {Promise<WorkflowInstance>} Created workflow
   */
  async importWorkflowConfiguration(config) {
    if (!config.taskSpec) {
      throw new Error('Invalid workflow configuration: missing task specification');
    }

    const taskSpec = new TaskSpec(
      config.taskSpec.title,
      config.taskSpec.description,
      config.taskSpec.requirements,
      config.taskSpec.constraints
    );

    const workflowId = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const workflowInstance = new WorkflowInstance(workflowId, null, taskSpec);

    if (config.steps) {
      workflowInstance.steps = config.steps;
    }

    if (config.checkpoints) {
      const checkpointMap = new Map();
      for (const cp of config.checkpoints) {
        checkpointMap.set(cp.id, cp);
      }
      workflowInstance.checkpoints = checkpointMap;
    }

    if (config.decomposition) {
      workflowInstance.decomposition = config.decomposition;
    }

    workflowInstance.options = config.options || {};
    workflowInstance.createdAt = Date.now();

    this.activeWorkflows.set(workflowInstance.id, workflowInstance);
    this.systemStats.totalWorkflowsCreated++;

    this.logger.info(`Imported workflow configuration as: ${workflowInstance.id}`);
    return workflowInstance;
  }
}

export default WorkflowStandardization;