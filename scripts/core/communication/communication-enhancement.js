/**
 * Communication Enhancement - Main Orchestration Class
 * Complete communication enhancement system with structured formatting and collaboration
 */

import { ICommunicationEnhancement, TaskResults, CommunicationContext, FormattedResponse } from './interfaces.js';
import ResponseFormatter from './response-formatter.js';
import ProgressReporter from './progress-reporter.js';
import CollaborationEngine from './collaboration-engine.js';
import ContextAnalyzer from './context-analyzer.js';
import HandoffManager from './handoff-manager.js';
import { createLogger } from '../../utils/logger.js';

export class CommunicationEnhancement extends ICommunicationEnhancement {
  constructor() {
    super();
    this.logger = createLogger('CommunicationEnhancement');
    
    this.responseFormatter = new ResponseFormatter();
    this.progressReporter = new ProgressReporter();
    this.collaborationEngine = new CollaborationEngine();
    this.contextAnalyzer = new ContextAnalyzer();
    this.handoffManager = new HandoffManager();
    
    this.activeCommunications = new Map();
    this.communicationHistory = [];
    this.systemStats = {
      totalCommunications: 0,
      averageResponseTime: 0,
      userSatisfactionRating: 0,
      systemStartTime: Date.now()
    };

    this.logger.info('Communication Enhancement system initialized');
  }

  /**
   * Format final response with comprehensive communication enhancement
   * @param {TaskResults} taskResults - Completed task results
   * @param {Object} contextInfo - Context information for communication
   * @param {Object} options - Formatting options
   * @returns {Promise<FormattedResponse>} Enhanced formatted response
   */
  async formatFinalResponse(taskResults, contextInfo = {}, options = {}) {
    try {
      const startTime = Date.now();
      this.logger.info(`Formatting final response for: ${taskResults.taskTitle}`);

      const context = await this.contextAnalyzer.analyzeContext(
        { 
          title: taskResults.taskTitle,
          type: taskResults.metadata.type,
          requirements: taskResults.metadata.requirements,
          complexity: contextInfo.complexity
        },
        contextInfo.userInfo,
        contextInfo.environmentInfo
      );

      const adaptedStyle = this.contextAnalyzer.adaptCommunicationStyle(
        context,
        'final_response',
        { taskResults, options }
      );

      const formattedResponse = await this.responseFormatter.formatFinalResponse(
        taskResults,
        context
      );

      this._applyStyleAdaptations(formattedResponse, adaptedStyle, context);

      if (options.includeHandoff) {
        await this._addHandoffSection(formattedResponse, taskResults, context);
      }

      if (options.includeProgress && contextInfo.progressData) {
        await this._addProgressSection(formattedResponse, contextInfo.progressData, context);
      }

      const communicationRecord = this._recordCommunication(
        'final_response',
        taskResults,
        context,
        formattedResponse,
        Date.now() - startTime
      );

      this._updateSystemStats(Date.now() - startTime);

      this.logger.info(`Final response formatted in ${Date.now() - startTime}ms`);
      return formattedResponse;

    } catch (error) {
      this.logger.error('Final response formatting failed:', error);
      
      return this.responseFormatter.formatErrorResponse(
        error,
        taskResults,
        contextInfo.context
      );
    }
  }

  /**
   * Generate comprehensive progress report with communication enhancements
   * @param {ProgressData} progressData - Progress data to report
   * @param {Object} contextInfo - Context information
   * @param {Object} options - Report options
   * @returns {Promise<FormattedResponse>} Enhanced progress report
   */
  async generateProgressReport(progressData, contextInfo = {}, options = {}) {
    try {
      const startTime = Date.now();
      this.logger.info('Generating enhanced progress report');

      const context = await this.contextAnalyzer.analyzeContext(
        {
          title: 'Progress Report',
          type: 'progress_update',
          complexity: progressData && progressData.milestones && progressData.milestones.length > 5 ? 'medium' : 'low'
        },
        contextInfo.userInfo,
        contextInfo.environmentInfo
      );

      const progressReport = await this.progressReporter.generateProgressReport(
        progressData && progressData.taskId ? progressData.taskId : 'current_task',
        options
      );

      const formattedResponse = progressReport.render(context.userPreferences.preferredFormat);

      if (options.includeRecommendations) {
        await this._addProgressRecommendations(formattedResponse, progressData, context);
      }

      if (options.includeNextSteps) {
        await this._addProgressNextSteps(formattedResponse, progressData, context);
      }

      this._recordCommunication(
        'progress_report',
        null,
        context,
        formattedResponse,
        Date.now() - startTime
      );

      this.logger.info(`Progress report generated in ${Date.now() - startTime}ms`);
      return formattedResponse;

    } catch (error) {
      this.logger.error('Progress report generation failed:', error);
      
      const fallbackResponse = new FormattedResponse();
      fallbackResponse.addSection('Progress Update', 'Progress report generation encountered an issue.');
      return fallbackResponse;
    }
  }

  /**
   * Create comprehensive handoff instructions
   * @param {TaskResults} taskResults - Task results for handoff
   * @param {Array} nextActions - Recommended next actions
   * @param {Object} contextInfo - Context information
   * @returns {Promise<FormattedResponse>} Enhanced handoff instructions
   */
  async createHandoffInstructions(taskResults, nextActions = [], contextInfo = {}) {
    try {
      const startTime = Date.now();
      this.logger.info(`Creating handoff instructions for: ${taskResults.taskTitle}`);

      const context = await this.contextAnalyzer.analyzeContext(
        {
          title: taskResults.taskTitle,
          type: 'handoff',
          complexity: contextInfo.complexity || 'medium'
        },
        contextInfo.userInfo,
        contextInfo.environmentInfo
      );

      const handoffInstructions = await this.handoffManager.createHandoffInstructions(
        taskResults,
        nextActions,
        context
      );

      const formattedResponse = handoffInstructions.render(context.userPreferences.preferredFormat);

      if (contextInfo.includeValidation) {
        const validation = this.handoffManager.validateHandoffCompleteness(handoffInstructions);
        if (!validation.isComplete) {
          formattedResponse.addSection('Handoff Validation', this._formatValidationWarning(validation), 2);
        }
      }

      this._recordCommunication(
        'handoff_instructions',
        taskResults,
        context,
        formattedResponse,
        Date.now() - startTime
      );

      this.logger.info(`Handoff instructions created in ${Date.now() - startTime}ms`);
      return formattedResponse;

    } catch (error) {
      this.logger.error('Handoff instruction creation failed:', error);
      
      const fallbackResponse = new FormattedResponse();
      fallbackResponse.addSection('Handoff Instructions', 'Unable to generate detailed handoff instructions.');
      fallbackResponse.addSection('Basic Next Steps', 'Review task results and plan next actions manually.');
      return fallbackResponse;
    }
  }

  /**
   * Facilitate collaborative workflow with user feedback
   * @param {string} sessionId - Collaboration session identifier
   * @param {TaskResults} taskResults - Current task results
   * @param {Array} feedbackPoints - Points needing user input
   * @param {Object} contextInfo - Context information
   * @returns {Promise<FormattedResponse>} Collaborative response
   */
  async facilitateCollaboration(sessionId, taskResults, feedbackPoints, contextInfo = {}) {
    try {
      const startTime = Date.now();
      this.logger.info(`Facilitating collaboration session: ${sessionId}`);

      const context = await this.contextAnalyzer.analyzeContext(
        {
          title: 'Collaborative Review',
          type: 'collaboration',
          complexity: feedbackPoints.length > 3 ? 'medium' : 'low'
        },
        contextInfo.userInfo,
        contextInfo.environmentInfo
      );

      const session = this.collaborationEngine.createCollaborativeWorkflow(
        sessionId,
        taskResults,
        feedbackPoints,
        context
      );

      const feedbackRequest = this.collaborationEngine.generateFeedbackRequest(session);

      const adaptedStyle = this.contextAnalyzer.adaptCommunicationStyle(
        context,
        'collaboration',
        { feedbackPoints, taskResults }
      );

      this._applyStyleAdaptations(feedbackRequest, adaptedStyle, context);

      this.activeCommunications.set(sessionId, {
        type: 'collaboration',
        session,
        context,
        startTime: Date.now()
      });

      this.logger.info(`Collaboration session started: ${sessionId} with ${feedbackPoints.length} feedback points`);
      return feedbackRequest;

    } catch (error) {
      this.logger.error(`Collaboration facilitation failed for ${sessionId}:`, error);
      
      const fallbackResponse = new FormattedResponse();
      fallbackResponse.addSection('Collaboration Request', 'Please review the completed work and provide feedback.');
      return fallbackResponse;
    }
  }

  /**
   * Process collaborative feedback and generate response
   * @param {string} sessionId - Collaboration session identifier
   * @param {Object} userFeedback - User's feedback
   * @param {Object} options - Processing options
   * @returns {Promise<FormattedResponse>} Feedback response
   */
  async processCollaborativeFeedback(sessionId, userFeedback, options = {}) {
    try {
      const startTime = Date.now();
      this.logger.info(`Processing feedback for session: ${sessionId}`);

      const communication = this.activeCommunications.get(sessionId);
      if (!communication || communication.type !== 'collaboration') {
        throw new Error(`Collaboration session not found: ${sessionId}`);
      }

      const iterationPlan = await this.collaborationEngine.processFeedback(sessionId, userFeedback);
      
      const response = new FormattedResponse();
      response.addSection('Feedback Received', 'Thank you for your feedback. Here\'s how I\'ll proceed:');
      
      if (iterationPlan.changes.length > 0) {
        const changesText = iterationPlan.changes.map(change => `- ${change.description}`).join('\n');
        response.addSection('Planned Changes', changesText, 2);
      }

      if (iterationPlan.requiresMoreFeedback) {
        response.addSection('Additional Questions', this._formatNewFeedbackPoints(iterationPlan.newFeedbackPoints), 2);
      } else {
        response.addSection('Next Steps', 'Proceeding with implementation based on your feedback.', 2);
        
        if (options.generateHandoff) {
          const handoffInstructions = await this.createHandoffInstructions(
            communication.session.taskResults,
            [],
            { context: communication.context }
          );
          response.sections.push(...handoffInstructions.sections);
        }
      }

      this.logger.info(`Feedback processed for session: ${sessionId}`);
      return response;

    } catch (error) {
      this.logger.error(`Feedback processing failed for ${sessionId}:`, error);
      
      const errorResponse = new FormattedResponse();
      errorResponse.addSection('Feedback Processing Error', 'Unable to process feedback. Please try again.');
      return errorResponse;
    }
  }

  /**
   * Initialize progress tracking for a task
   * @param {string} taskId - Task identifier
   * @param {Array} milestones - Task milestones
   * @param {Object} options - Progress tracking options
   * @returns {Object} Progress tracking setup
   */
  initializeProgressTracking(taskId, milestones, options = {}) {
    try {
      this.logger.info(`Initializing progress tracking: ${taskId}`);

      const progressData = this.progressReporter.initializeProgress(taskId, milestones);
      
      if (options.enableRealTime) {
        this.progressReporter.enableRealTimeUpdates(options.updateInterval);
      }

      this.logger.debug(`Progress tracking initialized for ${taskId} with ${milestones.length} milestones`);
      return { taskId, progressData, trackingEnabled: true };

    } catch (error) {
      this.logger.error(`Progress tracking initialization failed for ${taskId}:`, error);
      return { taskId, trackingEnabled: false, error: error.message };
    }
  }

  /**
   * Update task progress and generate communication if needed
   * @param {string} taskId - Task identifier
   * @param {string} milestoneId - Milestone identifier
   * @param {number} progress - Progress percentage
   * @param {Object} options - Update options
   * @returns {Promise<FormattedResponse|null>} Progress update response if needed
   */
  async updateProgress(taskId, milestoneId, progress, options = {}) {
    try {
      this.progressReporter.updateMilestoneProgress(taskId, milestoneId, progress, options.metadata);

      if (progress === 100) {
        this.progressReporter.completeMilestone(taskId, milestoneId, options.completionData);
      }

      if (options.generateReport) {
        const progressData = this.progressReporter.getProgressStatus(taskId);
        if (progressData && options.contextInfo) {
          return await this.generateProgressReport(progressData, options.contextInfo);
        }
      }

      return null;

    } catch (error) {
      this.logger.error(`Progress update failed for ${taskId}:${milestoneId}:`, error);
      return null;
    }
  }

  /**
   * Complete collaboration session with summary
   * @param {string} sessionId - Collaboration session identifier
   * @param {Object} completionData - Completion details
   * @returns {Promise<FormattedResponse>} Collaboration summary
   */
  async completeCollaboration(sessionId, completionData = {}) {
    try {
      const communication = this.activeCommunications.get(sessionId);
      if (!communication) {
        throw new Error(`Communication session not found: ${sessionId}`);
      }

      const summary = this.collaborationEngine.completeCollaboration(sessionId, completionData);
      
      const response = new FormattedResponse();
      response.addSection('Collaboration Complete', 'Thank you for your participation in this collaborative process.');
      
      if (summary) {
        response.addSection('Session Summary', this._formatCollaborationSummary(summary), 2);
      }

      this.activeCommunications.delete(sessionId);
      
      this.logger.info(`Collaboration session completed: ${sessionId}`);
      return response;

    } catch (error) {
      this.logger.error(`Collaboration completion failed for ${sessionId}:`, error);
      
      const errorResponse = new FormattedResponse();
      errorResponse.addSection('Collaboration Session', 'Session completed with some issues.');
      return errorResponse;
    }
  }

  /**
   * Apply style adaptations to formatted response
   * @private
   */
  _applyStyleAdaptations(response, adaptedStyle, context) {
    if (adaptedStyle.lengthAdjustments.includes('shorten') && context.isConcise()) {
      const truncated = response.truncate(context.getMaxLength() * 0.7);
      response.sections = truncated.sections;
    }

    if (adaptedStyle.styleRecommendations.includes('minimal')) {
      response.sections.forEach(section => {
        if (section.level > 2) {
          section.level = 2;
        }
      });
    }

    if (adaptedStyle.formatAdjustments.includes('add_structure') && response.sections.length > 3) {
      const overviewContent = 'This response covers the following areas: ' + 
        response.sections.map(s => s.title).join(', ') + '.';
      response.sections.unshift({
        title: 'Overview',
        content: overviewContent,
        level: 1,
        id: 'overview',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Add handoff section to response
   * @private
   */
  async _addHandoffSection(response, taskResults, context) {
    try {
      const nextActions = await this.handoffManager.generateNextActions(taskResults, context);
      const topActions = nextActions.slice(0, 3).map(action => `- ${action.action}`).join('\n');
      
      response.addSection('Next Steps', topActions, 2);
      
    } catch (error) {
      this.logger.warn('Failed to add handoff section:', error);
    }
  }

  /**
   * Add progress section to response
   * @private
   */
  async _addProgressSection(response, progressData, context) {
    try {
      const progressReport = await this.progressReporter.generateProgressReport(
        progressData.taskId || 'current_task'
      );
      
      const completedMilestones = progressData.milestones ? progressData.milestones.filter(m => m.completed) : [];
      const progressSummary = `Progress: ${progressData.overallProgress.toFixed(1)}% complete\n` +
        `Milestones: ${completedMilestones.length}/${progressData.milestones ? progressData.milestones.length : 0} completed`;
      
      response.addSection('Progress Status', progressSummary, 2);
      
    } catch (error) {
      this.logger.warn('Failed to add progress section:', error);
    }
  }

  /**
   * Add progress recommendations
   * @private
   */
  async _addProgressRecommendations(response, progressData, context) {
    const recommendations = [];
    
    const blocked = progressData.milestones.filter(m => m.isBlocked());
    if (blocked.length > 0) {
      recommendations.push(`Address ${blocked.length} blocked milestone(s)`);
    }
    
    const overdue = progressData.getInProgressMilestones()
      .filter(m => m.getDuration() > m.estimatedTime * 1.5);
    if (overdue.length > 0) {
      recommendations.push(`Review ${overdue.length} overdue milestone(s)`);
    }
    
    if (recommendations.length > 0) {
      response.addSection('Recommendations', recommendations.map(r => `- ${r}`).join('\n'), 2);
    }
  }

  /**
   * Add progress next steps
   * @private
   */
  async _addProgressNextSteps(response, progressData, context) {
    const nextMilestone = progressData.getNextMilestone();
    if (nextMilestone) {
      const nextSteps = `Continue with: ${nextMilestone.name}`;
      response.addSection('Next Milestone', nextSteps, 2);
    }
  }

  /**
   * Format validation warning
   * @private
   */
  _formatValidationWarning(validation) {
    let warning = `⚠ Handoff completeness: ${validation.score}/100\n\n`;
    
    if (validation.missingElements.length > 0) {
      warning += 'Missing elements:\n';
      warning += validation.missingElements.map(e => `- ${e}`).join('\n');
      warning += '\n\n';
    }
    
    if (validation.recommendations.length > 0) {
      warning += 'Recommendations:\n';
      warning += validation.recommendations.map(r => `- ${r}`).join('\n');
    }
    
    return warning;
  }

  /**
   * Format new feedback points
   * @private
   */
  _formatNewFeedbackPoints(feedbackPoints) {
    return feedbackPoints.map((point, index) => {
      let formatted = `${index + 1}. **${point.title}**\n`;
      formatted += `   ${point.description}\n`;
      
      if (point.options && point.options.length > 0) {
        formatted += `   Options: ${point.options.join(', ')}\n`;
      }
      
      return formatted;
    }).join('\n');
  }

  /**
   * Format collaboration summary
   * @private
   */
  _formatCollaborationSummary(summary) {
    let formatted = `Duration: ${this._formatDuration(summary.collaborationDuration)}\n`;
    formatted += `Iterations: ${summary.totalIterations}\n`;
    formatted += `Feedback Points: ${summary.feedbackPointsCount}\n`;
    formatted += `Status: ${summary.status}\n`;
    
    if (summary.keyDecisions && summary.keyDecisions.length > 0) {
      formatted += '\nKey Decisions:\n';
      formatted += summary.keyDecisions.map(d => `- ${d.decision}`).join('\n');
    }
    
    return formatted;
  }

  /**
   * Format duration in human-readable form
   * @private
   */
  _formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Record communication for analytics
   * @private
   */
  _recordCommunication(type, taskResults, context, response, processingTime) {
    const record = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      taskTitle: taskResults ? taskResults.taskTitle : 'N/A',
      context: {
        complexity: context.taskComplexity,
        verbosity: context.userPreferences.verbosityLevel,
        style: context.adaptationStrategy?.communicationStyle
      },
      response: {
        wordCount: response.getMetadata().wordCount,
        sections: response.sections.length,
        characterCount: response.getMetadata().characterCount
      },
      processingTime,
      timestamp: Date.now()
    };

    this.communicationHistory.push(record);

    // Keep history manageable
    if (this.communicationHistory.length > 1000) {
      this.communicationHistory = this.communicationHistory.slice(-500);
    }

    return record;
  }

  /**
   * Update system statistics
   * @private
   */
  _updateSystemStats(responseTime) {
    this.systemStats.totalCommunications++;
    
    const totalTime = this.systemStats.averageResponseTime * (this.systemStats.totalCommunications - 1) + responseTime;
    this.systemStats.averageResponseTime = totalTime / this.systemStats.totalCommunications;
  }

  /**
   * Get comprehensive system statistics
   * @returns {Object} Communication enhancement statistics
   */
  getSystemStatistics() {
    const formatterStats = this.responseFormatter.getFormatterStatistics();
    const reporterStats = this.progressReporter.getReporterStatistics();
    const collaborationStats = this.collaborationEngine.getCollaborationStatistics();
    const analyzerStats = this.contextAnalyzer.getAnalyzerStatistics();
    const handoffStats = this.handoffManager.getHandoffStatistics();

    return {
      system: {
        ...this.systemStats,
        uptime: Date.now() - this.systemStats.systemStartTime,
        activeCommunications: this.activeCommunications.size,
        communicationHistory: this.communicationHistory.length
      },
      responseFormatter: formatterStats,
      progressReporter: reporterStats,
      collaborationEngine: collaborationStats,
      contextAnalyzer: analyzerStats,
      handoffManager: handoffStats
    };
  }

  /**
   * Update user profile with communication feedback
   * @param {string} userId - User identifier
   * @param {Object} interactionData - Interaction data
   * @param {Object} feedback - User feedback
   */
  updateUserProfile(userId, interactionData, feedback) {
    this.contextAnalyzer.updateUserProfile(userId, interactionData, feedback);
  }

  /**
   * Get communication recommendations for context
   * @param {Object} contextInfo - Context information
   * @param {string} messageType - Type of message
   * @returns {Object} Communication recommendations
   */
  async getCommunicationRecommendations(contextInfo, messageType) {
    const context = await this.contextAnalyzer.analyzeContext(
      contextInfo.taskInfo,
      contextInfo.userInfo,
      contextInfo.environmentInfo
    );
    
    return this.contextAnalyzer.getRecommendations(context, messageType);
  }

  /**
   * Cleanup old communication data
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of cleaned items
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    let cleanedUp = 0;

    // Clean communication history
    const cutoffTime = Date.now() - maxAge;
    const originalHistoryLength = this.communicationHistory.length;
    this.communicationHistory = this.communicationHistory.filter(h => h.timestamp > cutoffTime);
    cleanedUp += originalHistoryLength - this.communicationHistory.length;

    // Clean subsystem data
    cleanedUp += this.responseFormatter.cleanup ? this.responseFormatter.cleanup(maxAge) : 0;
    cleanedUp += this.progressReporter.cleanup(maxAge);
    cleanedUp += this.collaborationEngine.cleanup(maxAge);
    cleanedUp += this.contextAnalyzer.cleanup(maxAge);
    cleanedUp += this.handoffManager.cleanup(maxAge);

    if (cleanedUp > 0) {
      this.logger.info(`Communication Enhancement cleaned up ${cleanedUp} old records`);
    }

    return cleanedUp;
  }
}

export default CommunicationEnhancement;