/**
 * Enhanced Planning Framework - Core Planning Engine
 * Implements structured task decomposition and MVP-focused planning
 */

import { IPlanningFramework } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class PlanningEngine extends IPlanningFramework {
  constructor() {
    super();
    this.logger = createLogger('PlanningEngine');
    this.activePlans = new Map(); // In-memory plan storage (could be enhanced with persistence)
  }

  /**
   * Decompose a task into structured plan steps using MVP principles
   */
  async createPlan(taskDescription, contextInformation = {}) {
    try {
      // Validate input
      if (!taskDescription || taskDescription.trim().length === 0) {
        throw new Error('Task description is required');
      }

      if (taskDescription.length > 2000) {
        throw new Error('Task description exceeds maximum length of 2000 characters');
      }

      // Generate unique plan ID
      const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Decompose task into steps
      const steps = await this._decomposeTask(taskDescription, contextInformation);
      
      // Create plan state
      const plan = {
        id: planId,
        steps: steps,
        context: {
          originalTask: taskDescription,
          ...contextInformation
        },
        created: new Date(),
        modified: new Date(),
        status: 'active'
      };

      // Store plan
      this.activePlans.set(planId, plan);
      
      this.logger.info(`Created plan ${planId} with ${steps.length} steps`);
      return plan;

    } catch (error) {
      this.logger.error('Error creating plan:', error);
      throw error;
    }
  }

  /**
   * Update an existing plan with new information
   */
  async updatePlan(planId, updates) {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Apply updates
    if (updates.steps) {
      plan.steps = updates.steps;
    }
    if (updates.context) {
      plan.context = { ...plan.context, ...updates.context };
    }
    if (updates.status) {
      plan.status = updates.status;
    }

    plan.modified = new Date();
    
    this.logger.info(`Updated plan ${planId}`);
    return plan;
  }

  /**
   * Mark a step as in progress
   */
  async startStep(planId, stepId) {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const step = plan.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in plan ${planId}`);
    }

    // Check dependencies
    const unmetDependencies = step.dependencies.filter(depId => {
      const depStep = plan.steps.find(s => s.id === depId);
      return !depStep || depStep.status !== 'completed';
    });

    if (unmetDependencies.length > 0) {
      throw new Error(`Cannot start step ${stepId}: unmet dependencies ${unmetDependencies.join(', ')}`);
    }

    // Ensure only one step is in progress at a time
    plan.steps.forEach(s => {
      if (s.status === 'in_progress' && s.id !== stepId) {
        s.status = 'pending';
      }
    });

    step.status = 'in_progress';
    plan.modified = new Date();
    
    this.logger.info(`Started step ${stepId} in plan ${planId}`);
    return plan;
  }

  /**
   * Mark a step as completed
   */
  async completeStep(planId, stepId) {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const step = plan.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in plan ${planId}`);
    }

    step.status = 'completed';
    plan.modified = new Date();
    
    // Check if all steps are completed
    const allCompleted = plan.steps.every(s => s.status === 'completed');
    if (allCompleted) {
      plan.status = 'completed';
    }
    
    this.logger.info(`Completed step ${stepId} in plan ${planId}`);
    return plan;
  }

  /**
   * Get current progress report
   */
  async getProgress(planId) {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
    const inProgressStep = plan.steps.find(s => s.status === 'in_progress');
    
    return {
      message: `Progress: ${completedSteps}/${plan.steps.length} steps completed`,
      completedSteps,
      totalSteps: plan.steps.length,
      currentStep: inProgressStep ? inProgressStep.activeForm : 'No active step'
    };
  }

  /**
   * Generate preamble message for user communication
   */
  generatePreamble(plan) {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return 'Planning task approach';
    }

    const nextStep = plan.steps.find(s => s.status === 'pending') || 
                    plan.steps.find(s => s.status === 'in_progress');
    
    if (!nextStep) {
      return 'Finalizing task completion';
    }

    // Generate concise preamble (8-12 words)
    const action = nextStep.content.split(' ').slice(0, 6).join(' ');
    return `I'll ${action.toLowerCase()}`;
  }

  /**
   * Private method to decompose task into MVP-focused steps
   */
  async _decomposeTask(taskDescription, context) {
    // Simple rule-based decomposition (can be enhanced with AI in the future)
    const steps = [];
    
    // Common development patterns
    if (this._isFeatureRequest(taskDescription)) {
      steps.push(...this._generateFeatureSteps(taskDescription, context));
    } else if (this._isBugFix(taskDescription)) {
      steps.push(...this._generateBugFixSteps(taskDescription, context));
    } else if (this._isRefactoring(taskDescription)) {
      steps.push(...this._generateRefactoringSteps(taskDescription, context));
    } else {
      steps.push(...this._generateGenericSteps(taskDescription, context));
    }

    return steps.map((step, index) => ({
      id: `step_${index + 1}_${Date.now()}`,
      content: step.content,
      activeForm: step.activeForm,
      status: 'pending',
      dependencies: step.dependencies || [],
      metadata: {
        order: index + 1,
        category: step.category || 'general'
      }
    }));
  }

  /**
   * Determine if task is a feature request
   */
  _isFeatureRequest(task) {
    const featureKeywords = ['add', 'create', 'implement', 'build', 'develop', 'feature', 'new'];
    return featureKeywords.some(keyword => 
      task.toLowerCase().includes(keyword)
    );
  }

  /**
   * Determine if task is a bug fix
   */
  _isBugFix(task) {
    const bugKeywords = ['fix', 'bug', 'error', 'issue', 'broken', 'problem', 'crash'];
    return bugKeywords.some(keyword => 
      task.toLowerCase().includes(keyword)
    );
  }

  /**
   * Determine if task is refactoring
   */
  _isRefactoring(task) {
    const refactorKeywords = ['refactor', 'refactoring', 'restructure', 'reorganize', 'cleanup'];
    return refactorKeywords.some(keyword => 
      task.toLowerCase().includes(keyword)
    );
  }

  /**
   * Generate steps for feature development
   */
  _generateFeatureSteps(task, context) {
    return [
      {
        content: 'Analyze requirements and create specification',
        activeForm: 'Analyzing requirements and creating specification',
        category: 'planning',
        dependencies: []
      },
      {
        content: 'Design core architecture and interfaces',
        activeForm: 'Designing core architecture and interfaces',
        category: 'design',
        dependencies: []
      },
      {
        content: 'Implement MVP core functionality',
        activeForm: 'Implementing MVP core functionality',
        category: 'implementation',
        dependencies: []
      },
      {
        content: 'Create comprehensive tests',
        activeForm: 'Creating comprehensive tests',
        category: 'testing',
        dependencies: []
      },
      {
        content: 'Validate implementation and run tests',
        activeForm: 'Validating implementation and running tests',
        category: 'verification',
        dependencies: []
      }
    ];
  }

  /**
   * Generate steps for bug fixes
   */
  _generateBugFixSteps(task, context) {
    return [
      {
        content: 'Investigate and reproduce the issue',
        activeForm: 'Investigating and reproducing the issue',
        category: 'investigation',
        dependencies: []
      },
      {
        content: 'Identify root cause and impact',
        activeForm: 'Identifying root cause and impact',
        category: 'analysis',
        dependencies: []
      },
      {
        content: 'Implement targeted fix',
        activeForm: 'Implementing targeted fix',
        category: 'implementation',
        dependencies: []
      },
      {
        content: 'Test fix and verify resolution',
        activeForm: 'Testing fix and verifying resolution',
        category: 'verification',
        dependencies: []
      }
    ];
  }

  /**
   * Generate steps for refactoring tasks
   */
  _generateRefactoringSteps(task, context) {
    return [
      {
        content: 'Analyze current code structure',
        activeForm: 'Analyzing current code structure',
        category: 'analysis',
        dependencies: []
      },
      {
        content: 'Create refactoring plan with safety measures',
        activeForm: 'Creating refactoring plan with safety measures',
        category: 'planning',
        dependencies: []
      },
      {
        content: 'Implement refactoring incrementally',
        activeForm: 'Implementing refactoring incrementally',
        category: 'implementation',
        dependencies: []
      },
      {
        content: 'Validate functionality remains intact',
        activeForm: 'Validating functionality remains intact',
        category: 'verification',
        dependencies: []
      }
    ];
  }

  /**
   * Generate generic steps for unclassified tasks
   */
  _generateGenericSteps(task, context) {
    return [
      {
        content: 'Analyze task requirements',
        activeForm: 'Analyzing task requirements',
        category: 'analysis',
        dependencies: []
      },
      {
        content: 'Plan implementation approach',
        activeForm: 'Planning implementation approach',
        category: 'planning',
        dependencies: []
      },
      {
        content: 'Execute implementation',
        activeForm: 'Executing implementation',
        category: 'implementation',
        dependencies: []
      },
      {
        content: 'Verify and validate results',
        activeForm: 'Verifying and validating results',
        category: 'verification',
        dependencies: []
      }
    ];
  }
}