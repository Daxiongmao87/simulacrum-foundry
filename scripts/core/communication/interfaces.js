/**
 * Communication Enhancement - Core Interfaces
 * Defines interfaces and types for enhanced user communication
 */

/**
 * Main interface for communication enhancement operations
 */
export class ICommunicationEnhancement {
  async formatFinalResponse(taskResults, context) {
    throw new Error('formatFinalResponse must be implemented');
  }

  async generateProgressReport(progressData, context) {
    throw new Error('generateProgressReport must be implemented');
  }

  async createHandoffInstructions(taskResults, nextActions) {
    throw new Error('createHandoffInstructions must be implemented');
  }
}

/**
 * Task results with outputs and validation data
 */
export class TaskResults {
  constructor(taskId, taskTitle, status = 'completed') {
    this.taskId = taskId;
    this.taskTitle = taskTitle;
    this.status = status;
    this.outputs = new Map();
    this.changes = [];
    this.validationResults = [];
    this.errors = [];
    this.warnings = [];
    this.metadata = {};
    this.completedAt = Date.now();
    this.duration = 0;
  }

  addOutput(key, value, description = '') {
    this.outputs.set(key, {
      value,
      description,
      timestamp: Date.now()
    });
  }

  addChange(change) {
    this.changes.push({
      ...change,
      timestamp: Date.now()
    });
  }

  addValidationResult(result) {
    this.validationResults.push({
      ...result,
      timestamp: Date.now()
    });
  }

  addError(error, context = '') {
    this.errors.push({
      message: error.message || error,
      context,
      timestamp: Date.now(),
      stack: error.stack
    });
  }

  addWarning(warning, context = '') {
    this.warnings.push({
      message: warning.message || warning,
      context,
      timestamp: Date.now()
    });
  }

  isSuccessful() {
    return this.status === 'completed' && this.errors.length === 0;
  }

  hasWarnings() {
    return this.warnings.length > 0;
  }

  getOutputValue(key) {
    const output = this.outputs.get(key);
    return output ? output.value : undefined;
  }
}

/**
 * Communication context with user preferences and task information
 */
export class CommunicationContext {
  constructor(taskComplexity = 'medium', userPreferences = {}) {
    this.taskComplexity = taskComplexity;
    this.userPreferences = {
      verbosityLevel: 'normal',
      preferredFormat: 'markdown',
      includeTimestamps: false,
      showTechnicalDetails: true,
      maxResponseLength: 2000,
      ...userPreferences
    };
    this.interactionHistory = [];
    this.sessionContext = {};
    this.environmentInfo = {
      cli: true,
      terminalWidth: 80,
      colorSupport: true
    };
  }

  addInteraction(interaction) {
    this.interactionHistory.push({
      ...interaction,
      timestamp: Date.now()
    });

    // Keep only recent interactions to prevent memory bloat
    if (this.interactionHistory.length > 50) {
      this.interactionHistory = this.interactionHistory.slice(-25);
    }
  }

  isVerbose() {
    return this.userPreferences.verbosityLevel === 'verbose';
  }

  isConcise() {
    return this.userPreferences.verbosityLevel === 'concise';
  }

  isComplexTask() {
    return this.taskComplexity === 'high';
  }

  isSimpleTask() {
    return this.taskComplexity === 'low';
  }

  getMaxLength() {
    return this.userPreferences.maxResponseLength;
  }

  shouldShowTechnicalDetails() {
    return this.userPreferences.showTechnicalDetails;
  }
}

/**
 * Progress data with milestone information
 */
export class ProgressData {
  constructor(totalMilestones = 0) {
    this.totalMilestones = totalMilestones;
    this.milestones = [];
    this.currentFocus = '';
    this.overallProgress = 0;
    this.estimatedTimeRemaining = 0;
    this.actualTimeSpent = 0;
    this.lastUpdated = Date.now();
  }

  addMilestone(milestone) {
    this.milestones.push({
      id: milestone.id || `milestone_${this.milestones.length}`,
      name: milestone.name,
      description: milestone.description,
      status: milestone.status || 'pending',
      progress: milestone.progress || 0,
      estimatedTime: milestone.estimatedTime || 0,
      actualTime: milestone.actualTime || 0,
      dependencies: milestone.dependencies || [],
      completedAt: milestone.status === 'completed' ? Date.now() : null,
      metadata: milestone.metadata || {}
    });
  }

  updateMilestone(milestoneId, updates) {
    const milestone = this.milestones.find(m => m.id === milestoneId);
    if (milestone) {
      Object.assign(milestone, updates);
      if (updates.status === 'completed' && !milestone.completedAt) {
        milestone.completedAt = Date.now();
      }
      this._recalculateProgress();
    }
  }

  setCurrentFocus(focus) {
    this.currentFocus = focus;
    this.lastUpdated = Date.now();
  }

  getCompletedMilestones() {
    return this.milestones.filter(m => m.status === 'completed');
  }

  getPendingMilestones() {
    return this.milestones.filter(m => m.status === 'pending');
  }

  getInProgressMilestones() {
    return this.milestones.filter(m => m.status === 'in_progress');
  }

  getNextMilestone() {
    return this.milestones.find(m => m.status === 'pending') || null;
  }

  _recalculateProgress() {
    if (this.milestones.length === 0) {
      this.overallProgress = 0;
      return;
    }

    const totalProgress = this.milestones.reduce((sum, milestone) => {
      if (milestone.status === 'completed') return sum + 100;
      if (milestone.status === 'in_progress') return sum + (milestone.progress || 0);
      return sum;
    }, 0);

    this.overallProgress = totalProgress / this.milestones.length;
    this.lastUpdated = Date.now();
  }
}

/**
 * Structured formatted response for CLI output
 */
export class FormattedResponse {
  constructor(content = '', format = 'markdown') {
    this.content = content;
    this.format = format;
    this.sections = [];
    this.metadata = {
      generatedAt: Date.now(),
      estimatedReadTime: 0,
      wordCount: 0,
      characterCount: 0
    };
    this.styling = {
      useColors: true,
      useBold: true,
      useItalics: false,
      maxWidth: 80,
      indentation: '  '
    };
  }

  addSection(title, content, level = 1) {
    this.sections.push({
      title,
      content,
      level,
      id: `section_${this.sections.length}`,
      timestamp: Date.now()
    });
    this._updateMetadata();
  }

  addCodeBlock(code, language = '') {
    const codeSection = {
      type: 'code',
      content: code,
      language,
      id: `code_${this.sections.length}`,
      timestamp: Date.now()
    };
    this.sections.push(codeSection);
    this._updateMetadata();
  }

  addList(items, ordered = false) {
    const listSection = {
      type: 'list',
      items,
      ordered,
      id: `list_${this.sections.length}`,
      timestamp: Date.now()
    };
    this.sections.push(listSection);
    this._updateMetadata();
  }

  render() {
    if (this.content) {
      return this.content;
    }

    let rendered = '';
    
    for (const section of this.sections) {
      if (section.type === 'code') {
        rendered += this._renderCodeBlock(section);
      } else if (section.type === 'list') {
        rendered += this._renderList(section);
      } else {
        rendered += this._renderSection(section);
      }
      rendered += '\n';
    }

    return rendered.trim();
  }

  _renderSection(section) {
    const prefix = '#'.repeat(section.level);
    return `${prefix} ${section.title}\n\n${section.content}\n`;
  }

  _renderCodeBlock(section) {
    const language = section.language ? section.language : '';
    return `\`\`\`${language}\n${section.content}\n\`\`\`\n`;
  }

  _renderList(section) {
    return section.items.map((item, index) => {
      const prefix = section.ordered ? `${index + 1}.` : '-';
      return `${prefix} ${item}`;
    }).join('\n') + '\n';
  }

  _updateMetadata() {
    const fullContent = this.render();
    this.metadata.characterCount = fullContent.length;
    this.metadata.wordCount = fullContent.split(/\s+/).length;
    this.metadata.estimatedReadTime = Math.ceil(this.metadata.wordCount / 200); // 200 words per minute
  }

  getMetadata() {
    this._updateMetadata();
    return { ...this.metadata };
  }

  truncate(maxLength) {
    const fullContent = this.render();
    if (fullContent.length <= maxLength) {
      return this;
    }

    const truncated = new FormattedResponse();
    let currentLength = 0;

    for (const section of this.sections) {
      const sectionContent = this._renderSection(section);
      if (currentLength + sectionContent.length <= maxLength - 50) { // Leave room for truncation notice
        truncated.sections.push(section);
        currentLength += sectionContent.length;
      } else {
        truncated.addSection('...', '[Content truncated for length]', 3);
        break;
      }
    }

    return truncated;
  }
}

/**
 * Progress milestone with status tracking
 */
export class ProgressMilestone {
  constructor(id, name, description = '') {
    this.id = id;
    this.name = name;
    this.description = description;
    this.status = 'pending';
    this.progress = 0;
    this.estimatedTime = 0;
    this.actualTime = 0;
    this.dependencies = [];
    this.blockers = [];
    this.metadata = {};
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.lastUpdated = Date.now();
  }

  start() {
    if (this.status === 'pending') {
      this.status = 'in_progress';
      this.startedAt = Date.now();
      this.lastUpdated = Date.now();
    }
  }

  complete() {
    this.status = 'completed';
    this.progress = 100;
    this.completedAt = Date.now();
    this.lastUpdated = Date.now();
    
    if (this.startedAt) {
      this.actualTime = this.completedAt - this.startedAt;
    }
  }

  updateProgress(progress) {
    this.progress = Math.max(0, Math.min(100, progress));
    this.lastUpdated = Date.now();
    
    if (this.progress === 100) {
      this.complete();
    }
  }

  addBlocker(blocker) {
    this.blockers.push({
      description: blocker,
      addedAt: Date.now()
    });
  }

  removeBlocker(blockerIndex) {
    if (blockerIndex >= 0 && blockerIndex < this.blockers.length) {
      this.blockers.splice(blockerIndex, 1);
    }
  }

  isBlocked() {
    return this.blockers.length > 0;
  }

  isCompleted() {
    return this.status === 'completed';
  }

  isInProgress() {
    return this.status === 'in_progress';
  }

  getDuration() {
    if (this.startedAt && this.completedAt) {
      return this.completedAt - this.startedAt;
    }
    if (this.startedAt) {
      return Date.now() - this.startedAt;
    }
    return 0;
  }

  getEstimatedCompletion() {
    if (this.progress === 0 || this.actualTime === 0) {
      return this.estimatedTime;
    }
    
    return (this.actualTime / this.progress) * 100;
  }
}

/**
 * Structured progress report
 */
export class ProgressReport {
  constructor(progressData) {
    this.progressData = progressData;
    this.generatedAt = Date.now();
    this.summary = {
      overallProgress: progressData.overallProgress,
      milestonesCompleted: progressData.getCompletedMilestones().length,
      milestonesTotal: progressData.milestones.length,
      currentFocus: progressData.currentFocus,
      estimatedTimeRemaining: progressData.estimatedTimeRemaining
    };
    this.sections = {
      completed: progressData.getCompletedMilestones(),
      inProgress: progressData.getInProgressMilestones(),
      pending: progressData.getPendingMilestones(),
      blocked: progressData.milestones.filter(m => m.blockers && m.blockers.length > 0)
    };
  }

  render(format = 'markdown') {
    const response = new FormattedResponse('', format);
    
    response.addSection('Progress Summary', this._renderSummary());
    
    if (this.sections.completed.length > 0) {
      response.addSection('Completed', this._renderMilestoneList(this.sections.completed), 2);
    }
    
    if (this.sections.inProgress.length > 0) {
      response.addSection('In Progress', this._renderMilestoneList(this.sections.inProgress), 2);
    }
    
    if (this.sections.pending.length > 0) {
      response.addSection('Upcoming', this._renderMilestoneList(this.sections.pending), 2);
    }
    
    if (this.sections.blocked.length > 0) {
      response.addSection('Blocked', this._renderMilestoneList(this.sections.blocked), 2);
    }

    return response;
  }

  _renderSummary() {
    const { overallProgress, milestonesCompleted, milestonesTotal, currentFocus } = this.summary;
    
    let summary = `Overall progress: ${overallProgress.toFixed(1)}%\n`;
    summary += `Milestones: ${milestonesCompleted}/${milestonesTotal} completed\n`;
    
    if (currentFocus) {
      summary += `Current focus: ${currentFocus}\n`;
    }
    
    return summary.trim();
  }

  _renderMilestoneList(milestones) {
    return milestones.map(milestone => {
      let item = `${milestone.name}`;
      
      if (milestone.status === 'in_progress') {
        item += ` (${milestone.progress}%)`;
      }
      
      if (milestone.status === 'completed' && milestone.completedAt) {
        const completionTime = new Date(milestone.completedAt).toLocaleTimeString();
        item += ` - completed at ${completionTime}`;
      }
      
      if (milestone.blockers && milestone.blockers.length > 0) {
        item += ` - BLOCKED: ${milestone.blockers[0].description}`;
      }
      
      return item;
    }).join('\n');
  }
}

/**
 * Work handoff instructions with next actions
 */
export class HandoffInstructions {
  constructor(taskResults, context) {
    this.taskResults = taskResults;
    this.context = context;
    this.nextActions = [];
    this.validationSteps = [];
    this.continuationOptions = [];
    this.recommendations = [];
    this.generatedAt = Date.now();
  }

  addNextAction(action) {
    this.nextActions.push({
      action,
      priority: 'normal',
      estimatedTime: 0,
      dependencies: [],
      id: `action_${this.nextActions.length}`,
      ...action
    });
  }

  addValidationStep(step) {
    this.validationSteps.push({
      description: step.description || step,
      command: step.command,
      expectedResult: step.expectedResult,
      id: `validation_${this.validationSteps.length}`,
      ...step
    });
  }

  addContinuationOption(option) {
    this.continuationOptions.push({
      title: option.title,
      description: option.description,
      effort: option.effort || 'medium',
      benefits: option.benefits || [],
      id: `option_${this.continuationOptions.length}`,
      ...option
    });
  }

  addRecommendation(recommendation) {
    this.recommendations.push({
      text: recommendation.text || recommendation,
      priority: recommendation.priority || 'normal',
      reasoning: recommendation.reasoning,
      id: `recommendation_${this.recommendations.length}`,
      ...recommendation
    });
  }

  render(format = 'markdown') {
    const response = new FormattedResponse('', format);

    if (this.nextActions.length > 0) {
      response.addSection('Next Actions', this._renderNextActions());
    }

    if (this.validationSteps.length > 0) {
      response.addSection('Validation Steps', this._renderValidationSteps());
    }

    if (this.continuationOptions.length > 0) {
      response.addSection('Continuation Options', this._renderContinuationOptions());
    }

    if (this.recommendations.length > 0) {
      response.addSection('Recommendations', this._renderRecommendations());
    }

    return response;
  }

  _renderNextActions() {
    return this.nextActions
      .sort((a, b) => this._priorityOrder(a.priority) - this._priorityOrder(b.priority))
      .map(action => {
        let item = action.action || action.description;
        if (action.estimatedTime > 0) {
          item += ` (estimated: ${action.estimatedTime}min)`;
        }
        return item;
      }).join('\n');
  }

  _renderValidationSteps() {
    return this.validationSteps.map((step, index) => {
      let item = `${index + 1}. ${step.description}`;
      if (step.command) {
        item += `\n   Command: \`${step.command}\``;
      }
      if (step.expectedResult) {
        item += `\n   Expected: ${step.expectedResult}`;
      }
      return item;
    }).join('\n\n');
  }

  _renderContinuationOptions() {
    return this.continuationOptions.map(option => {
      let item = `**${option.title}**\n${option.description}`;
      
      if (option.effort) {
        item += `\nEffort: ${option.effort}`;
      }
      
      if (option.benefits && option.benefits.length > 0) {
        item += `\nBenefits: ${option.benefits.join(', ')}`;
      }
      
      return item;
    }).join('\n\n');
  }

  _renderRecommendations() {
    return this.recommendations
      .sort((a, b) => this._priorityOrder(a.priority) - this._priorityOrder(b.priority))
      .map(rec => {
        let item = rec.text;
        if (rec.reasoning) {
          item += ` (${rec.reasoning})`;
        }
        return item;
      }).join('\n');
  }

  _priorityOrder(priority) {
    const order = { high: 0, normal: 1, low: 2 };
    return order[priority] || 1;
  }
}

/**
 * Handoff protocol for structured work transition
 */
export class HandoffProtocol {
  constructor(fromContext, toContext) {
    this.fromContext = fromContext;
    this.toContext = toContext;
    this.transitionType = 'continue'; // continue, pause, complete, handover
    this.instructions = new HandoffInstructions();
    this.context = new Map();
    this.requirements = [];
    this.createdAt = Date.now();
  }

  setTransitionType(type) {
    this.transitionType = type;
  }

  addContextItem(key, value, description = '') {
    this.context.set(key, {
      value,
      description,
      timestamp: Date.now()
    });
  }

  addRequirement(requirement) {
    this.requirements.push({
      description: requirement.description || requirement,
      priority: requirement.priority || 'normal',
      mandatory: requirement.mandatory !== false,
      id: `requirement_${this.requirements.length}`,
      ...requirement
    });
  }

  getContextItem(key) {
    const item = this.context.get(key);
    return item ? item.value : undefined;
  }

  render(format = 'markdown') {
    const response = new FormattedResponse('', format);

    response.addSection('Work Handoff', this._renderHeader());

    if (this.context.size > 0) {
      response.addSection('Context Information', this._renderContext(), 2);
    }

    if (this.requirements.length > 0) {
      response.addSection('Requirements', this._renderRequirements(), 2);
    }

    const instructionsResponse = this.instructions.render(format);
    response.sections.push(...instructionsResponse.sections);

    return response;
  }

  _renderHeader() {
    let header = `Transition type: ${this.transitionType}\n`;
    
    if (this.fromContext) {
      header += `From: ${this.fromContext}\n`;
    }
    
    if (this.toContext) {
      header += `To: ${this.toContext}\n`;
    }
    
    return header.trim();
  }

  _renderContext() {
    const items = Array.from(this.context.entries());
    return items.map(([key, item]) => {
      let line = `${key}: ${item.value}`;
      if (item.description) {
        line += ` - ${item.description}`;
      }
      return line;
    }).join('\n');
  }

  _renderRequirements() {
    return this.requirements
      .sort((a, b) => {
        if (a.mandatory && !b.mandatory) return -1;
        if (!a.mandatory && b.mandatory) return 1;
        return this._priorityOrder(a.priority) - this._priorityOrder(b.priority);
      })
      .map(req => {
        let item = req.description;
        if (req.mandatory) {
          item = `**${item}**`;
        }
        return item;
      }).join('\n');
  }

  _priorityOrder(priority) {
    const order = { high: 0, normal: 1, low: 2 };
    return order[priority] || 1;
  }
}

export default {
  ICommunicationEnhancement,
  TaskResults,
  CommunicationContext,
  ProgressData,
  FormattedResponse,
  ProgressMilestone,
  ProgressReport,
  HandoffInstructions,
  HandoffProtocol
};