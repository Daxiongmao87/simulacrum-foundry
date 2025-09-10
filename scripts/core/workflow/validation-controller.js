/**
 * Workflow Standardization - Validation Controller
 * Checkpoint execution and criteria evaluation system
 */

import { ValidationCheckpoint } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class ValidationController {
  constructor() {
    this.logger = createLogger('ValidationController');
    this.activeValidations = new Map();
    this.validationHistory = [];
    this.criteriaTemplates = new Map();
    this.validationStats = {
      totalValidations: 0,
      successfulValidations: 0,
      averageValidationTime: 0,
      commonFailures: new Map()
    };
    
    this._initializeCriteriaTemplates();
  }

  /**
   * Execute validation checkpoint with comprehensive criteria evaluation
   * @param {ValidationCheckpoint} checkpoint - Checkpoint to execute
   * @param {WorkflowInstance} workflowInstance - Current workflow instance
   * @param {Object} context - Additional validation context
   * @returns {Promise<Object>} Validation result
   */
  async executeCheckpoint(checkpoint, workflowInstance, context = {}) {
    const validationId = `${workflowInstance.id}_${checkpoint.id}_${Date.now()}`;
    
    try {
      this.logger.info(`Executing validation checkpoint: ${checkpoint.name}`);
      
      const validation = {
        id: validationId,
        checkpointId: checkpoint.id,
        workflowId: workflowInstance.id,
        startTime: Date.now(),
        status: 'RUNNING',
        results: []
      };
      
      this.activeValidations.set(validationId, validation);
      
      const result = await this._executeValidation(checkpoint, workflowInstance, context, validation);
      
      validation.endTime = Date.now();
      validation.duration = validation.endTime - validation.startTime;
      validation.status = result.success ? 'PASSED' : 'FAILED';
      validation.result = result;
      
      this._recordValidationHistory(validation);
      this._updateValidationStats(validation);
      
      this.logger.info(`Checkpoint validation ${result.success ? 'passed' : 'failed'}: ${checkpoint.name}`);
      return result;
      
    } catch (error) {
      this.logger.error(`Validation checkpoint failed: ${checkpoint.name}`, error);
      
      const validation = this.activeValidations.get(validationId);
      if (validation) {
        validation.status = 'ERROR';
        validation.error = error.message;
        validation.endTime = Date.now();
        validation.duration = validation.endTime - validation.startTime;
      }
      
      return {
        success: false,
        error: error.message,
        details: 'Validation execution failed',
        timestamp: new Date().toISOString()
      };
      
    } finally {
      this.activeValidations.delete(validationId);
    }
  }

  /**
   * Create validation checkpoint from template
   * @param {string} templateName - Template identifier
   * @param {Object} params - Template parameters
   * @returns {ValidationCheckpoint} Created checkpoint
   */
  createCheckpointFromTemplate(templateName, params = {}) {
    const template = this.criteriaTemplates.get(templateName);
    if (!template) {
      throw new Error(`Validation template not found: ${templateName}`);
    }

    const checkpoint = new ValidationCheckpoint(
      params.id || `checkpoint_${Date.now()}`,
      params.name || template.name,
      params.description || template.description,
      template.createCriteria(params)
    );

    checkpoint.validationType = template.validationType || 'AUTOMATIC';
    checkpoint.timeout = params.timeout || template.timeout || 30000;
    checkpoint.required = params.required !== false;

    this.logger.debug(`Created checkpoint from template ${templateName}: ${checkpoint.name}`);
    return checkpoint;
  }

  /**
   * Evaluate completion criteria for workflow
   * @param {CompletionCriteria} completionCriteria - Criteria to evaluate
   * @param {WorkflowInstance} workflowInstance - Workflow instance
   * @returns {Promise<Object>} Evaluation results
   */
  async evaluateCompletionCriteria(completionCriteria, workflowInstance) {
    try {
      this.logger.info(`Evaluating completion criteria for workflow: ${workflowInstance.id}`);
      
      const evaluationResult = await completionCriteria.evaluate(workflowInstance);
      
      this.logger.info(`Completion criteria evaluation: ${evaluationResult.met ? 'MET' : 'NOT MET'}`);
      return evaluationResult;
      
    } catch (error) {
      this.logger.error('Completion criteria evaluation failed:', error);
      return {
        met: false,
        error: error.message,
        details: 'Evaluation process failed'
      };
    }
  }

  /**
   * Execute individual validation
   * @private
   */
  async _executeValidation(checkpoint, workflowInstance, context, validation) {
    const timeout = checkpoint.timeout || 30000;
    
    return await this._withTimeout(
      this._performValidation(checkpoint, workflowInstance, context, validation),
      timeout,
      `Validation timeout: ${checkpoint.name}`
    );
  }

  /**
   * Perform actual validation logic
   * @private
   */
  async _performValidation(checkpoint, workflowInstance, context, validation) {
    const results = [];
    let overallSuccess = true;

    if (typeof checkpoint.criteria === 'function') {
      const result = await this._evaluateFunctionCriteria(checkpoint.criteria, workflowInstance, context);
      results.push(result);
      if (!result.success) overallSuccess = false;
      
    } else if (Array.isArray(checkpoint.criteria)) {
      for (const criterion of checkpoint.criteria) {
        const result = await this._evaluateSingleCriterion(criterion, workflowInstance, context);
        results.push(result);
        if (!result.success) overallSuccess = false;
      }
      
    } else {
      const result = await this._evaluateSingleCriterion(checkpoint.criteria, workflowInstance, context);
      results.push(result);
      if (!result.success) overallSuccess = false;
    }

    validation.results = results;

    return {
      success: overallSuccess,
      results,
      summary: this._createValidationSummary(results),
      timestamp: new Date().toISOString(),
      checkpoint: {
        id: checkpoint.id,
        name: checkpoint.name,
        type: checkpoint.validationType
      }
    };
  }

  /**
   * Evaluate function-based criteria
   * @private
   */
  async _evaluateFunctionCriteria(criteriaFunction, workflowInstance, context) {
    try {
      const result = await criteriaFunction(workflowInstance, context);
      
      if (typeof result === 'boolean') {
        return {
          success: result,
          type: 'function',
          message: result ? 'Function criteria passed' : 'Function criteria failed'
        };
      }
      
      if (typeof result === 'object' && result !== null) {
        return {
          success: result.success !== false,
          type: 'function',
          message: result.message || 'Function criteria evaluated',
          details: result.details,
          data: result.data
        };
      }
      
      return {
        success: true,
        type: 'function',
        message: 'Function criteria completed',
        data: result
      };
      
    } catch (error) {
      return {
        success: false,
        type: 'function',
        message: 'Function criteria failed with error',
        error: error.message
      };
    }
  }

  /**
   * Evaluate single criterion
   * @private
   */
  async _evaluateSingleCriterion(criterion, workflowInstance, context) {
    try {
      if (typeof criterion === 'string') {
        return this._evaluateStringCriterion(criterion, workflowInstance);
      }
      
      if (typeof criterion === 'object' && criterion.type) {
        return await this._evaluateTypedCriterion(criterion, workflowInstance, context);
      }
      
      return {
        success: true,
        type: 'unknown',
        message: 'Unknown criterion type, assumed passing'
      };
      
    } catch (error) {
      return {
        success: false,
        type: 'error',
        message: 'Criterion evaluation failed',
        error: error.message
      };
    }
  }

  /**
   * Evaluate string-based criterion
   * @private
   */
  _evaluateStringCriterion(criterion, workflowInstance) {
    const exists = workflowInstance.results.has(criterion);
    return {
      success: exists,
      type: 'result_exists',
      message: `Result '${criterion}' ${exists ? 'exists' : 'not found'}`,
      criterion: criterion
    };
  }

  /**
   * Evaluate typed criterion with specific validation logic
   * @private
   */
  async _evaluateTypedCriterion(criterion, workflowInstance, context) {
    switch (criterion.type) {
      case 'result_exists':
        return this._validateResultExists(criterion, workflowInstance);
        
      case 'result_equals':
        return this._validateResultEquals(criterion, workflowInstance);
        
      case 'result_contains':
        return this._validateResultContains(criterion, workflowInstance);
        
      case 'no_errors':
        return this._validateNoErrors(criterion, workflowInstance);
        
      case 'progress_min':
        return this._validateProgressMinimum(criterion, workflowInstance);
        
      case 'step_completed':
        return this._validateStepCompleted(criterion, workflowInstance);
        
      case 'file_exists':
        return await this._validateFileExists(criterion, context);
        
      case 'test_passed':
        return await this._validateTestPassed(criterion, workflowInstance, context);
        
      case 'custom':
        return await this._validateCustomCriterion(criterion, workflowInstance, context);
        
      default:
        return {
          success: false,
          type: criterion.type,
          message: `Unknown criterion type: ${criterion.type}`
        };
    }
  }

  /**
   * Validate result exists
   * @private
   */
  _validateResultExists(criterion, workflowInstance) {
    const exists = workflowInstance.results.has(criterion.key);
    return {
      success: exists,
      type: 'result_exists',
      message: `Result '${criterion.key}' ${exists ? 'exists' : 'not found'}`,
      criterion: criterion.key
    };
  }

  /**
   * Validate result equals expected value
   * @private
   */
  _validateResultEquals(criterion, workflowInstance) {
    const value = workflowInstance.results.get(criterion.key);
    const matches = value === criterion.value;
    return {
      success: matches,
      type: 'result_equals',
      message: `Result '${criterion.key}' ${matches ? 'matches' : 'does not match'} expected value`,
      actual: value,
      expected: criterion.value
    };
  }

  /**
   * Validate result contains substring or property
   * @private
   */
  _validateResultContains(criterion, workflowInstance) {
    const value = workflowInstance.results.get(criterion.key);
    let contains = false;
    
    if (typeof value === 'string') {
      contains = value.includes(criterion.substring);
    } else if (Array.isArray(value)) {
      contains = value.includes(criterion.element);
    } else if (typeof value === 'object' && value !== null) {
      contains = criterion.property in value;
    }
    
    return {
      success: contains,
      type: 'result_contains',
      message: `Result '${criterion.key}' ${contains ? 'contains' : 'does not contain'} expected content`,
      value: value
    };
  }

  /**
   * Validate no errors occurred
   * @private
   */
  _validateNoErrors(criterion, workflowInstance) {
    const errorCount = workflowInstance.errors.length;
    const maxErrors = criterion.maxAllowed || 0;
    const success = errorCount <= maxErrors;
    
    return {
      success,
      type: 'no_errors',
      message: `Error count (${errorCount}) is ${success ? 'within' : 'above'} acceptable limit (${maxErrors})`,
      errorCount,
      maxAllowed: maxErrors
    };
  }

  /**
   * Validate minimum progress
   * @private
   */
  _validateProgressMinimum(criterion, workflowInstance) {
    const progress = workflowInstance.getProgress();
    const success = progress >= criterion.threshold;
    
    return {
      success,
      type: 'progress_min',
      message: `Progress (${progress.toFixed(1)}%) is ${success ? 'above' : 'below'} minimum threshold (${criterion.threshold}%)`,
      actual: progress,
      threshold: criterion.threshold
    };
  }

  /**
   * Validate specific step completed
   * @private
   */
  _validateStepCompleted(criterion, workflowInstance) {
    const step = workflowInstance.steps.find(s => s.id === criterion.stepId);
    const completed = step && step.status === 'COMPLETED';
    
    return {
      success: completed,
      type: 'step_completed',
      message: `Step '${criterion.stepId}' is ${completed ? 'completed' : 'not completed'}`,
      stepId: criterion.stepId,
      stepStatus: step?.status || 'not_found'
    };
  }

  /**
   * Validate file exists (simulation)
   * @private
   */
  async _validateFileExists(criterion, context) {
    try {
      const filePath = criterion.path;
      const exists = context.filesystem ? context.filesystem.has(filePath) : Math.random() > 0.2;
      
      return {
        success: exists,
        type: 'file_exists',
        message: `File '${filePath}' ${exists ? 'exists' : 'not found'}`,
        path: filePath
      };
    } catch (error) {
      return {
        success: false,
        type: 'file_exists',
        message: 'File validation failed',
        error: error.message
      };
    }
  }

  /**
   * Validate test passed
   * @private
   */
  async _validateTestPassed(criterion, workflowInstance, context) {
    try {
      const testResults = context.testResults || workflowInstance.results.get('test_results');
      
      if (!testResults) {
        return {
          success: false,
          type: 'test_passed',
          message: 'No test results available',
          testName: criterion.testName
        };
      }
      
      const testResult = Array.isArray(testResults) 
        ? testResults.find(t => t.name === criterion.testName)
        : testResults[criterion.testName];
        
      const passed = testResult && testResult.status === 'passed';
      
      return {
        success: passed,
        type: 'test_passed',
        message: `Test '${criterion.testName}' ${passed ? 'passed' : 'failed'}`,
        testName: criterion.testName,
        testResult: testResult
      };
    } catch (error) {
      return {
        success: false,
        type: 'test_passed',
        message: 'Test validation failed',
        error: error.message
      };
    }
  }

  /**
   * Validate custom criterion
   * @private
   */
  async _validateCustomCriterion(criterion, workflowInstance, context) {
    try {
      if (typeof criterion.validator === 'function') {
        const result = await criterion.validator(workflowInstance, context);
        
        return {
          success: result === true || (typeof result === 'object' && result.success !== false),
          type: 'custom',
          message: criterion.description || 'Custom validation completed',
          customResult: result
        };
      }
      
      return {
        success: false,
        type: 'custom',
        message: 'Custom criterion has no validator function'
      };
    } catch (error) {
      return {
        success: false,
        type: 'custom',
        message: 'Custom validation failed',
        error: error.message
      };
    }
  }

  /**
   * Create validation summary from results
   * @private
   */
  _createValidationSummary(results) {
    const total = results.length;
    const passed = results.filter(r => r.success).length;
    const failed = total - passed;
    
    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total) * 100 : 0,
      details: results.map(r => ({
        type: r.type,
        success: r.success,
        message: r.message
      }))
    };
  }

  /**
   * Execute with timeout wrapper
   * @private
   */
  async _withTimeout(promise, timeoutMs, errorMessage) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    
    return Promise.race([promise, timeout]);
  }

  /**
   * Record validation in history
   * @private
   */
  _recordValidationHistory(validation) {
    this.validationHistory.push({
      id: validation.id,
      checkpointId: validation.checkpointId,
      workflowId: validation.workflowId,
      status: validation.status,
      duration: validation.duration,
      timestamp: validation.endTime
    });

    if (this.validationHistory.length > 1000) {
      this.validationHistory = this.validationHistory.slice(-500);
    }
  }

  /**
   * Update validation statistics
   * @private
   */
  _updateValidationStats(validation) {
    this.validationStats.totalValidations++;
    
    if (validation.status === 'PASSED') {
      this.validationStats.successfulValidations++;
    }
    
    const totalDuration = this.validationHistory.reduce((sum, v) => sum + (v.duration || 0), 0);
    this.validationStats.averageValidationTime = totalDuration / this.validationStats.totalValidations;
    
    if (validation.status === 'FAILED' && validation.result) {
      const failureType = validation.result.results?.[0]?.type || 'unknown';
      const count = this.validationStats.commonFailures.get(failureType) || 0;
      this.validationStats.commonFailures.set(failureType, count + 1);
    }
  }

  /**
   * Initialize criteria templates for common validation patterns
   * @private
   */
  _initializeCriteriaTemplates() {
    this.criteriaTemplates.set('basic_completion', {
      name: 'Basic Completion Check',
      description: 'Validates basic task completion criteria',
      validationType: 'AUTOMATIC',
      timeout: 10000,
      createCriteria: (params) => [
        { type: 'no_errors', maxAllowed: 0 },
        { type: 'progress_min', threshold: 100 }
      ]
    });

    this.criteriaTemplates.set('implementation_quality', {
      name: 'Implementation Quality Check',
      description: 'Validates code quality and implementation standards',
      validationType: 'AUTOMATIC',
      timeout: 30000,
      createCriteria: (params) => [
        { type: 'no_errors' },
        { type: 'test_passed', testName: params.testName || 'implementation_test' },
        { type: 'file_exists', path: params.outputFile }
      ]
    });

    this.criteriaTemplates.set('feature_validation', {
      name: 'Feature Validation',
      description: 'Validates new feature implementation and functionality',
      validationType: 'AUTOMATIC',
      timeout: 60000,
      createCriteria: (params) => [
        { type: 'result_exists', key: 'feature_implemented' },
        { type: 'test_passed', testName: params.featureTest },
        { type: 'step_completed', stepId: 'implement_core' },
        { type: 'no_errors', maxAllowed: 0 }
      ]
    });

    this.criteriaTemplates.set('custom_validation', {
      name: 'Custom Validation',
      description: 'Flexible validation with custom criteria',
      validationType: 'CUSTOM',
      timeout: 45000,
      createCriteria: (params) => [
        {
          type: 'custom',
          description: params.description || 'Custom validation check',
          validator: params.validator || (() => true)
        }
      ]
    });
  }

  /**
   * Get validation statistics
   * @returns {Object} Current validation statistics
   */
  getValidationStatistics() {
    return {
      ...this.validationStats,
      activeValidations: this.activeValidations.size,
      totalHistoryRecords: this.validationHistory.length,
      successRate: this.validationStats.totalValidations > 0 
        ? (this.validationStats.successfulValidations / this.validationStats.totalValidations) * 100 
        : 0,
      availableTemplates: Array.from(this.criteriaTemplates.keys())
    };
  }

  /**
   * Register custom criteria template
   * @param {string} templateName - Template identifier
   * @param {Object} template - Template definition
   */
  registerCriteriaTemplate(templateName, template) {
    this.criteriaTemplates.set(templateName, template);
    this.logger.info(`Registered validation template: ${templateName}`);
  }
}

export default ValidationController;