/**
 * Workflow Standardization - Workflow Engine
 * Core workflow execution and management engine
 */

import { WorkflowInstance, CompletionReport } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class WorkflowEngine {
  constructor() {
    this.logger = createLogger('WorkflowEngine');
    this.activeWorkflows = new Map();
    this.workflowHistory = [];
    this.executionStats = {
      totalExecuted: 0,
      successfulCompletions: 0,
      averageExecutionTime: 0,
      commonFailurePoints: new Map()
    };
  }

  /**
   * Execute a workflow instance with comprehensive monitoring
   * @param {WorkflowInstance} workflowInstance - Workflow to execute
   * @param {Object} options - Execution options
   * @returns {Promise<CompletionReport>} Execution results
   */
  async executeWorkflow(workflowInstance, options = {}) {
    const workflowId = workflowInstance.id;
    
    try {
      this.logger.info(`Starting workflow execution: ${workflowId}`);
      
      workflowInstance.status = 'RUNNING';
      workflowInstance.startTime = Date.now();
      this.activeWorkflows.set(workflowId, workflowInstance);

      while (!workflowInstance.isComplete() && workflowInstance.status === 'RUNNING') {
        const currentStep = workflowInstance.getCurrentStep();
        
        if (!currentStep) {
          this.logger.warn(`No current step available for workflow ${workflowId}`);
          break;
        }

        this.logger.debug(`Executing step ${workflowInstance.currentStep}: ${currentStep.name}`);

        try {
          await this._executeStep(workflowInstance, currentStep, options);
          await this._executeCheckpoints(workflowInstance, currentStep);
          
          workflowInstance.currentStep++;
          workflowInstance.progress = workflowInstance.getProgress();
          
        } catch (stepError) {
          this.logger.error(`Step execution failed in workflow ${workflowId}:`, stepError);
          workflowInstance.addError(stepError);
          
          const recovery = await this._attemptRecovery(workflowInstance, stepError, options);
          if (!recovery.success) {
            workflowInstance.status = 'FAILED';
            break;
          }
        }
      }

      return await this._finalizeWorkflow(workflowInstance);

    } catch (error) {
      this.logger.error(`Workflow execution failed for ${workflowId}:`, error);
      workflowInstance.status = 'FAILED';
      workflowInstance.addError(error);
      return await this._finalizeWorkflow(workflowInstance);
      
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  /**
   * Execute a single workflow step
   * @private
   */
  async _executeStep(workflowInstance, step, options) {
    const stepStartTime = Date.now();
    step.status = 'RUNNING';
    step.startTime = stepStartTime;

    try {
      let result;
      
      if (step.executor && typeof step.executor === 'function') {
        result = await step.executor(workflowInstance, step, options);
      } else if (step.type === 'validation') {
        result = await this._executeValidationStep(workflowInstance, step);
      } else if (step.type === 'dependency_check') {
        result = await this._executeDependencyCheck(workflowInstance, step);
      } else if (step.type === 'implementation') {
        result = await this._executeImplementationStep(workflowInstance, step);
      } else {
        result = { success: true, message: `Simulated execution of ${step.name}` };
      }

      if (result && result.success !== false) {
        step.status = 'COMPLETED';
        step.result = result;
        
        if (result.output) {
          workflowInstance.results.set(step.id, result.output);
        }
        
        this.logger.debug(`Step completed: ${step.name}`);
      } else {
        throw new Error(result?.error || 'Step execution failed');
      }

    } catch (error) {
      step.status = 'FAILED';
      step.error = error.message;
      throw error;
    } finally {
      step.endTime = Date.now();
      step.duration = step.endTime - stepStartTime;
    }
  }

  /**
   * Execute validation checkpoints for a step
   * @private
   */
  async _executeCheckpoints(workflowInstance, step) {
    const stepCheckpoints = Array.from(workflowInstance.checkpoints.values())
      .filter(checkpoint => checkpoint.stepIndex === workflowInstance.currentStep);

    for (const checkpoint of stepCheckpoints) {
      try {
        this.logger.debug(`Executing checkpoint: ${checkpoint.name}`);
        
        const validationResult = await checkpoint.validate(workflowInstance);
        
        if (validationResult.success !== false) {
          checkpoint.status = 'PASSED';
          checkpoint.result = validationResult;
        } else {
          checkpoint.status = 'FAILED';
          checkpoint.error = validationResult.error || 'Validation failed';
          
          if (checkpoint.required) {
            throw new Error(`Required checkpoint failed: ${checkpoint.name} - ${checkpoint.error}`);
          }
        }
        
      } catch (checkpointError) {
        this.logger.error(`Checkpoint validation failed: ${checkpoint.name}`, checkpointError);
        checkpoint.status = 'FAILED';
        checkpoint.error = checkpointError.message;
        
        if (checkpoint.required) {
          throw checkpointError;
        }
      }
    }
  }

  /**
   * Execute validation step
   * @private
   */
  async _executeValidationStep(workflowInstance, step) {
    if (!step.validationCriteria) {
      return { success: true, message: 'No validation criteria specified' };
    }

    const criteria = step.validationCriteria;
    const validationResults = [];

    for (const criterion of criteria) {
      try {
        let result;
        
        if (typeof criterion === 'function') {
          result = await criterion(workflowInstance);
        } else if (criterion.type === 'result_exists') {
          result = workflowInstance.results.has(criterion.key);
        } else if (criterion.type === 'no_errors') {
          result = workflowInstance.errors.length === 0;
        } else {
          result = true;
        }

        validationResults.push({
          criterion: criterion.name || criterion.type || 'unnamed',
          passed: result,
          details: criterion.description
        });

      } catch (error) {
        validationResults.push({
          criterion: criterion.name || 'validation',
          passed: false,
          error: error.message
        });
      }
    }

    const allPassed = validationResults.every(r => r.passed);
    
    return {
      success: allPassed,
      output: { validationResults },
      message: allPassed ? 'All validations passed' : 'Some validations failed'
    };
  }

  /**
   * Execute dependency check step
   * @private
   */
  async _executeDependencyCheck(workflowInstance, step) {
    if (!step.dependencies || step.dependencies.length === 0) {
      return { success: true, message: 'No dependencies to check' };
    }

    const dependencyResults = [];

    for (const dependency of step.dependencies) {
      try {
        let available = false;
        
        if (typeof dependency === 'string') {
          available = workflowInstance.results.has(dependency);
        } else if (dependency.checker && typeof dependency.checker === 'function') {
          available = await dependency.checker(workflowInstance);
        } else if (dependency.type === 'step_completed') {
          const depStep = workflowInstance.steps.find(s => s.id === dependency.stepId);
          available = depStep && depStep.status === 'COMPLETED';
        }

        dependencyResults.push({
          dependency: dependency.name || dependency,
          available,
          required: dependency.required !== false
        });

      } catch (error) {
        dependencyResults.push({
          dependency: dependency.name || dependency,
          available: false,
          required: dependency.required !== false,
          error: error.message
        });
      }
    }

    const requiredDependencies = dependencyResults.filter(d => d.required);
    const allRequiredMet = requiredDependencies.every(d => d.available);

    return {
      success: allRequiredMet,
      output: { dependencyResults },
      message: allRequiredMet ? 'All dependencies available' : 'Missing required dependencies'
    };
  }

  /**
   * Execute implementation step
   * @private
   */
  async _executeImplementationStep(workflowInstance, step) {
    if (!step.implementation) {
      return { success: true, message: 'No implementation specified - simulated execution' };
    }

    if (typeof step.implementation === 'function') {
      return await step.implementation(workflowInstance, step);
    }

    if (step.implementation.type === 'command') {
      return await this._executeCommand(step.implementation.command, workflowInstance);
    }

    if (step.implementation.type === 'template') {
      return await this._executeTemplate(step.implementation, workflowInstance);
    }

    return { success: true, message: 'Implementation step completed' };
  }

  /**
   * Execute command implementation
   * @private
   */
  async _executeCommand(command, workflowInstance) {
    this.logger.debug(`Executing command: ${command}`);
    
    try {
      const result = await this._simulateCommand(command);
      return {
        success: true,
        output: { commandResult: result },
        message: `Command executed: ${command}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Simulate command execution (for testing)
   * @private
   */
  async _simulateCommand(command) {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { stdout: `Simulated output for: ${command}`, exitCode: 0 };
  }

  /**
   * Execute template-based implementation
   * @private
   */
  async _executeTemplate(template, workflowInstance) {
    this.logger.debug(`Executing template: ${template.name}`);
    
    try {
      const context = this._buildTemplateContext(workflowInstance);
      const processedTemplate = this._processTemplate(template.content, context);
      
      return {
        success: true,
        output: { templateResult: processedTemplate },
        message: `Template processed: ${template.name}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build template context from workflow state
   * @private
   */
  _buildTemplateContext(workflowInstance) {
    return {
      workflowId: workflowInstance.id,
      taskTitle: workflowInstance.taskSpec.title,
      currentStep: workflowInstance.currentStep,
      progress: workflowInstance.getProgress(),
      results: Object.fromEntries(workflowInstance.results),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Process template with variable substitution
   * @private
   */
  _processTemplate(template, context) {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const value = context[key.trim()];
      return value !== undefined ? value : match;
    });
  }

  /**
   * Attempt recovery from step failure
   * @private
   */
  async _attemptRecovery(workflowInstance, error, options) {
    this.logger.info(`Attempting recovery for workflow ${workflowInstance.id}`);

    const recoveryStrategies = [
      'retry',
      'skip_optional',
      'fallback_approach',
      'rollback_checkpoint'
    ];

    for (const strategy of recoveryStrategies) {
      try {
        const recovery = await this._executeRecoveryStrategy(strategy, workflowInstance, error, options);
        if (recovery.success) {
          this.logger.info(`Recovery successful using strategy: ${strategy}`);
          return recovery;
        }
      } catch (recoveryError) {
        this.logger.warn(`Recovery strategy ${strategy} failed:`, recoveryError);
      }
    }

    return { success: false, message: 'All recovery strategies exhausted' };
  }

  /**
   * Execute specific recovery strategy
   * @private
   */
  async _executeRecoveryStrategy(strategy, workflowInstance, error, options) {
    const currentStep = workflowInstance.getCurrentStep();
    
    switch (strategy) {
      case 'retry':
        if (currentStep.retryCount < (options.maxRetries || 3)) {
          currentStep.retryCount = (currentStep.retryCount || 0) + 1;
          this.logger.info(`Retrying step (attempt ${currentStep.retryCount})`);
          return { success: true, action: 'retry' };
        }
        break;
        
      case 'skip_optional':
        if (!currentStep.required) {
          currentStep.status = 'SKIPPED';
          currentStep.skipReason = `Skipped due to error: ${error.message}`;
          workflowInstance.currentStep++;
          this.logger.info(`Skipped optional step: ${currentStep.name}`);
          return { success: true, action: 'skip' };
        }
        break;
        
      case 'fallback_approach':
        if (currentStep.fallback) {
          this.logger.info(`Using fallback approach for step: ${currentStep.name}`);
          currentStep.implementation = currentStep.fallback;
          return { success: true, action: 'fallback' };
        }
        break;
        
      case 'rollback_checkpoint':
        const lastCheckpoint = this._findLastValidCheckpoint(workflowInstance);
        if (lastCheckpoint) {
          this.logger.info(`Rolling back to checkpoint: ${lastCheckpoint.name}`);
          workflowInstance.currentStep = lastCheckpoint.stepIndex;
          return { success: true, action: 'rollback' };
        }
        break;
    }

    return { success: false };
  }

  /**
   * Find last valid checkpoint for rollback
   * @private
   */
  _findLastValidCheckpoint(workflowInstance) {
    const checkpoints = Array.from(workflowInstance.checkpoints.values())
      .filter(cp => cp.status === 'PASSED' && cp.stepIndex < workflowInstance.currentStep)
      .sort((a, b) => b.stepIndex - a.stepIndex);
    
    return checkpoints[0] || null;
  }

  /**
   * Finalize workflow execution and generate report
   * @private
   */
  async _finalizeWorkflow(workflowInstance) {
    workflowInstance.endTime = Date.now();
    
    if (workflowInstance.status === 'RUNNING' && workflowInstance.isComplete()) {
      workflowInstance.status = 'COMPLETED';
    }

    const evaluationResults = await this._evaluateCompletion(workflowInstance);
    const report = new CompletionReport(workflowInstance, evaluationResults);

    this.workflowHistory.push({
      workflowId: workflowInstance.id,
      status: workflowInstance.status,
      duration: workflowInstance.endTime - workflowInstance.startTime,
      steps: workflowInstance.steps.length,
      errors: workflowInstance.errors.length
    });

    this._updateExecutionStats(report);

    this.logger.info(`Workflow finalized: ${workflowInstance.id} - Status: ${workflowInstance.status}`);
    return report;
  }

  /**
   * Evaluate workflow completion criteria
   * @private
   */
  async _evaluateCompletion(workflowInstance) {
    const results = {
      met: workflowInstance.isComplete(),
      details: [],
      unmetRequirements: [],
      qualityGatesPassed: 0,
      deliverablesCompleted: 0
    };

    const completionCriteria = workflowInstance.taskSpec.completionCriteria;
    if (completionCriteria) {
      const criteriaResults = await completionCriteria.evaluate(workflowInstance);
      Object.assign(results, criteriaResults);
    }

    results.met = results.met && workflowInstance.errors.length === 0;
    
    return results;
  }

  /**
   * Update execution statistics
   * @private
   */
  _updateExecutionStats(report) {
    this.executionStats.totalExecuted++;
    
    if (report.success) {
      this.executionStats.successfulCompletions++;
    }

    const totalDuration = this.workflowHistory.reduce((sum, h) => sum + h.duration, 0);
    this.executionStats.averageExecutionTime = totalDuration / this.executionStats.totalExecuted;

    if (!report.success && report.errors.length > 0) {
      const lastError = report.errors[report.errors.length - 1];
      const step = lastError.step;
      const count = this.executionStats.commonFailurePoints.get(step) || 0;
      this.executionStats.commonFailurePoints.set(step, count + 1);
    }
  }

  /**
   * Get execution statistics
   * @returns {Object} Current execution statistics
   */
  getExecutionStatistics() {
    return {
      ...this.executionStats,
      activeWorkflows: this.activeWorkflows.size,
      totalWorkflows: this.workflowHistory.length,
      successRate: this.executionStats.totalExecuted > 0 
        ? (this.executionStats.successfulCompletions / this.executionStats.totalExecuted) * 100 
        : 0
    };
  }

  /**
   * Get active workflow status
   * @param {string} workflowId - Workflow identifier
   * @returns {Object|null} Workflow status
   */
  getWorkflowStatus(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return null;

    return {
      id: workflow.id,
      status: workflow.status,
      progress: workflow.getProgress(),
      currentStep: workflow.currentStep,
      totalSteps: workflow.steps.length,
      errors: workflow.errors.length,
      results: workflow.results.size
    };
  }

  /**
   * Force stop a running workflow
   * @param {string} workflowId - Workflow identifier
   * @param {string} reason - Stop reason
   * @returns {boolean} Success status
   */
  forceStop(workflowId, reason = 'Forced stop') {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return false;

    workflow.status = 'STOPPED';
    workflow.addError(new Error(`Workflow stopped: ${reason}`));
    
    this.logger.info(`Workflow ${workflowId} force stopped: ${reason}`);
    return true;
  }
}

export default WorkflowEngine;