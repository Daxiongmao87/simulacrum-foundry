/**
 * Workflow Standardization - Template Manager
 * Workflow template storage and instantiation system
 */

import { WorkflowTemplate, WorkflowInstance, TaskSpec, ValidationCheckpoint } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class TemplateManager {
  constructor() {
    this.logger = createLogger('TemplateManager');
    this.templates = new Map();
    this.instanceHistory = [];
    this.templateStats = new Map();
    
    this._initializeBuiltInTemplates();
  }

  /**
   * Create workflow instance from template
   * @param {string} templateName - Template identifier
   * @param {TaskSpec} taskSpec - Task specification
   * @param {Object} customizations - Template customizations
   * @returns {WorkflowInstance} Instantiated workflow
   */
  instantiateTemplate(templateName, taskSpec, customizations = {}) {
    try {
      const template = this.templates.get(templateName);
      if (!template) {
        throw new Error(`Workflow template not found: ${templateName}`);
      }

      this.logger.info(`Instantiating workflow template: ${templateName}`);

      const workflowId = `workflow_${templateName}_${Date.now()}`;
      const instance = new WorkflowInstance(workflowId, template, taskSpec);

      this._populateSteps(instance, template, customizations);
      this._populateCheckpoints(instance, template, customizations);
      this._applyCustomizations(instance, customizations);

      this._recordInstanceCreation(instance, templateName);
      this._updateTemplateStats(templateName, 'instantiated');

      this.logger.info(`Workflow instance created: ${workflowId} with ${instance.steps.length} steps`);
      return instance;

    } catch (error) {
      this.logger.error(`Template instantiation failed: ${templateName}`, error);
      throw error;
    }
  }

  /**
   * Register new workflow template
   * @param {WorkflowTemplate} template - Template to register
   * @param {Object} options - Registration options
   */
  registerTemplate(template, options = {}) {
    try {
      this._validateTemplate(template);

      this.templates.set(template.name, {
        ...template,
        registeredAt: Date.now(),
        version: options.version || '1.0.0',
        category: options.category || 'custom',
        author: options.author,
        tags: options.tags || []
      });

      this.templateStats.set(template.name, {
        instantiations: 0,
        successfulCompletions: 0,
        averageCompletionTime: 0,
        commonFailures: []
      });

      this.logger.info(`Registered workflow template: ${template.name}`);

    } catch (error) {
      this.logger.error(`Template registration failed: ${template.name}`, error);
      throw error;
    }
  }

  /**
   * Get available templates with filtering
   * @param {Object} filters - Template filters
   * @returns {Array} Filtered template list
   */
  getAvailableTemplates(filters = {}) {
    const templates = Array.from(this.templates.entries()).map(([name, template]) => ({
      name,
      type: template.type,
      description: template.description,
      category: template.category,
      estimatedDuration: template.estimatedDuration,
      stepCount: template.steps.length,
      checkpointCount: template.checkpoints.length,
      tags: template.tags,
      stats: this.templateStats.get(name)
    }));

    return this._applyFilters(templates, filters);
  }

  /**
   * Get template details
   * @param {string} templateName - Template identifier
   * @returns {Object|null} Template details
   */
  getTemplateDetails(templateName) {
    const template = this.templates.get(templateName);
    if (!template) return null;

    return {
      ...template,
      statistics: this.templateStats.get(templateName),
      recentUsage: this._getRecentUsage(templateName)
    };
  }

  /**
   * Update template based on usage patterns
   * @param {string} templateName - Template identifier
   * @param {Object} usageData - Usage feedback data
   */
  updateTemplateFromUsage(templateName, usageData) {
    try {
      const template = this.templates.get(templateName);
      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      this.logger.info(`Updating template based on usage: ${templateName}`);

      if (usageData.commonFailures) {
        this._updateFailurePatterns(templateName, usageData.commonFailures);
      }

      if (usageData.durationInsights) {
        this._updateDurationEstimates(template, usageData.durationInsights);
      }

      if (usageData.stepOptimizations) {
        this._optimizeSteps(template, usageData.stepOptimizations);
      }

      if (usageData.checkpointImprovements) {
        this._improveCheckpoints(template, usageData.checkpointImprovements);
      }

      template.lastUpdated = Date.now();
      template.version = this._incrementVersion(template.version);

      this.logger.info(`Template updated: ${templateName} to version ${template.version}`);

    } catch (error) {
      this.logger.error(`Template update failed: ${templateName}`, error);
      throw error;
    }
  }

  /**
   * Suggest template for task specification
   * @param {TaskSpec} taskSpec - Task specification
   * @returns {Array} Recommended templates with scores
   */
  suggestTemplates(taskSpec) {
    const suggestions = [];

    for (const [name, template] of this.templates.entries()) {
      const score = this._calculateTemplateScore(template, taskSpec);
      if (score > 0.3) { // Minimum relevance threshold
        suggestions.push({
          name,
          template,
          score,
          reason: this._getMatchReason(template, taskSpec, score)
        });
      }
    }

    return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /**
   * Clone and customize template
   * @param {string} sourceTemplateName - Source template identifier
   * @param {string} newTemplateName - New template name
   * @param {Object} customizations - Template customizations
   * @returns {WorkflowTemplate} New customized template
   */
  cloneTemplate(sourceTemplateName, newTemplateName, customizations = {}) {
    const sourceTemplate = this.templates.get(sourceTemplateName);
    if (!sourceTemplate) {
      throw new Error(`Source template not found: ${sourceTemplateName}`);
    }

    const newTemplate = new WorkflowTemplate(
      newTemplateName,
      customizations.type || sourceTemplate.type,
      customizations.description || `Customized from ${sourceTemplateName}`
    );

    newTemplate.steps = JSON.parse(JSON.stringify(sourceTemplate.steps));
    newTemplate.checkpoints = JSON.parse(JSON.stringify(sourceTemplate.checkpoints));
    newTemplate.dependencies = [...sourceTemplate.dependencies];
    newTemplate.estimatedDuration = sourceTemplate.estimatedDuration;

    if (customizations.additionalSteps) {
      newTemplate.steps.push(...customizations.additionalSteps);
    }

    if (customizations.additionalCheckpoints) {
      newTemplate.checkpoints.push(...customizations.additionalCheckpoints);
    }

    this.registerTemplate(newTemplate, {
      category: 'derived',
      version: '1.0.0',
      author: customizations.author
    });

    this.logger.info(`Cloned template ${sourceTemplateName} as ${newTemplateName}`);
    return newTemplate;
  }

  /**
   * Populate workflow steps from template
   * @private
   */
  _populateSteps(instance, template, customizations) {
    const steps = template.steps.map(stepTemplate => {
      const step = {
        id: stepTemplate.id,
        name: stepTemplate.name,
        type: stepTemplate.type,
        description: stepTemplate.description,
        dependencies: [...(stepTemplate.dependencies || [])],
        estimatedEffort: stepTemplate.estimatedEffort,
        riskLevel: stepTemplate.riskLevel,
        required: stepTemplate.required !== false,
        userFacing: stepTemplate.userFacing === true,
        retryCount: 0,
        status: 'PENDING'
      };

      if (stepTemplate.implementation) {
        step.implementation = stepTemplate.implementation;
      }

      if (stepTemplate.validation) {
        step.validationCriteria = stepTemplate.validation;
      }

      if (stepTemplate.fallback) {
        step.fallback = stepTemplate.fallback;
      }

      return step;
    });

    instance.steps = steps;
  }

  /**
   * Populate workflow checkpoints from template
   * @private
   */
  _populateCheckpoints(instance, template, customizations) {
    const checkpoints = new Map();

    template.checkpoints.forEach((checkpointTemplate, index) => {
      const checkpoint = new ValidationCheckpoint(
        checkpointTemplate.id,
        checkpointTemplate.name,
        checkpointTemplate.description,
        checkpointTemplate.criteria
      );

      checkpoint.stepIndex = checkpointTemplate.stepIndex;
      checkpoint.validationType = checkpointTemplate.validationType;
      checkpoint.timeout = checkpointTemplate.timeout;
      checkpoint.required = checkpointTemplate.required;

      checkpoints.set(checkpoint.id, checkpoint);
    });

    instance.checkpoints = checkpoints;
  }

  /**
   * Apply customizations to workflow instance
   * @private
   */
  _applyCustomizations(instance, customizations) {
    if (customizations.stepModifications) {
      this._applyStepModifications(instance, customizations.stepModifications);
    }

    if (customizations.checkpointModifications) {
      this._applyCheckpointModifications(instance, customizations.checkpointModifications);
    }

    if (customizations.additionalSteps) {
      instance.steps.push(...customizations.additionalSteps);
    }

    if (customizations.skipSteps) {
      this._skipSteps(instance, customizations.skipSteps);
    }
  }

  /**
   * Apply step modifications
   * @private
   */
  _applyStepModifications(instance, modifications) {
    for (const [stepId, mods] of Object.entries(modifications)) {
      const step = instance.steps.find(s => s.id === stepId);
      if (step) {
        Object.assign(step, mods);
      }
    }
  }

  /**
   * Apply checkpoint modifications
   * @private
   */
  _applyCheckpointModifications(instance, modifications) {
    for (const [checkpointId, mods] of Object.entries(modifications)) {
      const checkpoint = instance.checkpoints.get(checkpointId);
      if (checkpoint) {
        Object.assign(checkpoint, mods);
      }
    }
  }

  /**
   * Skip specified steps
   * @private
   */
  _skipSteps(instance, skipSteps) {
    for (const stepId of skipSteps) {
      const step = instance.steps.find(s => s.id === stepId);
      if (step) {
        step.status = 'SKIPPED';
        step.skipReason = 'Skipped by customization';
      }
    }
  }

  /**
   * Validate template structure
   * @private
   */
  _validateTemplate(template) {
    if (!template.name || typeof template.name !== 'string') {
      throw new Error('Template must have a valid name');
    }

    if (!template.type || typeof template.type !== 'string') {
      throw new Error('Template must have a valid type');
    }

    if (!Array.isArray(template.steps) || template.steps.length === 0) {
      throw new Error('Template must have at least one step');
    }

    for (const step of template.steps) {
      if (!step.id || !step.name) {
        throw new Error('Each template step must have an id and name');
      }
    }

    this.logger.debug(`Template validation passed: ${template.name}`);
  }

  /**
   * Apply filters to template list
   * @private
   */
  _applyFilters(templates, filters) {
    let filtered = templates;

    if (filters.type) {
      filtered = filtered.filter(t => t.type === filters.type);
    }

    if (filters.category) {
      filtered = filtered.filter(t => t.category === filters.category);
    }

    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(t => 
        filters.tags.some(tag => t.tags && t.tags.includes(tag))
      );
    }

    if (filters.maxDuration) {
      filtered = filtered.filter(t => t.estimatedDuration <= filters.maxDuration);
    }

    if (filters.maxSteps) {
      filtered = filtered.filter(t => t.stepCount <= filters.maxSteps);
    }

    if (filters.minSuccessRate !== undefined) {
      filtered = filtered.filter(t => {
        const stats = t.stats;
        if (!stats || stats.instantiations === 0) return false;
        const successRate = (stats.successfulCompletions / stats.instantiations) * 100;
        return successRate >= filters.minSuccessRate;
      });
    }

    return filtered;
  }

  /**
   * Calculate template relevance score for task
   * @private
   */
  _calculateTemplateScore(template, taskSpec) {
    let score = 0;

    const taskType = this._inferTaskType(taskSpec);
    if (template.type === taskType) {
      score += 0.4;
    }

    const titleWords = taskSpec.title.toLowerCase().split(/\s+/);
    const templateWords = template.name.toLowerCase().split(/\s+/);
    const commonWords = titleWords.filter(word => templateWords.includes(word));
    score += (commonWords.length / titleWords.length) * 0.3;

    const requirements = taskSpec.requirements.join(' ').toLowerCase();
    const description = template.description.toLowerCase();
    if (description.includes(requirements.substring(0, 50))) {
      score += 0.2;
    }

    // Enhanced keyword matching for bug fixes
    if (taskType === 'bug_fix') {
      const bugKeywords = ['fix', 'debug', 'resolve', 'issue', 'bug', 'error', 'problem'];
      const taskText = `${taskSpec.title} ${taskSpec.description}`.toLowerCase();
      const keywordMatches = bugKeywords.filter(keyword => taskText.includes(keyword)).length;
      score += (keywordMatches / bugKeywords.length) * 0.2;
    }

    const stats = this.templateStats.get(template.name);
    if (stats && stats.instantiations > 0) {
      const successRate = stats.successfulCompletions / stats.instantiations;
      score += successRate * 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Infer task type from specification
   * @private
   */
  _inferTaskType(taskSpec) {
    const combined = `${taskSpec.title} ${taskSpec.description}`.toLowerCase();
    
    if (/\b(fix|debug|resolve|repair)\b/.test(combined)) return 'bug_fix';
    if (/\b(add|implement|create|build|new)\b/.test(combined)) return 'feature_addition';
    if (/\b(refactor|restructure|reorganize)\b/.test(combined)) return 'refactoring';
    if (/\b(test|validate|verify)\b/.test(combined)) return 'testing';
    if (/\b(document|guide|explain)\b/.test(combined)) return 'documentation';
    if (/\b(update|upgrade|maintain)\b/.test(combined)) return 'maintenance';
    
    return 'general';
  }

  /**
   * Get match reason for template suggestion
   * @private
   */
  _getMatchReason(template, taskSpec, score) {
    const reasons = [];
    
    if (template.type === this._inferTaskType(taskSpec)) {
      reasons.push('Task type match');
    }
    
    if (score > 0.7) {
      reasons.push('High relevance score');
    } else if (score > 0.5) {
      reasons.push('Good relevance score');
    }
    
    const stats = this.templateStats.get(template.name);
    if (stats && stats.instantiations > 5) {
      const successRate = (stats.successfulCompletions / stats.instantiations) * 100;
      if (successRate > 80) {
        reasons.push('High success rate');
      }
    }
    
    return reasons.join(', ') || 'General match';
  }

  /**
   * Record instance creation
   * @private
   */
  _recordInstanceCreation(instance, templateName) {
    this.instanceHistory.push({
      workflowId: instance.id,
      templateName,
      created: Date.now(),
      taskTitle: instance.taskSpec.title
    });

    if (this.instanceHistory.length > 1000) {
      this.instanceHistory = this.instanceHistory.slice(-500);
    }
  }

  /**
   * Update template statistics
   * @private
   */
  _updateTemplateStats(templateName, action, data = {}) {
    const stats = this.templateStats.get(templateName);
    if (!stats) return;

    switch (action) {
      case 'instantiated':
        stats.instantiations++;
        break;
        
      case 'completed':
        stats.successfulCompletions++;
        if (data.completionTime) {
          const total = stats.averageCompletionTime * (stats.successfulCompletions - 1) + data.completionTime;
          stats.averageCompletionTime = total / stats.successfulCompletions;
        }
        break;
        
      case 'failed':
        if (data.failureReason) {
          stats.commonFailures.push({
            reason: data.failureReason,
            timestamp: Date.now()
          });
          
          if (stats.commonFailures.length > 10) {
            stats.commonFailures = stats.commonFailures.slice(-5);
          }
        }
        break;
    }
  }

  /**
   * Get recent usage for template
   * @private
   */
  _getRecentUsage(templateName) {
    return this.instanceHistory
      .filter(h => h.templateName === templateName)
      .slice(-10)
      .sort((a, b) => b.created - a.created);
  }

  /**
   * Initialize built-in workflow templates
   * @private
   */
  _initializeBuiltInTemplates() {
    this._createFeatureAdditionTemplate();
    this._createBugFixTemplate();
    this._createRefactoringTemplate();
    this._createTestingTemplate();
    this._createDocumentationTemplate();
    this._createGeneralTemplate();
  }

  /**
   * Create feature addition template
   * @private
   */
  _createFeatureAdditionTemplate() {
    const template = new WorkflowTemplate(
      'feature_addition',
      'feature_addition',
      'Standard workflow for adding new features with MVP approach'
    );

    template.steps = [
      {
        id: 'analyze_requirements',
        name: 'Analyze Requirements',
        type: 'analysis',
        description: 'Analyze and document feature requirements',
        estimatedEffort: 3,
        riskLevel: 'low',
        userFacing: false,
        implementation: { type: 'analysis', analyzer: 'requirements' }
      },
      {
        id: 'design_solution',
        name: 'Design Solution Architecture',
        type: 'design',
        description: 'Design the technical solution and architecture',
        dependencies: ['analyze_requirements'],
        estimatedEffort: 4,
        riskLevel: 'medium',
        userFacing: false
      },
      {
        id: 'implement_core',
        name: 'Implement Core Functionality',
        type: 'implementation',
        description: 'Implement the essential feature functionality',
        dependencies: ['design_solution'],
        estimatedEffort: 6,
        riskLevel: 'medium',
        userFacing: true
      },
      {
        id: 'add_tests',
        name: 'Add Unit Tests',
        type: 'testing',
        description: 'Create comprehensive unit tests for the feature',
        dependencies: ['implement_core'],
        estimatedEffort: 3,
        riskLevel: 'low',
        userFacing: false
      },
      {
        id: 'integration_testing',
        name: 'Integration Testing',
        type: 'testing',
        description: 'Test feature integration with existing system',
        dependencies: ['add_tests'],
        estimatedEffort: 2,
        riskLevel: 'medium',
        userFacing: false
      }
    ];

    template.checkpoints = [
      {
        id: 'requirements_validated',
        name: 'Requirements Validation',
        description: 'Verify requirements are complete and clear',
        stepIndex: 0,
        criteria: [{ type: 'result_exists', key: 'requirements_document' }],
        validationType: 'AUTOMATIC',
        required: true
      },
      {
        id: 'core_functionality_working',
        name: 'Core Functionality Check',
        description: 'Verify core functionality is working correctly',
        stepIndex: 2,
        criteria: [
          { type: 'result_exists', key: 'feature_implemented' },
          { type: 'no_errors' }
        ],
        validationType: 'AUTOMATIC',
        required: true
      }
    ];

    template.estimatedDuration = 18 * 60; // 18 hours in minutes

    this.registerTemplate(template, {
      category: 'built-in',
      version: '1.0.0',
      author: 'Workflow System',
      tags: ['feature', 'development', 'mvp']
    });
  }

  /**
   * Create bug fix template
   * @private
   */
  _createBugFixTemplate() {
    const template = new WorkflowTemplate(
      'bug_fix',
      'bug_fix',
      'Standard workflow for fixing bugs with root cause analysis'
    );

    template.steps = [
      {
        id: 'reproduce_issue',
        name: 'Reproduce Issue',
        type: 'investigation',
        description: 'Reproduce and document the bug behavior',
        estimatedEffort: 2,
        riskLevel: 'low',
        userFacing: false
      },
      {
        id: 'identify_root_cause',
        name: 'Identify Root Cause',
        type: 'investigation',
        description: 'Find the underlying cause of the bug',
        dependencies: ['reproduce_issue'],
        estimatedEffort: 4,
        riskLevel: 'medium',
        userFacing: false
      },
      {
        id: 'implement_fix',
        name: 'Implement Fix',
        type: 'implementation',
        description: 'Implement the bug fix solution',
        dependencies: ['identify_root_cause'],
        estimatedEffort: 3,
        riskLevel: 'medium',
        userFacing: true
      },
      {
        id: 'add_regression_tests',
        name: 'Add Regression Tests',
        type: 'testing',
        description: 'Add tests to prevent regression',
        dependencies: ['implement_fix'],
        estimatedEffort: 2,
        riskLevel: 'low',
        userFacing: false
      },
      {
        id: 'verify_fix',
        name: 'Verify Fix',
        type: 'verification',
        description: 'Verify the bug is completely resolved',
        dependencies: ['add_regression_tests'],
        estimatedEffort: 1,
        riskLevel: 'low',
        userFacing: false
      }
    ];

    template.checkpoints = [
      {
        id: 'bug_reproduced',
        name: 'Bug Reproduction',
        description: 'Confirm bug can be consistently reproduced',
        stepIndex: 0,
        criteria: [{ type: 'result_exists', key: 'reproduction_steps' }],
        validationType: 'AUTOMATIC',
        required: true
      },
      {
        id: 'fix_verified',
        name: 'Fix Verification',
        description: 'Confirm fix resolves the issue',
        stepIndex: 4,
        criteria: [
          { type: 'result_exists', key: 'fix_verified' },
          { type: 'test_passed', testName: 'regression_test' }
        ],
        validationType: 'AUTOMATIC',
        required: true
      }
    ];

    template.estimatedDuration = 12 * 60; // 12 hours in minutes

    this.registerTemplate(template, {
      category: 'built-in',
      version: '1.0.0',
      author: 'Workflow System',
      tags: ['bugfix', 'debugging', 'maintenance']
    });
  }

  /**
   * Create refactoring template
   * @private
   */
  _createRefactoringTemplate() {
    const template = new WorkflowTemplate(
      'refactoring',
      'refactoring',
      'Safe refactoring workflow with comprehensive testing'
    );

    template.steps = [
      {
        id: 'analyze_current_code',
        name: 'Analyze Current Code',
        type: 'analysis',
        description: 'Analyze current code structure and quality',
        estimatedEffort: 4,
        riskLevel: 'low',
        userFacing: false
      },
      {
        id: 'create_safety_tests',
        name: 'Create Safety Tests',
        type: 'testing',
        description: 'Create comprehensive tests before refactoring',
        dependencies: ['analyze_current_code'],
        estimatedEffort: 5,
        riskLevel: 'low',
        userFacing: false
      },
      {
        id: 'refactor_incrementally',
        name: 'Refactor Incrementally',
        type: 'implementation',
        description: 'Perform refactoring in small, safe steps',
        dependencies: ['create_safety_tests'],
        estimatedEffort: 8,
        riskLevel: 'medium',
        userFacing: false
      },
      {
        id: 'validate_refactoring',
        name: 'Validate Refactoring',
        type: 'verification',
        description: 'Ensure refactoring maintains functionality',
        dependencies: ['refactor_incrementally'],
        estimatedEffort: 2,
        riskLevel: 'low',
        userFacing: false
      }
    ];

    template.estimatedDuration = 19 * 60; // 19 hours in minutes

    this.registerTemplate(template, {
      category: 'built-in',
      version: '1.0.0',
      author: 'Workflow System',
      tags: ['refactoring', 'code-quality', 'maintenance']
    });
  }

  /**
   * Create testing template
   * @private
   */
  _createTestingTemplate() {
    const template = new WorkflowTemplate(
      'testing',
      'testing',
      'Comprehensive testing workflow for validation'
    );

    template.steps = [
      {
        id: 'plan_test_strategy',
        name: 'Plan Test Strategy',
        type: 'planning',
        description: 'Define comprehensive test strategy',
        estimatedEffort: 2,
        riskLevel: 'low'
      },
      {
        id: 'create_unit_tests',
        name: 'Create Unit Tests',
        type: 'testing',
        description: 'Implement unit tests for components',
        dependencies: ['plan_test_strategy'],
        estimatedEffort: 4,
        riskLevel: 'low'
      },
      {
        id: 'create_integration_tests',
        name: 'Create Integration Tests',
        type: 'testing',
        description: 'Implement integration tests',
        dependencies: ['create_unit_tests'],
        estimatedEffort: 3,
        riskLevel: 'medium'
      },
      {
        id: 'run_test_suite',
        name: 'Run Complete Test Suite',
        type: 'verification',
        description: 'Execute all tests and analyze results',
        dependencies: ['create_integration_tests'],
        estimatedEffort: 1,
        riskLevel: 'low'
      }
    ];

    template.estimatedDuration = 10 * 60; // 10 hours in minutes

    this.registerTemplate(template, {
      category: 'built-in',
      version: '1.0.0',
      author: 'Workflow System',
      tags: ['testing', 'quality-assurance', 'validation']
    });
  }

  /**
   * Create documentation template
   * @private
   */
  _createDocumentationTemplate() {
    const template = new WorkflowTemplate(
      'documentation',
      'documentation',
      'Documentation creation and maintenance workflow'
    );

    template.steps = [
      {
        id: 'analyze_documentation_needs',
        name: 'Analyze Documentation Needs',
        type: 'analysis',
        description: 'Identify what documentation is needed',
        estimatedEffort: 2,
        riskLevel: 'low'
      },
      {
        id: 'create_structure',
        name: 'Create Documentation Structure',
        type: 'planning',
        description: 'Plan documentation organization and structure',
        dependencies: ['analyze_documentation_needs'],
        estimatedEffort: 1,
        riskLevel: 'low'
      },
      {
        id: 'write_content',
        name: 'Write Documentation Content',
        type: 'implementation',
        description: 'Create the actual documentation content',
        dependencies: ['create_structure'],
        estimatedEffort: 6,
        riskLevel: 'low'
      },
      {
        id: 'review_and_edit',
        name: 'Review and Edit',
        type: 'verification',
        description: 'Review documentation for accuracy and clarity',
        dependencies: ['write_content'],
        estimatedEffort: 2,
        riskLevel: 'low'
      }
    ];

    template.estimatedDuration = 11 * 60; // 11 hours in minutes

    this.registerTemplate(template, {
      category: 'built-in',
      version: '1.0.0',
      author: 'Workflow System',
      tags: ['documentation', 'writing', 'maintenance']
    });
  }

  /**
   * Create general purpose template
   * @private
   */
  _createGeneralTemplate() {
    const template = new WorkflowTemplate(
      'general',
      'general',
      'General purpose workflow for undefined task types'
    );

    template.steps = [
      {
        id: 'understand_requirements',
        name: 'Understand Requirements',
        type: 'analysis',
        description: 'Analyze and understand task requirements',
        estimatedEffort: 2,
        riskLevel: 'low'
      },
      {
        id: 'plan_approach',
        name: 'Plan Approach',
        type: 'planning',
        description: 'Plan the execution approach',
        dependencies: ['understand_requirements'],
        estimatedEffort: 2,
        riskLevel: 'low'
      },
      {
        id: 'implement_solution',
        name: 'Implement Solution',
        type: 'implementation',
        description: 'Execute the planned solution',
        dependencies: ['plan_approach'],
        estimatedEffort: 6,
        riskLevel: 'medium'
      },
      {
        id: 'verify_completion',
        name: 'Verify Completion',
        type: 'verification',
        description: 'Verify task completion and quality',
        dependencies: ['implement_solution'],
        estimatedEffort: 2,
        riskLevel: 'low'
      }
    ];

    template.estimatedDuration = 12 * 60; // 12 hours in minutes

    this.registerTemplate(template, {
      category: 'built-in',
      version: '1.0.0',
      author: 'Workflow System',
      tags: ['general', 'flexible', 'basic']
    });
  }

  /**
   * Get template manager statistics
   * @returns {Object} Template manager statistics
   */
  getManagerStatistics() {
    const totalTemplates = this.templates.size;
    const totalInstantiations = Array.from(this.templateStats.values())
      .reduce((sum, stats) => sum + stats.instantiations, 0);
    
    const successfulCompletions = Array.from(this.templateStats.values())
      .reduce((sum, stats) => sum + stats.successfulCompletions, 0);

    return {
      totalTemplates,
      totalInstantiations,
      successfulCompletions,
      successRate: totalInstantiations > 0 ? (successfulCompletions / totalInstantiations) * 100 : 0,
      recentInstances: this.instanceHistory.length,
      builtInTemplates: Array.from(this.templates.values()).filter(t => t.category === 'built-in').length,
      customTemplates: Array.from(this.templates.values()).filter(t => t.category === 'custom').length
    };
  }
}

export default TemplateManager;