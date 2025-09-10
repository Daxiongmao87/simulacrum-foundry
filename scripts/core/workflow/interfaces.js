/**
 * Workflow Standardization - Core Interfaces
 * Defines interfaces and types for standardized workflow execution
 */

/**
 * Main interface for workflow standardization operations
 */
export class IWorkflowStandardization {
  async createWorkflow(taskSpec, template, validationCriteria) {
    throw new Error('createWorkflow must be implemented');
  }

  async executeWorkflow(workflowInstance, options) {
    throw new Error('executeWorkflow must be implemented');
  }

  async validateCheckpoint(workflowInstance, checkpointId) {
    throw new Error('validateCheckpoint must be implemented');
  }
}

/**
 * Task specification with acceptance criteria and constraints
 */
export class TaskSpec {
  constructor(title, description, requirements = [], constraints = {}) {
    this.title = title;
    this.description = description;
    this.requirements = requirements;
    this.constraints = constraints;
    this.acceptanceCriteria = [];
    this.scope = 'medium';
    this.priority = 'normal';
  }

  addAcceptanceCriteria(criteria) {
    this.acceptanceCriteria.push(criteria);
  }

  isValid() {
    return this.title && this.description && this.requirements.length > 0;
  }
}

/**
 * Workflow template for reusable patterns
 */
export class WorkflowTemplate {
  constructor(name, type, description) {
    this.name = name;
    this.type = type;
    this.description = description;
    this.steps = [];
    this.checkpoints = [];
    this.dependencies = [];
    this.estimatedDuration = 0;
  }

  addStep(step) {
    this.steps.push(step);
  }

  addCheckpoint(checkpoint) {
    this.checkpoints.push(checkpoint);
  }

  addDependency(dependency) {
    this.dependencies.push(dependency);
  }
}

/**
 * Runtime workflow instance with state and progress
 */
export class WorkflowInstance {
  constructor(id, template, taskSpec) {
    this.id = id;
    this.template = template;
    this.taskSpec = taskSpec;
    this.steps = [];
    this.checkpoints = new Map();
    this.currentStep = 0;
    this.status = 'CREATED';
    this.startTime = null;
    this.endTime = null;
    this.progress = 0;
    this.results = new Map();
    this.errors = [];
  }

  getCurrentStep() {
    return this.steps[this.currentStep];
  }

  getProgress() {
    if (this.steps.length === 0) return 0;
    return (this.currentStep / this.steps.length) * 100;
  }

  isComplete() {
    return this.status === 'COMPLETED' || this.currentStep >= this.steps.length;
  }

  addError(error) {
    this.errors.push({
      timestamp: new Date(),
      step: this.currentStep,
      error: error
    });
  }
}

/**
 * Validation checkpoint with configurable criteria
 */
export class ValidationCheckpoint {
  constructor(id, name, description, criteria) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.criteria = criteria;
    this.stepIndex = null;
    this.validationType = 'AUTOMATIC';
    this.timeout = 30000;
    this.required = true;
  }

  async validate(workflowInstance, context = {}) {
    try {
      if (typeof this.criteria === 'function') {
        return await this.criteria(workflowInstance, context);
      }
      
      if (Array.isArray(this.criteria)) {
        return this.criteria.every(criterion => 
          this._evaluateCriterion(criterion, workflowInstance, context)
        );
      }

      return this._evaluateCriterion(this.criteria, workflowInstance, context);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: 'Validation checkpoint failed during execution'
      };
    }
  }

  _evaluateCriterion(criterion, workflowInstance, context) {
    if (typeof criterion === 'string') {
      return workflowInstance.results.has(criterion);
    }
    
    if (typeof criterion === 'object' && criterion.type) {
      switch (criterion.type) {
        case 'result_exists':
          return workflowInstance.results.has(criterion.key);
        case 'result_equals':
          return workflowInstance.results.get(criterion.key) === criterion.value;
        case 'no_errors':
          return workflowInstance.errors.length === 0;
        case 'progress_min':
          return workflowInstance.getProgress() >= criterion.threshold;
        default:
          return true;
      }
    }

    return true;
  }
}

/**
 * Execution plan with ordered tasks and dependencies
 */
export class ExecutionPlan {
  constructor(workflowInstance) {
    this.workflowInstance = workflowInstance;
    this.orderedSteps = [];
    this.dependencies = new Map();
    this.parallelGroups = [];
    this.estimatedDuration = 0;
    this.riskLevel = 'LOW';
  }

  addStep(step, dependencies = []) {
    this.orderedSteps.push(step);
    if (dependencies.length > 0) {
      this.dependencies.set(step.id, dependencies);
    }
  }

  addParallelGroup(steps) {
    this.parallelGroups.push(steps);
  }

  canExecuteStep(stepId) {
    const deps = this.dependencies.get(stepId);
    if (!deps) return true;
    
    return deps.every(depId => 
      this.workflowInstance.results.has(depId) ||
      this._isStepCompleted(depId)
    );
  }

  _isStepCompleted(stepId) {
    const step = this.orderedSteps.find(s => s.id === stepId);
    return step && step.status === 'COMPLETED';
  }
}

/**
 * Completion criteria and success metrics
 */
export class CompletionCriteria {
  constructor(requirements = []) {
    this.requirements = requirements;
    this.successMetrics = [];
    this.qualityGates = [];
    this.deliverables = [];
    this.verificationSteps = [];
  }

  addSuccessMetric(metric) {
    this.successMetrics.push(metric);
  }

  addQualityGate(gate) {
    this.qualityGates.push(gate);
  }

  addDeliverable(deliverable) {
    this.deliverables.push(deliverable);
  }

  addVerificationStep(step) {
    this.verificationSteps.push(step);
  }

  async evaluate(workflowInstance) {
    const results = {
      met: true,
      details: [],
      unmetRequirements: [],
      qualityGatesPassed: 0,
      deliverablesCompleted: 0
    };

    for (const requirement of this.requirements) {
      const isMet = await this._evaluateRequirement(requirement, workflowInstance);
      if (!isMet) {
        results.met = false;
        results.unmetRequirements.push(requirement);
      }
    }

    for (const gate of this.qualityGates) {
      const passed = await this._evaluateQualityGate(gate, workflowInstance);
      if (passed) results.qualityGatesPassed++;
    }

    for (const deliverable of this.deliverables) {
      const completed = await this._evaluateDeliverable(deliverable, workflowInstance);
      if (completed) results.deliverablesCompleted++;
    }

    return results;
  }

  async _evaluateRequirement(requirement, workflowInstance) {
    if (typeof requirement === 'string') {
      return workflowInstance.results.has(requirement);
    }
    
    if (typeof requirement === 'function') {
      return await requirement(workflowInstance);
    }

    return true;
  }

  async _evaluateQualityGate(gate, workflowInstance) {
    try {
      if (typeof gate.validator === 'function') {
        return await gate.validator(workflowInstance);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async _evaluateDeliverable(deliverable, workflowInstance) {
    return workflowInstance.results.has(deliverable.id) ||
           (deliverable.validator && await deliverable.validator(workflowInstance));
  }
}

/**
 * Final completion report with status and metrics
 */
export class CompletionReport {
  constructor(workflowInstance, evaluationResults) {
    this.workflowId = workflowInstance.id;
    this.taskTitle = workflowInstance.taskSpec.title;
    this.status = workflowInstance.status;
    this.startTime = workflowInstance.startTime;
    this.endTime = workflowInstance.endTime;
    this.duration = workflowInstance.endTime - workflowInstance.startTime;
    this.totalSteps = workflowInstance.steps.length;
    this.completedSteps = workflowInstance.currentStep;
    this.progress = workflowInstance.getProgress();
    this.errors = workflowInstance.errors;
    this.results = Array.from(workflowInstance.results.entries());
    this.evaluationResults = evaluationResults;
    this.success = evaluationResults.met && workflowInstance.isComplete();
    this.metrics = this._calculateMetrics(workflowInstance);
  }

  _calculateMetrics(workflowInstance) {
    return {
      stepCompletionRate: (workflowInstance.currentStep / workflowInstance.steps.length) * 100,
      errorRate: workflowInstance.errors.length / workflowInstance.steps.length,
      averageStepDuration: workflowInstance.duration / workflowInstance.currentStep,
      checkpointSuccessRate: this._calculateCheckpointSuccessRate(workflowInstance),
      qualityScore: this._calculateQualityScore(workflowInstance)
    };
  }

  _calculateCheckpointSuccessRate(workflowInstance) {
    const totalCheckpoints = workflowInstance.checkpoints.size;
    if (totalCheckpoints === 0) return 100;
    
    const passedCheckpoints = Array.from(workflowInstance.checkpoints.values())
      .filter(checkpoint => checkpoint.status === 'PASSED').length;
    
    return (passedCheckpoints / totalCheckpoints) * 100;
  }

  _calculateQualityScore(workflowInstance) {
    let score = 100;
    
    score -= workflowInstance.errors.length * 10;
    score += (workflowInstance.getProgress() / 100) * 20;
    
    if (this.evaluationResults.qualityGatesPassed > 0) {
      score += 15;
    }
    
    return Math.max(0, Math.min(100, score));
  }
}

/**
 * Validation criteria for workflow execution
 */
export class ValidationCriteria {
  constructor() {
    this.checkpoints = [];
    this.requirements = [];
    this.qualityGates = [];
    this.completionCriteria = null;
  }

  addCheckpoint(checkpoint) {
    this.checkpoints.push(checkpoint);
  }

  addRequirement(requirement) {
    this.requirements.push(requirement);
  }

  addQualityGate(gate) {
    this.qualityGates.push(gate);
  }

  setCompletionCriteria(criteria) {
    this.completionCriteria = criteria;
  }
}

export default {
  IWorkflowStandardization,
  TaskSpec,
  WorkflowTemplate,
  WorkflowInstance,
  ValidationCheckpoint,
  ExecutionPlan,
  CompletionCriteria,
  CompletionReport,
  ValidationCriteria
};