/**
 * Workflow Standardization - MVP Decomposer
 * Task analysis and MVP-focused breakdown with priority ordering
 */

import { TaskSpec } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class MVPDecomposer {
  constructor() {
    this.logger = createLogger('MVPDecomposer');
    this.decompositionRules = new Map();
    this.priorityWeights = {
      essential: 100,
      important: 75,
      nice_to_have: 50,
      future: 25
    };
    
    this._initializeDecompositionRules();
  }

  /**
   * Decompose task specification using MVP principles
   * @param {TaskSpec} taskSpec - Task specification to decompose
   * @param {Object} options - Decomposition options
   * @returns {Object} Decomposed task with MVP structure
   */
  decomposeTask(taskSpec, options = {}) {
    try {
      this.logger.info(`Starting MVP decomposition for: ${taskSpec.title}`);

      const taskType = this._analyzeTaskType(taskSpec);
      const complexity = this._assessComplexity(taskSpec);
      const decomposition = this._performDecomposition(taskSpec, taskType, complexity, options);

      this.logger.info(`MVP decomposition complete: ${decomposition.steps.length} steps identified`);
      return decomposition;

    } catch (error) {
      this.logger.error('Task decomposition failed:', error);
      throw new Error(`Failed to decompose task: ${error.message}`);
    }
  }

  /**
   * Analyze task type for appropriate decomposition strategy
   * @private
   */
  _analyzeTaskType(taskSpec) {
    const title = taskSpec.title.toLowerCase();
    const description = taskSpec.description.toLowerCase();
    const combined = `${title} ${description}`;

    const patterns = {
      feature_addition: /\b(add|implement|create|build|develop|new)\b/,
      bug_fix: /\b(fix|debug|resolve|correct|patch|repair)\b/,
      refactoring: /\b(refactor|restructure|reorganize|improve|optimize)\b/,
      testing: /\b(test|validate|verify|check|ensure)\b/,
      documentation: /\b(document|write|explain|describe|guide)\b/,
      maintenance: /\b(update|upgrade|maintain|clean|remove)\b/,
      integration: /\b(integrate|connect|link|merge|combine)\b/,
      investigation: /\b(investigate|analyze|explore|research|study)\b/
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(combined)) {
        this.logger.debug(`Task type identified: ${type}`);
        return type;
      }
    }

    return 'general';
  }

  /**
   * Assess task complexity for decomposition depth
   * @private
   */
  _assessComplexity(taskSpec) {
    let complexityScore = 0;

    complexityScore += taskSpec.requirements.length * 5;
    
    const descriptionLength = taskSpec.description.length;
    if (descriptionLength > 500) complexityScore += 20;
    else if (descriptionLength > 200) complexityScore += 10;
    
    const constraintKeys = Object.keys(taskSpec.constraints);
    complexityScore += constraintKeys.length * 3;
    
    if (constraintKeys.some(key => ['performance', 'security', 'scalability'].includes(key))) {
      complexityScore += 15;
    }
    
    if (taskSpec.acceptanceCriteria.length > 5) {
      complexityScore += 10;
    }

    if (complexityScore >= 50) return 'high';
    if (complexityScore >= 25) return 'medium';
    return 'low';
  }

  /**
   * Perform MVP-focused decomposition
   * @private
   */
  _performDecomposition(taskSpec, taskType, complexity, options) {
    const rule = this.decompositionRules.get(taskType) || this.decompositionRules.get('general');
    
    const baseSteps = rule.generateSteps(taskSpec, complexity);
    const prioritizedSteps = this._prioritizeSteps(baseSteps, taskSpec, options);
    const mvpCore = this._identifyMVPCore(prioritizedSteps, taskSpec);
    const dependencies = this._analyzeDependencies(prioritizedSteps);

    return {
      taskType,
      complexity,
      mvpCore,
      steps: prioritizedSteps,
      dependencies,
      estimatedDuration: this._estimateDuration(prioritizedSteps),
      phasing: this._createPhasing(prioritizedSteps, mvpCore),
      riskAssessment: this._assessRisks(prioritizedSteps, taskSpec)
    };
  }

  /**
   * Prioritize steps using MVP principles
   * @private
   */
  _prioritizeSteps(steps, taskSpec, options) {
    return steps.map(step => {
      const priority = this._calculateStepPriority(step, taskSpec, options);
      const mvpLevel = this._determineMVPLevel(step, priority);
      
      return {
        ...step,
        priority,
        mvpLevel,
        weight: this.priorityWeights[priority] || 50
      };
    }).sort((a, b) => b.weight - a.weight);
  }

  /**
   * Calculate step priority based on multiple factors
   * @private
   */
  _calculateStepPriority(step, taskSpec, options) {
    let score = 0;

    if (step.blocking || step.foundation) score += 30;
    
    if (step.userFacing) score += 20;
    
    if (step.riskLevel === 'low') score += 15;
    else if (step.riskLevel === 'high') score -= 10;
    
    if (step.dependencies && step.dependencies.length === 0) score += 10;
    
    if (step.testable !== false) score += 5;
    
    const requirementMatch = taskSpec.requirements.some(req => 
      req.toLowerCase().includes(step.name.toLowerCase())
    );
    if (requirementMatch) score += 15;
    
    if (options.prioritizeQuickWins && step.estimatedEffort < 4) {
      score += 10;
    }

    if (score >= 70) return 'essential';
    if (score >= 45) return 'important';
    if (score >= 20) return 'nice_to_have';
    return 'future';
  }

  /**
   * Determine MVP level for step
   * @private
   */
  _determineMVPLevel(step, priority) {
    if (priority === 'essential') return 1; // MVP Core
    if (priority === 'important') return 2; // MVP Extended
    if (priority === 'nice_to_have') return 3; // Post-MVP
    return 4; // Future
  }

  /**
   * Identify core MVP steps
   * @private
   */
  _identifyMVPCore(steps, taskSpec) {
    const coreSteps = steps.filter(step => step.mvpLevel === 1);
    
    // Ensure at least one step is in MVP core if we have steps
    if (coreSteps.length === 0 && steps.length > 0) {
      // Find the most essential step (highest priority)
      const mostEssential = steps.reduce((prev, current) => 
        (current.weight || 0) > (prev.weight || 0) ? current : prev
      );
      mostEssential.mvpLevel = 1;
      coreSteps.push(mostEssential);
    }
    
    const core = {
      steps: coreSteps,
      description: `Minimum viable implementation of: ${taskSpec.title}`,
      estimatedEffort: coreSteps.reduce((sum, step) => sum + (step.estimatedEffort || 2), 0),
      userValue: coreSteps.filter(step => step.userFacing).length,
      riskLevel: this._calculateCoreRiskLevel(coreSteps)
    };

    this.logger.debug(`MVP Core identified: ${core.steps.length} steps, ${core.estimatedEffort} effort units`);
    return core;
  }

  /**
   * Calculate risk level for MVP core
   * @private
   */
  _calculateCoreRiskLevel(coreSteps) {
    const riskCounts = { low: 0, medium: 0, high: 0 };
    
    coreSteps.forEach(step => {
      riskCounts[step.riskLevel || 'medium']++;
    });

    if (riskCounts.high > 0) return 'high';
    if (riskCounts.medium > riskCounts.low) return 'medium';
    return 'low';
  }

  /**
   * Analyze dependencies between steps
   * @private
   */
  _analyzeDependencies(steps) {
    const dependencies = new Map();
    const stepMap = new Map(steps.map(step => [step.id, step]));

    for (const step of steps) {
      if (step.dependencies && step.dependencies.length > 0) {
        const resolvedDeps = step.dependencies
          .map(depId => stepMap.get(depId))
          .filter(dep => dep !== undefined);
        
        if (resolvedDeps.length > 0) {
          dependencies.set(step.id, resolvedDeps);
        }
      }
    }

    return dependencies;
  }

  /**
   * Estimate total duration for decomposed task
   * @private
   */
  _estimateDuration(steps) {
    const totalEffort = steps.reduce((sum, step) => sum + (step.estimatedEffort || 2), 0);
    
    const parallelGroups = this._identifyParallelWork(steps);
    const parallelizationFactor = Math.min(1.5, 1 + (parallelGroups.length * 0.1));
    
    return {
      totalEffort,
      estimatedHours: totalEffort * 2, // 2 hours per effort unit
      parallelizationPossible: parallelGroups.length > 0,
      potentialSavings: parallelizationFactor > 1 ? `${((parallelizationFactor - 1) * 100).toFixed(0)}%` : '0%'
    };
  }

  /**
   * Identify steps that can be done in parallel
   * @private
   */
  _identifyParallelWork(steps) {
    const parallelGroups = [];
    const processed = new Set();

    for (const step of steps) {
      if (processed.has(step.id)) continue;

      const parallelSteps = [step];
      processed.add(step.id);

      for (const otherStep of steps) {
        if (processed.has(otherStep.id)) continue;
        
        if (this._canRunInParallel(step, otherStep, steps)) {
          parallelSteps.push(otherStep);
          processed.add(otherStep.id);
        }
      }

      if (parallelSteps.length > 1) {
        parallelGroups.push(parallelSteps);
      }
    }

    return parallelGroups;
  }

  /**
   * Check if two steps can run in parallel
   * @private
   */
  _canRunInParallel(stepA, stepB, allSteps) {
    const depsA = stepA.dependencies || [];
    const depsB = stepB.dependencies || [];
    
    if (depsA.includes(stepB.id) || depsB.includes(stepA.id)) {
      return false;
    }
    
    if (stepA.resourceType && stepB.resourceType && stepA.resourceType === stepB.resourceType) {
      return false;
    }
    
    if (stepA.mutuallyExclusive && stepA.mutuallyExclusive.includes(stepB.id)) {
      return false;
    }

    return true;
  }

  /**
   * Create phased implementation plan
   * @private
   */
  _createPhasing(steps, mvpCore) {
    const phases = [
      {
        name: 'MVP Core',
        description: 'Essential functionality for minimum viable product',
        steps: steps.filter(s => s.mvpLevel === 1),
        order: 1
      },
      {
        name: 'MVP Extended',
        description: 'Important features that enhance core functionality',
        steps: steps.filter(s => s.mvpLevel === 2),
        order: 2
      },
      {
        name: 'Enhancement',
        description: 'Nice-to-have features for improved user experience',
        steps: steps.filter(s => s.mvpLevel === 3),
        order: 3
      },
      {
        name: 'Future',
        description: 'Advanced features for future consideration',
        steps: steps.filter(s => s.mvpLevel === 4),
        order: 4
      }
    ].filter(phase => phase.steps.length > 0);

    return phases;
  }

  /**
   * Assess risks for the decomposed task
   * @private
   */
  _assessRisks(steps, taskSpec) {
    const risks = [];

    const highRiskSteps = steps.filter(s => s.riskLevel === 'high');
    if (highRiskSteps.length > 0) {
      risks.push({
        type: 'execution',
        level: 'high',
        description: `${highRiskSteps.length} high-risk steps identified`,
        mitigation: 'Consider prototyping or proof-of-concept for high-risk steps'
      });
    }

    const complexDependencies = Array.from(this._analyzeDependencies(steps).values())
      .filter(deps => deps.length > 3);
    if (complexDependencies.length > 0) {
      risks.push({
        type: 'dependency',
        level: 'medium',
        description: 'Complex dependency chains detected',
        mitigation: 'Monitor dependency fulfillment closely and have fallback plans'
      });
    }

    if (taskSpec.constraints.timeLimit && this._estimateDuration(steps).estimatedHours > taskSpec.constraints.timeLimit) {
      risks.push({
        type: 'schedule',
        level: 'high',
        description: 'Estimated duration exceeds time constraints',
        mitigation: 'Consider reducing scope or focusing on MVP core only'
      });
    }

    return risks;
  }

  /**
   * Initialize decomposition rules for different task types
   * @private
   */
  _initializeDecompositionRules() {
    this.decompositionRules.set('feature_addition', {
      generateSteps: (taskSpec, complexity) => [
        {
          id: 'analyze_requirements',
          name: 'Analyze Requirements',
          type: 'analysis',
          blocking: true,
          foundation: true,
          estimatedEffort: complexity === 'high' ? 4 : 2,
          riskLevel: 'low'
        },
        {
          id: 'design_solution',
          name: 'Design Solution',
          type: 'design',
          dependencies: ['analyze_requirements'],
          blocking: true,
          estimatedEffort: complexity === 'high' ? 6 : 3,
          riskLevel: 'medium'
        },
        {
          id: 'implement_core',
          name: 'Implement Core Functionality',
          type: 'implementation',
          dependencies: ['design_solution'],
          userFacing: true,
          blocking: true,
          foundation: true,
          estimatedEffort: complexity === 'high' ? 8 : 4,
          riskLevel: 'medium'
        },
        {
          id: 'add_validation',
          name: 'Add Input Validation',
          type: 'implementation',
          dependencies: ['implement_core'],
          estimatedEffort: 2,
          riskLevel: 'low'
        },
        {
          id: 'implement_ui',
          name: 'Implement User Interface',
          type: 'implementation',
          dependencies: ['implement_core'],
          userFacing: true,
          estimatedEffort: complexity === 'high' ? 6 : 3,
          riskLevel: 'medium'
        },
        {
          id: 'add_tests',
          name: 'Add Tests',
          type: 'testing',
          dependencies: ['implement_core'],
          testable: true,
          estimatedEffort: 3,
          riskLevel: 'low'
        },
        {
          id: 'integration_testing',
          name: 'Integration Testing',
          type: 'testing',
          dependencies: ['implement_ui', 'add_tests'],
          estimatedEffort: 2,
          riskLevel: 'low'
        }
      ]
    });

    this.decompositionRules.set('bug_fix', {
      generateSteps: (taskSpec, complexity) => [
        {
          id: 'reproduce_issue',
          name: 'Reproduce Issue',
          type: 'investigation',
          blocking: true,
          foundation: true,
          estimatedEffort: 2,
          riskLevel: 'low'
        },
        {
          id: 'identify_root_cause',
          name: 'Identify Root Cause',
          type: 'investigation',
          dependencies: ['reproduce_issue'],
          blocking: true,
          estimatedEffort: complexity === 'high' ? 6 : 3,
          riskLevel: complexity === 'high' ? 'high' : 'medium'
        },
        {
          id: 'implement_fix',
          name: 'Implement Fix',
          type: 'implementation',
          dependencies: ['identify_root_cause'],
          userFacing: true,
          estimatedEffort: complexity === 'high' ? 4 : 2,
          riskLevel: 'medium'
        },
        {
          id: 'add_regression_tests',
          name: 'Add Regression Tests',
          type: 'testing',
          dependencies: ['implement_fix'],
          testable: true,
          estimatedEffort: 2,
          riskLevel: 'low'
        },
        {
          id: 'verify_fix',
          name: 'Verify Fix',
          type: 'verification',
          dependencies: ['add_regression_tests'],
          estimatedEffort: 1,
          riskLevel: 'low'
        }
      ]
    });

    this.decompositionRules.set('refactoring', {
      generateSteps: (taskSpec, complexity) => [
        {
          id: 'analyze_current_code',
          name: 'Analyze Current Code',
          type: 'analysis',
          blocking: true,
          foundation: true,
          estimatedEffort: complexity === 'high' ? 6 : 3,
          riskLevel: 'low'
        },
        {
          id: 'identify_refactoring_targets',
          name: 'Identify Refactoring Targets',
          type: 'analysis',
          dependencies: ['analyze_current_code'],
          estimatedEffort: 2,
          riskLevel: 'low'
        },
        {
          id: 'create_safety_tests',
          name: 'Create Safety Tests',
          type: 'testing',
          dependencies: ['analyze_current_code'],
          testable: true,
          estimatedEffort: 4,
          riskLevel: 'low'
        },
        {
          id: 'refactor_incrementally',
          name: 'Refactor Incrementally',
          type: 'implementation',
          dependencies: ['create_safety_tests', 'identify_refactoring_targets'],
          estimatedEffort: complexity === 'high' ? 10 : 6,
          riskLevel: 'medium'
        },
        {
          id: 'validate_refactoring',
          name: 'Validate Refactoring',
          type: 'verification',
          dependencies: ['refactor_incrementally'],
          estimatedEffort: 2,
          riskLevel: 'low'
        }
      ]
    });

    this.decompositionRules.set('general', {
      generateSteps: (taskSpec, complexity) => [
        {
          id: 'understand_requirements',
          name: 'Understand Requirements',
          type: 'analysis',
          blocking: true,
          foundation: true,
          estimatedEffort: 2,
          riskLevel: 'low'
        },
        {
          id: 'plan_approach',
          name: 'Plan Approach',
          type: 'planning',
          dependencies: ['understand_requirements'],
          estimatedEffort: 2,
          riskLevel: 'low'
        },
        {
          id: 'implement_solution',
          name: 'Implement Solution',
          type: 'implementation',
          dependencies: ['plan_approach'],
          userFacing: true,
          blocking: true,
          foundation: true,
          estimatedEffort: complexity === 'high' ? 8 : 4,
          riskLevel: 'medium'
        },
        {
          id: 'verify_solution',
          name: 'Verify Solution',
          type: 'verification',
          dependencies: ['implement_solution'],
          estimatedEffort: 2,
          riskLevel: 'low'
        }
      ]
    });
  }

  /**
   * Get decomposition statistics
   * @returns {Object} Current decomposition statistics
   */
  getDecompositionStats() {
    return {
      availableRules: Array.from(this.decompositionRules.keys()),
      priorityWeights: { ...this.priorityWeights }
    };
  }

  /**
   * Register custom decomposition rule
   * @param {string} taskType - Task type identifier
   * @param {Object} rule - Decomposition rule
   */
  registerDecompositionRule(taskType, rule) {
    this.decompositionRules.set(taskType, rule);
    this.logger.info(`Registered custom decomposition rule: ${taskType}`);
  }
}

export default MVPDecomposer;