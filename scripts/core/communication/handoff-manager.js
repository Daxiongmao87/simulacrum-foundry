/**
 * Communication Enhancement - Handoff Manager
 * Work transition and next action recommendation system
 */

import { HandoffInstructions, HandoffProtocol } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class HandoffManager {
  constructor() {
    this.logger = createLogger('HandoffManager');
    this.activeHandoffs = new Map();
    this.handoffHistory = [];
    this.handoffTemplates = new Map();
    this.handoffStats = {
      totalHandoffs: 0,
      successfulTransitions: 0,
      averageHandoffTime: 0,
      commonTransitionTypes: new Map()
    };

    this._initializeHandoffTemplates();
  }

  /**
   * Create comprehensive handoff instructions
   * @param {TaskResults} taskResults - Completed task results
   * @param {Array} nextActions - Recommended next actions
   * @param {CommunicationContext} context - Communication context
   * @returns {Promise<HandoffInstructions>} Generated handoff instructions
   */
  async createHandoffInstructions(taskResults, nextActions = [], context = null) {
    try {
      this.logger.info(`Creating handoff instructions for task: ${taskResults.taskTitle}`);

      const instructions = new HandoffInstructions(taskResults, context);
      
      await this._populateNextActions(instructions, nextActions, taskResults, context);
      await this._generateValidationSteps(instructions, taskResults, context);
      await this._identifyContinuationOptions(instructions, taskResults, context);
      await this._generateRecommendations(instructions, taskResults, context);

      this._recordHandoffCreation(instructions, taskResults);
      this._updateHandoffStats('created');

      this.logger.debug(`Handoff instructions created with ${instructions.nextActions.length} actions, ${instructions.validationSteps.length} validations`);
      return instructions;

    } catch (error) {
      this.logger.error('Handoff instruction creation failed:', error);
      throw error;
    }
  }

  /**
   * Create formal handoff protocol for work transitions
   * @param {string} fromContext - Source context or person
   * @param {string} toContext - Target context or person  
   * @param {TaskResults} taskResults - Task results
   * @param {string} transitionType - Type of transition
   * @param {Object} requirements - Handoff requirements
   * @returns {Promise<HandoffProtocol>} Created handoff protocol
   */
  async createHandoffProtocol(fromContext, toContext, taskResults, transitionType = 'continue', requirements = {}) {
    try {
      this.logger.info(`Creating handoff protocol: ${fromContext} -> ${toContext} (${transitionType})`);

      const protocol = new HandoffProtocol(fromContext, toContext);
      protocol.setTransitionType(transitionType);

      await this._populateHandoffContext(protocol, taskResults, requirements);
      await this._defineHandoffRequirements(protocol, requirements, transitionType);
      
      const instructions = await this.createHandoffInstructions(taskResults, [], requirements.context);
      protocol.instructions = instructions;

      this.activeHandoffs.set(protocol.instructions.taskResults.taskId, protocol);
      this._updateTransitionTypeStats(transitionType);

      this.logger.debug(`Handoff protocol created for ${transitionType} transition`);
      return protocol;

    } catch (error) {
      this.logger.error('Handoff protocol creation failed:', error);
      throw error;
    }
  }

  /**
   * Generate context-aware next actions
   * @param {TaskResults} taskResults - Task results
   * @param {CommunicationContext} context - Communication context
   * @returns {Promise<Array>} Generated next actions
   */
  async generateNextActions(taskResults, context = null) {
    try {
      const actions = [];
      
      // Analyze task results to determine logical next steps
      if (taskResults.isSuccessful()) {
        actions.push(...await this._generateSuccessFollowUpActions(taskResults, context));
      } else {
        actions.push(...await this._generateFailureRecoveryActions(taskResults, context));
      }

      // Add validation actions if needed
      if (taskResults.outputs.size > 0) {
        actions.push(...await this._generateValidationActions(taskResults, context));
      }

      // Add deployment/integration actions if applicable
      if (this._isDeployableResult(taskResults)) {
        actions.push(...await this._generateDeploymentActions(taskResults, context));
      }

      // Add documentation actions if needed
      if (this._needsDocumentation(taskResults)) {
        actions.push(...await this._generateDocumentationActions(taskResults, context));
      }

      // Prioritize actions based on context
      const prioritizedActions = this._prioritizeActions(actions, context);

      this.logger.debug(`Generated ${prioritizedActions.length} next actions for ${taskResults.taskTitle}`);
      return prioritizedActions;

    } catch (error) {
      this.logger.error('Next action generation failed:', error);
      return [];
    }
  }

  /**
   * Validate handoff completeness
   * @param {HandoffInstructions|HandoffProtocol} handoff - Handoff to validate
   * @returns {Object} Validation results
   */
  validateHandoffCompleteness(handoff) {
    const validation = {
      isComplete: true,
      missingElements: [],
      recommendations: [],
      score: 0
    };

    const instructions = handoff.instructions || handoff;

    // Check for essential elements
    if (instructions.nextActions.length === 0) {
      validation.missingElements.push('Next actions not defined');
      validation.isComplete = false;
    } else {
      validation.score += 25;
    }

    if (instructions.validationSteps.length === 0 && instructions.taskResults.outputs.size > 0) {
      validation.missingElements.push('Validation steps missing for outputs');
      validation.recommendations.push('Add validation steps to verify outputs work correctly');
    } else if (instructions.validationSteps.length > 0) {
      validation.score += 25;
    }

    if (instructions.continuationOptions.length === 0) {
      validation.recommendations.push('Consider adding continuation options for future work');
    } else {
      validation.score += 25;
    }

    if (instructions.recommendations.length === 0) {
      validation.recommendations.push('Add recommendations to guide decision making');
    } else {
      validation.score += 25;
    }

    // Check for context information in protocols
    if (handoff instanceof HandoffProtocol) {
      if (handoff.context.size === 0) {
        validation.missingElements.push('Context information missing');
        validation.isComplete = false;
      }

      if (handoff.requirements.length === 0) {
        validation.recommendations.push('Define specific requirements for handoff success');
      }
    }

    return validation;
  }

  /**
   * Track handoff execution and success
   * @param {string} handoffId - Handoff identifier
   * @param {string} status - Execution status
   * @param {Object} feedback - Feedback on handoff effectiveness
   */
  trackHandoffExecution(handoffId, status, feedback = {}) {
    try {
      const handoff = this.activeHandoffs.get(handoffId);
      if (!handoff) {
        this.logger.warn(`Handoff not found for tracking: ${handoffId}`);
        return;
      }

      const executionRecord = {
        handoffId,
        status,
        feedback,
        timestamp: Date.now(),
        duration: Date.now() - (handoff.createdAt || Date.now())
      };

      this.handoffHistory.push(executionRecord);

      if (status === 'completed' || status === 'successful') {
        this.handoffStats.successfulTransitions++;
      }

      this._updateHandoffStats('executed', executionRecord.duration);

      if (status === 'completed') {
        this.activeHandoffs.delete(handoffId);
      }

      this.logger.info(`Handoff execution tracked: ${handoffId} - ${status}`);

    } catch (error) {
      this.logger.error(`Handoff tracking failed for ${handoffId}:`, error);
    }
  }

  /**
   * Get handoff recommendations based on task type and context
   * @param {string} taskType - Type of completed task
   * @param {TaskResults} taskResults - Task results
   * @param {CommunicationContext} context - Communication context
   * @returns {Object} Handoff recommendations
   */
  getHandoffRecommendations(taskType, taskResults, context = null) {
    const recommendations = {
      transitionType: 'continue',
      urgency: 'normal',
      requiredValidations: [],
      suggestedNextActions: [],
      stakeholderNotifications: [],
      riskFactors: []
    };

    // Task type specific recommendations
    switch (taskType) {
      case 'bug_fix':
        recommendations.requiredValidations.push('regression_test', 'affected_functionality_test');
        recommendations.suggestedNextActions.push('Deploy to staging', 'Monitor for related issues');
        recommendations.stakeholderNotifications.push('QA team', 'Product owner');
        break;

      case 'feature_addition':
        recommendations.requiredValidations.push('feature_test', 'integration_test', 'user_acceptance_test');
        recommendations.suggestedNextActions.push('Documentation update', 'User training preparation');
        recommendations.stakeholderNotifications.push('Product team', 'Users', 'Support team');
        break;

      case 'refactoring':
        recommendations.requiredValidations.push('performance_test', 'functionality_preservation_test');
        recommendations.suggestedNextActions.push('Code review', 'Performance monitoring');
        recommendations.stakeholderNotifications.push('Development team');
        break;

      case 'architecture':
        recommendations.transitionType = 'handover';
        recommendations.urgency = 'high';
        recommendations.requiredValidations.push('architecture_review', 'scalability_test');
        recommendations.suggestedNextActions.push('Architecture documentation', 'Team training');
        recommendations.stakeholderNotifications.push('Architecture team', 'Engineering leads');
        break;
    }

    // Context-based adjustments
    if (context && context.sessionContext.urgency === 'high') {
      recommendations.urgency = 'high';
      recommendations.suggestedNextActions.unshift('Immediate validation', 'Fast-track review');
    }

    // Risk factor assessment
    if (taskResults.errors.length > 0) {
      recommendations.riskFactors.push('Partial failure during execution');
      recommendations.requiredValidations.unshift('error_impact_assessment');
    }

    if (taskResults.warnings.length > 0) {
      recommendations.riskFactors.push('Warnings encountered during execution');
    }

    return recommendations;
  }

  /**
   * Populate next actions in handoff instructions
   * @private
   */
  async _populateNextActions(instructions, providedActions, taskResults, context) {
    // Add provided actions
    providedActions.forEach(action => {
      instructions.addNextAction(action);
    });

    // Generate context-aware actions if none provided
    if (providedActions.length === 0) {
      const generatedActions = await this.generateNextActions(taskResults, context);
      generatedActions.forEach(action => {
        instructions.addNextAction(action);
      });
    }
  }

  /**
   * Generate validation steps for handoff
   * @private
   */
  async _generateValidationSteps(instructions, taskResults, context) {
    // Validate outputs
    for (const [key, output] of taskResults.outputs.entries()) {
      instructions.addValidationStep({
        description: `Verify ${key} output is correct and functional`,
        expectedResult: output.description || 'Output works as expected',
        command: this._generateValidationCommand(key, output.value)
      });
    }

    // Validate changes
    if (taskResults.changes.length > 0) {
      instructions.addValidationStep({
        description: 'Verify all changes are applied correctly',
        expectedResult: 'Changes are in place and functioning',
        command: 'Review change log and test affected functionality'
      });
    }

    // System-level validations
    if (this._requiresSystemValidation(taskResults)) {
      instructions.addValidationStep({
        description: 'Run system health check',
        expectedResult: 'All systems operational',
        command: 'Execute system health check script'
      });
    }
  }

  /**
   * Identify continuation options
   * @private
   */
  async _identifyContinuationOptions(instructions, taskResults, context) {
    const taskType = taskResults.metadata.type || 'general';

    // Task-specific continuation options
    switch (taskType) {
      case 'feature_addition':
        instructions.addContinuationOption({
          title: 'Feature Enhancement',
          description: 'Add advanced features or optimizations to the implemented functionality',
          effort: 'medium',
          benefits: ['Enhanced user experience', 'Additional capabilities']
        });
        
        instructions.addContinuationOption({
          title: 'Performance Optimization',
          description: 'Optimize the feature for better performance and scalability',
          effort: 'medium',
          benefits: ['Better performance', 'Scalability improvements']
        });
        break;

      case 'bug_fix':
        instructions.addContinuationOption({
          title: 'Related Issues Investigation',
          description: 'Investigate and fix related or similar issues in the codebase',
          effort: 'high',
          benefits: ['System stability', 'Proactive problem solving']
        });
        break;

      case 'refactoring':
        instructions.addContinuationOption({
          title: 'Extended Refactoring',
          description: 'Continue refactoring other related components for consistency',
          effort: 'high',
          benefits: ['Code consistency', 'Maintainability improvements']
        });
        break;
    }

    // General continuation options
    instructions.addContinuationOption({
      title: 'Testing Enhancement',
      description: 'Add more comprehensive tests for better coverage',
      effort: 'low',
      benefits: ['Better test coverage', 'Increased confidence']
    });

    instructions.addContinuationOption({
      title: 'Documentation Improvement',
      description: 'Create or update documentation for the implemented changes',
      effort: 'low',
      benefits: ['Better maintainability', 'Knowledge sharing']
    });
  }

  /**
   * Generate recommendations for handoff
   * @private
   */
  async _generateRecommendations(instructions, taskResults, context) {
    // Success-based recommendations
    if (taskResults.isSuccessful()) {
      instructions.addRecommendation({
        text: 'Task completed successfully - proceed with validation and deployment',
        priority: 'high',
        reasoning: 'All objectives met without errors'
      });

      if (taskResults.outputs.size > 0) {
        instructions.addRecommendation({
          text: 'Test all generated outputs thoroughly before integration',
          priority: 'high',
          reasoning: 'Ensure outputs work correctly in target environment'
        });
      }
    } else {
      instructions.addRecommendation({
        text: 'Review errors and consider recovery options before proceeding',
        priority: 'high',
        reasoning: 'Task had errors that may affect downstream work'
      });
    }

    // Context-based recommendations
    if (context && context.sessionContext.urgency === 'high') {
      instructions.addRecommendation({
        text: 'Fast-track validation due to high urgency',
        priority: 'high',
        reasoning: 'Urgent timeline requires accelerated process'
      });
    }

    // Warning-based recommendations
    if (taskResults.hasWarnings()) {
      instructions.addRecommendation({
        text: 'Review warnings and assess their impact on system behavior',
        priority: 'medium',
        reasoning: 'Warnings may indicate potential issues'
      });
    }

    // Performance recommendations
    if (taskResults.duration > 30000) { // More than 30 seconds
      instructions.addRecommendation({
        text: 'Consider optimization if this task will be run frequently',
        priority: 'low',
        reasoning: 'Long execution time may impact user experience'
      });
    }
  }

  /**
   * Generate success follow-up actions
   * @private
   */
  async _generateSuccessFollowUpActions(taskResults, context) {
    const actions = [];

    actions.push({
      action: 'Validate implementation completeness',
      priority: 'high',
      estimatedTime: 15,
      description: 'Verify all requirements have been met'
    });

    if (taskResults.outputs.size > 0) {
      actions.push({
        action: 'Test generated outputs',
        priority: 'high',
        estimatedTime: 30,
        description: 'Ensure all outputs function correctly'
      });
    }

    if (taskResults.changes.length > 0) {
      actions.push({
        action: 'Review code changes',
        priority: 'medium',
        estimatedTime: 20,
        description: 'Code review for quality and standards compliance'
      });
    }

    actions.push({
      action: 'Update project documentation',
      priority: 'medium',
      estimatedTime: 25,
      description: 'Document changes and new functionality'
    });

    return actions;
  }

  /**
   * Generate failure recovery actions
   * @private
   */
  async _generateFailureRecoveryActions(taskResults, context) {
    const actions = [];

    actions.push({
      action: 'Analyze failure causes',
      priority: 'high',
      estimatedTime: 30,
      description: 'Investigate what went wrong and why'
    });

    if (taskResults.outputs.size > 0) {
      actions.push({
        action: 'Salvage partial results',
        priority: 'medium',
        estimatedTime: 20,
        description: 'Identify and preserve any useful partial outputs'
      });
    }

    actions.push({
      action: 'Plan recovery strategy',
      priority: 'high',
      estimatedTime: 25,
      description: 'Determine best approach to complete the task'
    });

    actions.push({
      action: 'Implement fixes and retry',
      priority: 'high',
      estimatedTime: 60,
      description: 'Apply fixes and re-attempt the task'
    });

    return actions;
  }

  /**
   * Generate validation actions
   * @private
   */
  async _generateValidationActions(taskResults, context) {
    const actions = [];

    for (const [key, output] of taskResults.outputs.entries()) {
      actions.push({
        action: `Validate ${key} output`,
        priority: 'high',
        estimatedTime: 10,
        description: `Test and verify ${key} works as expected`
      });
    }

    return actions;
  }

  /**
   * Generate deployment actions
   * @private
   */
  async _generateDeploymentActions(taskResults, context) {
    const actions = [];

    actions.push({
      action: 'Prepare deployment package',
      priority: 'medium',
      estimatedTime: 20,
      description: 'Package changes for deployment'
    });

    actions.push({
      action: 'Deploy to staging environment',
      priority: 'high',
      estimatedTime: 15,
      description: 'Deploy and test in staging'
    });

    actions.push({
      action: 'Plan production deployment',
      priority: 'medium',
      estimatedTime: 30,
      description: 'Schedule and prepare production deployment'
    });

    return actions;
  }

  /**
   * Generate documentation actions
   * @private
   */
  async _generateDocumentationActions(taskResults, context) {
    const actions = [];

    actions.push({
      action: 'Update technical documentation',
      priority: 'medium',
      estimatedTime: 40,
      description: 'Document technical changes and architecture'
    });

    if (this._isUserFacing(taskResults)) {
      actions.push({
        action: 'Update user documentation',
        priority: 'medium',
        estimatedTime: 30,
        description: 'Update user guides and help documentation'
      });
    }

    return actions;
  }

  /**
   * Prioritize actions based on context
   * @private
   */
  _prioritizeActions(actions, context) {
    return actions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const aPriority = priorityOrder[a.priority] || 1;
      const bPriority = priorityOrder[b.priority] || 1;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Secondary sort by estimated time (shorter first)
      return (a.estimatedTime || 0) - (b.estimatedTime || 0);
    });
  }

  /**
   * Check if result is deployable
   * @private
   */
  _isDeployableResult(taskResults) {
    return taskResults.changes.length > 0 || 
           Array.from(taskResults.outputs.keys()).some(key => 
             ['deployment', 'build', 'package', 'release'].some(term => 
               key.toLowerCase().includes(term)
             )
           );
  }

  /**
   * Check if result needs documentation
   * @private
   */
  _needsDocumentation(taskResults) {
    return taskResults.changes.length > 0 || 
           taskResults.outputs.size > 0 ||
           taskResults.metadata.type === 'feature_addition';
  }

  /**
   * Check if result requires system validation
   * @private
   */
  _requiresSystemValidation(taskResults) {
    return taskResults.changes.some(change => 
      ['configuration', 'system', 'infrastructure'].some(term =>
        change.type && change.type.toLowerCase().includes(term)
      )
    );
  }

  /**
   * Check if result is user-facing
   * @private
   */
  _isUserFacing(taskResults) {
    return taskResults.outputs.has('user_interface') ||
           taskResults.outputs.has('frontend') ||
           taskResults.changes.some(change => 
             change.description && change.description.toLowerCase().includes('user')
           );
  }

  /**
   * Generate validation command for output
   * @private
   */
  _generateValidationCommand(key, value) {
    const lowerKey = key.toLowerCase();
    
    if (lowerKey.includes('file') || lowerKey.includes('script')) {
      return `Execute and test: ${value}`;
    }
    
    if (lowerKey.includes('config')) {
      return `Validate configuration: ${value}`;
    }
    
    if (lowerKey.includes('api') || lowerKey.includes('service')) {
      return `Test API/service functionality: ${value}`;
    }
    
    return `Verify output: ${value}`;
  }

  /**
   * Populate handoff context
   * @private
   */
  async _populateHandoffContext(protocol, taskResults, requirements) {
    protocol.addContextItem('task_id', taskResults.taskId, 'Unique identifier for the completed task');
    protocol.addContextItem('task_title', taskResults.taskTitle, 'Title/description of completed work');
    protocol.addContextItem('completion_status', taskResults.status, 'Final status of task execution');
    protocol.addContextItem('duration', taskResults.duration, 'Time taken to complete task (ms)');
    
    if (taskResults.outputs.size > 0) {
      protocol.addContextItem('outputs_generated', taskResults.outputs.size, 'Number of outputs produced');
      const outputList = Array.from(taskResults.outputs.keys()).join(', ');
      protocol.addContextItem('output_types', outputList, 'Types of outputs generated');
    }
    
    if (taskResults.changes.length > 0) {
      protocol.addContextItem('changes_made', taskResults.changes.length, 'Number of changes implemented');
    }
    
    if (requirements.priority) {
      protocol.addContextItem('priority_level', requirements.priority, 'Priority level for follow-up work');
    }
    
    if (requirements.deadline) {
      protocol.addContextItem('deadline', requirements.deadline, 'Deadline for next phase');
    }
  }

  /**
   * Define handoff requirements
   * @private
   */
  async _defineHandoffRequirements(protocol, requirements, transitionType) {
    // Basic requirements for all transitions
    protocol.addRequirement({
      description: 'Review handoff instructions thoroughly',
      priority: 'high',
      mandatory: true
    });

    protocol.addRequirement({
      description: 'Validate all outputs before proceeding',
      priority: 'high', 
      mandatory: true
    });

    // Transition-specific requirements
    switch (transitionType) {
      case 'handover':
        protocol.addRequirement({
          description: 'Complete knowledge transfer session',
          priority: 'high',
          mandatory: true
        });
        
        protocol.addRequirement({
          description: 'Document any domain-specific knowledge',
          priority: 'medium',
          mandatory: false
        });
        break;
        
      case 'pause':
        protocol.addRequirement({
          description: 'Document current state and progress',
          priority: 'high',
          mandatory: true
        });
        
        protocol.addRequirement({
          description: 'Plan resumption strategy',
          priority: 'medium',
          mandatory: false
        });
        break;
        
      case 'complete':
        protocol.addRequirement({
          description: 'Perform final quality check',
          priority: 'high',
          mandatory: true
        });
        
        protocol.addRequirement({
          description: 'Archive work products appropriately',
          priority: 'medium',
          mandatory: false
        });
        break;
    }

    // Custom requirements from input
    if (requirements.customRequirements) {
      requirements.customRequirements.forEach(req => {
        protocol.addRequirement(req);
      });
    }
  }

  /**
   * Record handoff creation
   * @private
   */
  _recordHandoffCreation(instructions, taskResults) {
    this.handoffHistory.push({
      type: 'creation',
      taskId: taskResults.taskId,
      taskTitle: taskResults.taskTitle,
      actionsCount: instructions.nextActions.length,
      validationsCount: instructions.validationSteps.length,
      timestamp: Date.now()
    });
  }

  /**
   * Update handoff statistics
   * @private
   */
  _updateHandoffStats(action, duration = 0) {
    if (action === 'created') {
      this.handoffStats.totalHandoffs++;
    }
    
    if (action === 'executed' && duration > 0) {
      const totalTime = this.handoffStats.averageHandoffTime * (this.handoffStats.totalHandoffs - 1) + duration;
      this.handoffStats.averageHandoffTime = totalTime / this.handoffStats.totalHandoffs;
    }
  }

  /**
   * Update transition type statistics
   * @private
   */
  _updateTransitionTypeStats(transitionType) {
    const currentCount = this.handoffStats.commonTransitionTypes.get(transitionType) || 0;
    this.handoffStats.commonTransitionTypes.set(transitionType, currentCount + 1);
  }

  /**
   * Initialize handoff templates
   * @private
   */
  _initializeHandoffTemplates() {
    this.handoffTemplates.set('standard', {
      name: 'Standard Handoff',
      description: 'General purpose handoff template',
      requiredSections: ['next_actions', 'validations', 'context'],
      optionalSections: ['continuations', 'recommendations']
    });

    this.handoffTemplates.set('critical', {
      name: 'Critical System Handoff',
      description: 'Handoff for critical system changes',
      requiredSections: ['next_actions', 'validations', 'context', 'rollback_plan', 'monitoring'],
      optionalSections: ['continuations']
    });

    this.handoffTemplates.set('feature_release', {
      name: 'Feature Release Handoff',
      description: 'Handoff for feature releases',
      requiredSections: ['next_actions', 'validations', 'user_impact', 'rollout_plan'],
      optionalSections: ['training', 'documentation_updates']
    });
  }

  /**
   * Get handoff manager statistics
   * @returns {Object} Current handoff statistics
   */
  getHandoffStatistics() {
    return {
      ...this.handoffStats,
      activeHandoffs: this.activeHandoffs.size,
      historySize: this.handoffHistory.length,
      templatesAvailable: this.handoffTemplates.size,
      successRate: this.handoffStats.totalHandoffs > 0 
        ? (this.handoffStats.successfulTransitions / this.handoffStats.totalHandoffs) * 100 
        : 0
    };
  }

  /**
   * Cleanup old handoff data
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of cleaned items
   */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const cutoffTime = Date.now() - maxAge;
    let cleanedUp = 0;

    // Clean handoff history
    const originalHistoryLength = this.handoffHistory.length;
    this.handoffHistory = this.handoffHistory.filter(h => h.timestamp > cutoffTime);
    cleanedUp += originalHistoryLength - this.handoffHistory.length;

    // Clean old active handoffs (stale ones)
    for (const [handoffId, handoff] of this.activeHandoffs.entries()) {
      if (handoff.createdAt && handoff.createdAt < cutoffTime) {
        this.activeHandoffs.delete(handoffId);
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      this.logger.info(`Cleaned up ${cleanedUp} old handoff records`);
    }

    return cleanedUp;
  }
}

export default HandoffManager;