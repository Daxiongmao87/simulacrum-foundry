/**
 * Communication Enhancement - Collaboration Engine
 * User feedback facilitation and iteration support system
 */

import { FormattedResponse, HandoffInstructions } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class CollaborationEngine {
  constructor() {
    this.logger = createLogger('CollaborationEngine');
    this.collaborationSessions = new Map();
    this.feedbackHistory = [];
    this.iterationPatterns = new Map();
    this.collaborationStats = {
      totalSessions: 0,
      totalFeedbackPoints: 0,
      averageIterations: 0,
      successfulCollaborations: 0
    };
    
    this._initializeIterationPatterns();
  }

  /**
   * Create collaborative workflow for user feedback
   * @param {string} sessionId - Collaboration session identifier
   * @param {TaskResults} taskResults - Current task results
   * @param {Array} feedbackPoints - Points needing user input
   * @param {CommunicationContext} context - Communication context
   * @returns {Object} Collaboration session
   */
  createCollaborativeWorkflow(sessionId, taskResults, feedbackPoints, context) {
    try {
      this.logger.info(`Creating collaborative workflow: ${sessionId}`);

      const session = {
        id: sessionId,
        taskResults,
        feedbackPoints: this._structureFeedbackPoints(feedbackPoints),
        context,
        status: 'awaiting_feedback',
        iterationCount: 0,
        responses: [],
        createdAt: Date.now(),
        lastUpdated: Date.now()
      };

      this.collaborationSessions.set(sessionId, session);
      this.collaborationStats.totalSessions++;
      this.collaborationStats.totalFeedbackPoints += feedbackPoints.length;

      this.logger.debug(`Collaboration session created with ${feedbackPoints.length} feedback points`);
      return session;

    } catch (error) {
      this.logger.error(`Failed to create collaborative workflow: ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * Process user feedback and generate next iteration
   * @param {string} sessionId - Collaboration session identifier
   * @param {Object} userFeedback - User's feedback response
   * @returns {Promise<Object>} Next iteration plan
   */
  async processFeedback(sessionId, userFeedback) {
    try {
      const session = this.collaborationSessions.get(sessionId);
      if (!session) {
        throw new Error(`Collaboration session not found: ${sessionId}`);
      }

      this.logger.info(`Processing feedback for session: ${sessionId}`);

      const feedbackAnalysis = await this._analyzeFeedback(userFeedback, session);
      const iterationPlan = await this._generateIterationPlan(feedbackAnalysis, session);

      session.responses.push({
        feedback: userFeedback,
        analysis: feedbackAnalysis,
        iterationPlan,
        timestamp: Date.now()
      });

      session.iterationCount++;
      session.lastUpdated = Date.now();
      session.status = iterationPlan.requiresMoreFeedback ? 'awaiting_feedback' : 'ready_to_proceed';

      this._recordFeedbackHistory(sessionId, userFeedback, feedbackAnalysis);
      this._updateCollaborationStats(session);

      this.logger.debug(`Feedback processed, iteration ${session.iterationCount} planned`);
      return iterationPlan;

    } catch (error) {
      this.logger.error(`Feedback processing failed for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Generate feedback request response
   * @param {Object} session - Collaboration session
   * @returns {FormattedResponse} Formatted feedback request
   */
  generateFeedbackRequest(session) {
    const response = new FormattedResponse();
    
    response.addSection('Work Completed', this._formatCompletedWork(session.taskResults));
    
    response.addSection('Feedback Needed', this._formatFeedbackPoints(session.feedbackPoints));
    
    response.addSection('How to Respond', this._formatFeedbackInstructions(session));

    return response;
  }

  /**
   * Create iteration checkpoint
   * @param {string} sessionId - Collaboration session identifier
   * @param {string} checkpointName - Checkpoint identifier
   * @param {Object} checkpointData - Checkpoint data
   */
  createIterationCheckpoint(sessionId, checkpointName, checkpointData) {
    try {
      const session = this.collaborationSessions.get(sessionId);
      if (!session) {
        throw new Error(`Collaboration session not found: ${sessionId}`);
      }

      if (!session.checkpoints) {
        session.checkpoints = [];
      }

      session.checkpoints.push({
        name: checkpointName,
        data: checkpointData,
        timestamp: Date.now(),
        iterationCount: session.iterationCount
      });

      this.logger.debug(`Checkpoint created: ${checkpointName} for session ${sessionId}`);

    } catch (error) {
      this.logger.error(`Checkpoint creation failed for ${sessionId}:`, error);
    }
  }

  /**
   * Generate collaboration summary
   * @param {string} sessionId - Collaboration session identifier
   * @returns {Object} Collaboration summary
   */
  generateCollaborationSummary(sessionId) {
    const session = this.collaborationSessions.get(sessionId);
    if (!session) {
      return null;
    }

    const summary = {
      sessionId,
      totalIterations: session.iterationCount,
      feedbackPointsCount: session.feedbackPoints.length,
      responsesReceived: session.responses.length,
      collaborationDuration: Date.now() - session.createdAt,
      status: session.status,
      keyDecisions: this._extractKeyDecisions(session),
      userPreferences: this._inferUserPreferences(session),
      outcomeAssessment: this._assessCollaborationOutcome(session)
    };

    return summary;
  }

  /**
   * Facilitate iterative improvement process
   * @param {string} sessionId - Collaboration session identifier
   * @param {Object} improvementGoals - Improvement objectives
   * @returns {Promise<Object>} Improvement plan
   */
  async facilitateIterativeImprovement(sessionId, improvementGoals) {
    try {
      const session = this.collaborationSessions.get(sessionId);
      if (!session) {
        throw new Error(`Collaboration session not found: ${sessionId}`);
      }

      const improvementPlan = {
        goals: improvementGoals,
        currentState: this._assessCurrentState(session),
        recommendedActions: await this._generateImprovementActions(session, improvementGoals),
        expectedOutcomes: this._predictImprovementOutcomes(session, improvementGoals),
        timeline: this._estimateImprovementTimeline(improvementGoals),
        riskFactors: this._identifyImprovementRisks(session, improvementGoals)
      };

      session.improvementPlan = improvementPlan;
      session.lastUpdated = Date.now();

      this.logger.info(`Iterative improvement plan created for session ${sessionId}`);
      return improvementPlan;

    } catch (error) {
      this.logger.error(`Iterative improvement facilitation failed for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Complete collaboration session
   * @param {string} sessionId - Collaboration session identifier
   * @param {Object} completionData - Completion details
   * @returns {Object} Completion summary
   */
  completeCollaboration(sessionId, completionData = {}) {
    try {
      const session = this.collaborationSessions.get(sessionId);
      if (!session) {
        throw new Error(`Collaboration session not found: ${sessionId}`);
      }

      session.status = 'completed';
      session.completedAt = Date.now();
      session.completionData = completionData;

      const summary = this.generateCollaborationSummary(sessionId);
      
      if (this._wasCollaborationSuccessful(session)) {
        this.collaborationStats.successfulCollaborations++;
      }

      this._updateAverageIterations();

      this.logger.info(`Collaboration completed: ${sessionId} after ${session.iterationCount} iterations`);
      return summary;

    } catch (error) {
      this.logger.error(`Collaboration completion failed for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Structure feedback points for clarity
   * @private
   */
  _structureFeedbackPoints(feedbackPoints) {
    return feedbackPoints.map((point, index) => {
      if (typeof point === 'string') {
        return {
          id: `feedback_${index}`,
          title: `Feedback Point ${index + 1}`,
          description: point,
          type: 'open_question',
          required: true,
          options: []
        };
      }

      return {
        id: point.id || `feedback_${index}`,
        title: point.title || `Feedback Point ${index + 1}`,
        description: point.description || point.question || point,
        type: point.type || 'open_question',
        required: point.required !== false,
        options: point.options || [],
        context: point.context,
        examples: point.examples
      };
    });
  }

  /**
   * Analyze user feedback
   * @private
   */
  async _analyzeFeedback(userFeedback, session) {
    const analysis = {
      responses: {},
      sentiment: 'neutral',
      clarity: 'good',
      actionItems: [],
      concerns: [],
      approvals: [],
      suggestions: []
    };

    // Process each feedback response
    for (const point of session.feedbackPoints) {
      const response = userFeedback[point.id] || userFeedback[point.title];
      if (response) {
        analysis.responses[point.id] = {
          original: response,
          processed: this._processIndividualResponse(response, point),
          confidence: this._assessResponseConfidence(response, point)
        };
      }
    }

    // Analyze overall sentiment
    analysis.sentiment = this._analyzeSentiment(userFeedback);
    
    // Extract action items
    analysis.actionItems = this._extractActionItems(userFeedback, analysis.responses);
    
    // Identify concerns and approvals
    analysis.concerns = this._identifyConcerns(userFeedback, analysis.responses);
    analysis.approvals = this._identifyApprovals(userFeedback, analysis.responses);
    
    // Extract suggestions
    analysis.suggestions = this._extractSuggestions(userFeedback, analysis.responses);

    return analysis;
  }

  /**
   * Generate iteration plan based on feedback analysis
   * @private
   */
  async _generateIterationPlan(feedbackAnalysis, session) {
    const plan = {
      iterationNumber: session.iterationCount + 1,
      changes: [],
      validations: [],
      newFeedbackPoints: [],
      requiresMoreFeedback: false,
      estimatedEffort: 0,
      priority: 'normal'
    };

    // Generate changes based on action items
    for (const actionItem of feedbackAnalysis.actionItems) {
      const change = await this._planChangeFromActionItem(actionItem, session);
      plan.changes.push(change);
      plan.estimatedEffort += change.estimatedEffort || 1;
    }

    // Address concerns with validations
    for (const concern of feedbackAnalysis.concerns) {
      const validation = this._planValidationForConcern(concern, session);
      plan.validations.push(validation);
    }

    // Generate new feedback points if needed
    if (feedbackAnalysis.suggestions.length > 0) {
      plan.newFeedbackPoints = feedbackAnalysis.suggestions.map(suggestion => ({
        title: `Regarding: ${suggestion.topic}`,
        description: `How would you like to handle: ${suggestion.description}`,
        type: 'choice',
        options: suggestion.options || ['Proceed as suggested', 'Modify approach', 'Skip for now']
      }));
      plan.requiresMoreFeedback = true;
    }

    // Determine priority based on feedback sentiment
    if (feedbackAnalysis.concerns.length > 2) {
      plan.priority = 'high';
    } else if (feedbackAnalysis.approvals.length > feedbackAnalysis.concerns.length) {
      plan.priority = 'normal';
    }

    return plan;
  }

  /**
   * Process individual feedback response
   * @private
   */
  _processIndividualResponse(response, feedbackPoint) {
    const processed = {
      text: response.toString().trim(),
      type: feedbackPoint.type,
      intent: 'neutral',
      actionable: false
    };

    // Determine intent
    const lowerText = processed.text.toLowerCase();
    if (/\b(yes|approve|good|correct|right|agree)\b/.test(lowerText)) {
      processed.intent = 'approval';
    } else if (/\b(no|reject|wrong|disagree|change)\b/.test(lowerText)) {
      processed.intent = 'rejection';
    } else if (/\b(maybe|unsure|depends|consider)\b/.test(lowerText)) {
      processed.intent = 'uncertain';
    } else if (/\b(suggest|recommend|try|instead|better)\b/.test(lowerText)) {
      processed.intent = 'suggestion';
    }

    // Check if actionable
    processed.actionable = /\b(change|update|add|remove|modify|fix|improve)\b/.test(lowerText);

    return processed;
  }

  /**
   * Assess response confidence level
   * @private
   */
  _assessResponseConfidence(response, feedbackPoint) {
    const text = response.toString().toLowerCase();
    
    if (feedbackPoint.type === 'choice' && feedbackPoint.options.includes(response)) {
      return 'high';
    }
    
    if (text.length < 10) {
      return 'low';
    }
    
    if (/\b(definitely|absolutely|certainly|sure|confident)\b/.test(text)) {
      return 'high';
    }
    
    if (/\b(maybe|perhaps|possibly|might|unsure)\b/.test(text)) {
      return 'low';
    }
    
    return 'medium';
  }

  /**
   * Analyze overall sentiment of feedback
   * @private
   */
  _analyzeSentiment(userFeedback) {
    const allText = Object.values(userFeedback).join(' ').toLowerCase();
    
    const positiveWords = ['good', 'great', 'excellent', 'perfect', 'love', 'like', 'approve', 'yes'];
    const negativeWords = ['bad', 'wrong', 'hate', 'dislike', 'no', 'terrible', 'awful', 'reject'];
    
    const positiveCount = positiveWords.filter(word => allText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => allText.includes(word)).length;
    
    if (positiveCount > negativeCount * 1.5) return 'positive';
    if (negativeCount > positiveCount * 1.5) return 'negative';
    return 'neutral';
  }

  /**
   * Extract actionable items from feedback
   * @private
   */
  _extractActionItems(userFeedback, responses) {
    const actionItems = [];
    
    for (const [pointId, response] of Object.entries(responses)) {
      if (response.processed.actionable) {
        actionItems.push({
          id: `action_${actionItems.length}`,
          source: pointId,
          description: response.original,
          intent: response.processed.intent,
          priority: response.confidence === 'high' ? 'high' : 'normal',
          estimatedEffort: this._estimateActionEffort(response.original)
        });
      }
    }
    
    return actionItems;
  }

  /**
   * Identify concerns from feedback
   * @private
   */
  _identifyConcerns(userFeedback, responses) {
    const concerns = [];
    
    for (const [pointId, response] of Object.entries(responses)) {
      if (response.processed.intent === 'rejection' || 
          response.processed.intent === 'uncertain') {
        concerns.push({
          source: pointId,
          description: response.original,
          severity: response.confidence === 'high' ? 'high' : 'medium',
          type: response.processed.intent === 'rejection' ? 'objection' : 'uncertainty'
        });
      }
    }
    
    return concerns;
  }

  /**
   * Identify approvals from feedback
   * @private
   */
  _identifyApprovals(userFeedback, responses) {
    const approvals = [];
    
    for (const [pointId, response] of Object.entries(responses)) {
      if (response.processed.intent === 'approval') {
        approvals.push({
          source: pointId,
          description: response.original,
          confidence: response.confidence
        });
      }
    }
    
    return approvals;
  }

  /**
   * Extract suggestions from feedback
   * @private
   */
  _extractSuggestions(userFeedback, responses) {
    const suggestions = [];
    
    for (const [pointId, response] of Object.entries(responses)) {
      if (response.processed.intent === 'suggestion') {
        suggestions.push({
          source: pointId,
          topic: pointId.replace('feedback_', 'Point '),
          description: response.original,
          priority: response.confidence === 'high' ? 'high' : 'normal'
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Plan change from action item
   * @private
   */
  async _planChangeFromActionItem(actionItem, session) {
    return {
      id: `change_${Date.now()}`,
      description: actionItem.description,
      type: 'modification',
      priority: actionItem.priority,
      estimatedEffort: actionItem.estimatedEffort,
      dependencies: [],
      validationRequired: true,
      rollbackPlan: 'Revert to previous iteration state'
    };
  }

  /**
   * Plan validation for concern
   * @private
   */
  _planValidationForConcern(concern, session) {
    return {
      id: `validation_${Date.now()}`,
      concernSource: concern.source,
      description: `Validate resolution of: ${concern.description}`,
      type: concern.type === 'objection' ? 'acceptance_test' : 'clarification_check',
      priority: concern.severity,
      expectedOutcome: 'Concern addressed and validated'
    };
  }

  /**
   * Format completed work for display
   * @private
   */
  _formatCompletedWork(taskResults) {
    const sections = [];
    
    if (taskResults.outputs.size > 0) {
      sections.push('**Outputs Generated:**');
      const outputs = Array.from(taskResults.outputs.entries());
      sections.push(outputs.map(([key, output]) => `- ${key}: ${output.value}`).join('\n'));
    }
    
    if (taskResults.changes.length > 0) {
      sections.push('\n**Changes Made:**');
      sections.push(taskResults.changes.map(change => `- ${change.description || change.type}`).join('\n'));
    }
    
    return sections.join('\n');
  }

  /**
   * Format feedback points for display
   * @private
   */
  _formatFeedbackPoints(feedbackPoints) {
    return feedbackPoints.map((point, index) => {
      let formatted = `${index + 1}. **${point.title}**\n`;
      formatted += `   ${point.description}\n`;
      
      if (point.options && point.options.length > 0) {
        formatted += `   Options: ${point.options.join(', ')}\n`;
      }
      
      if (point.context) {
        formatted += `   Context: ${point.context}\n`;
      }
      
      return formatted;
    }).join('\n');
  }

  /**
   * Format feedback instructions
   * @private
   */
  _formatFeedbackInstructions(session) {
    let instructions = 'Please provide your feedback on the points above. You can:\n\n';
    instructions += '- Answer each numbered point directly\n';
    instructions += '- Use "approve" or "looks good" for acceptance\n';
    instructions += '- Describe any changes or improvements needed\n';
    instructions += '- Ask questions if anything is unclear\n\n';
    instructions += 'Your feedback will help me improve the work and continue effectively.';
    
    return instructions;
  }

  /**
   * Extract key decisions from session
   * @private
   */
  _extractKeyDecisions(session) {
    const decisions = [];
    
    session.responses.forEach((response, index) => {
      response.analysis.actionItems.forEach(actionItem => {
        if (actionItem.priority === 'high') {
          decisions.push({
            iteration: index + 1,
            decision: actionItem.description,
            rationale: 'High priority user feedback',
            impact: 'significant'
          });
        }
      });
    });
    
    return decisions;
  }

  /**
   * Infer user preferences from session
   * @private
   */
  _inferUserPreferences(session) {
    const preferences = {
      communicationStyle: 'standard',
      detailLevel: 'normal',
      feedbackFrequency: 'normal',
      decisionMaking: 'collaborative'
    };
    
    // Analyze response patterns
    const avgResponseLength = session.responses.reduce((sum, r) => {
      const responseText = Object.values(r.feedback).join(' ');
      return sum + responseText.length;
    }, 0) / Math.max(session.responses.length, 1);
    
    if (avgResponseLength > 200) {
      preferences.detailLevel = 'detailed';
    } else if (avgResponseLength < 50) {
      preferences.detailLevel = 'brief';
    }
    
    return preferences;
  }

  /**
   * Assess collaboration outcome
   * @private
   */
  _assessCollaborationOutcome(session) {
    const assessment = {
      effectiveness: 'moderate',
      userSatisfaction: 'neutral',
      goalAchievement: 'partial',
      communicationQuality: 'good'
    };
    
    // Assess based on iteration count and feedback quality
    if (session.iterationCount <= 2 && session.responses.length > 0) {
      assessment.effectiveness = 'high';
    } else if (session.iterationCount > 5) {
      assessment.effectiveness = 'low';
    }
    
    // Assess user satisfaction from sentiment analysis
    const latestResponse = session.responses[session.responses.length - 1];
    if (latestResponse && latestResponse.analysis.sentiment === 'positive') {
      assessment.userSatisfaction = 'high';
    } else if (latestResponse && latestResponse.analysis.sentiment === 'negative') {
      assessment.userSatisfaction = 'low';
    }
    
    return assessment;
  }

  /**
   * Assess current collaboration state
   * @private
   */
  _assessCurrentState(session) {
    return {
      iterationCount: session.iterationCount,
      feedbackCompleteness: this._calculateFeedbackCompleteness(session),
      consensusLevel: this._calculateConsensusLevel(session),
      momentumStatus: this._assessMomentumStatus(session)
    };
  }

  /**
   * Generate improvement actions
   * @private
   */
  async _generateImprovementActions(session, improvementGoals) {
    const actions = [];
    
    // Based on improvement goals, suggest specific actions
    for (const goal of improvementGoals) {
      if (goal.type === 'efficiency') {
        actions.push({
          action: 'Streamline feedback collection process',
          description: 'Reduce feedback rounds by asking more targeted questions',
          priority: 'medium',
          effort: 'low'
        });
      }
      
      if (goal.type === 'clarity') {
        actions.push({
          action: 'Improve feedback point descriptions',
          description: 'Add more context and examples to each feedback point',
          priority: 'high',
          effort: 'medium'
        });
      }
    }
    
    return actions;
  }

  /**
   * Predict improvement outcomes
   * @private
   */
  _predictImprovementOutcomes(session, improvementGoals) {
    return improvementGoals.map(goal => ({
      goal: goal.description,
      expectedImprovement: this._estimateImprovement(goal, session),
      confidence: 'medium',
      timeline: goal.urgency === 'high' ? 'immediate' : 'next_iteration'
    }));
  }

  /**
   * Estimate improvement timeline
   * @private
   */
  _estimateImprovementTimeline(improvementGoals) {
    const totalEffort = improvementGoals.reduce((sum, goal) => {
      return sum + (goal.effort === 'high' ? 3 : goal.effort === 'medium' ? 2 : 1);
    }, 0);
    
    return {
      totalEffort,
      estimatedDuration: `${totalEffort} iteration(s)`,
      parallelizable: improvementGoals.filter(g => g.type !== 'sequential').length,
      criticalPath: improvementGoals.filter(g => g.priority === 'high').length
    };
  }

  /**
   * Identify improvement risks
   * @private
   */
  _identifyImprovementRisks(session, improvementGoals) {
    const risks = [];
    
    if (improvementGoals.length > 3) {
      risks.push({
        risk: 'Scope creep',
        probability: 'medium',
        impact: 'high',
        mitigation: 'Prioritize goals and implement incrementally'
      });
    }
    
    if (session.iterationCount > 3) {
      risks.push({
        risk: 'User fatigue',
        probability: 'high',
        impact: 'medium',
        mitigation: 'Streamline feedback process and reduce iteration cycles'
      });
    }
    
    return risks;
  }

  /**
   * Check if collaboration was successful
   * @private
   */
  _wasCollaborationSuccessful(session) {
    return session.status === 'completed' &&
           session.responses.length > 0 &&
           session.responses[session.responses.length - 1].analysis.sentiment !== 'negative';
  }

  /**
   * Update average iterations statistic
   * @private
   */
  _updateAverageIterations() {
    const completedSessions = Array.from(this.collaborationSessions.values())
      .filter(s => s.status === 'completed');
    
    if (completedSessions.length > 0) {
      const totalIterations = completedSessions.reduce((sum, s) => sum + s.iterationCount, 0);
      this.collaborationStats.averageIterations = totalIterations / completedSessions.length;
    }
  }

  /**
   * Record feedback history
   * @private
   */
  _recordFeedbackHistory(sessionId, userFeedback, analysis) {
    this.feedbackHistory.push({
      sessionId,
      feedback: userFeedback,
      analysis,
      timestamp: Date.now()
    });

    // Keep history manageable
    if (this.feedbackHistory.length > 1000) {
      this.feedbackHistory = this.feedbackHistory.slice(-500);
    }
  }

  /**
   * Update collaboration statistics
   * @private
   */
  _updateCollaborationStats(session) {
    // Statistics are updated in real-time through other methods
  }

  /**
   * Calculate feedback completeness
   * @private
   */
  _calculateFeedbackCompleteness(session) {
    if (session.responses.length === 0) return 0;
    
    const latestResponse = session.responses[session.responses.length - 1];
    const totalPoints = session.feedbackPoints.length;
    const answeredPoints = Object.keys(latestResponse.analysis.responses).length;
    
    return (answeredPoints / totalPoints) * 100;
  }

  /**
   * Calculate consensus level
   * @private
   */
  _calculateConsensusLevel(session) {
    if (session.responses.length === 0) return 0;
    
    const latestResponse = session.responses[session.responses.length - 1];
    const totalResponses = Object.keys(latestResponse.analysis.responses).length;
    const agreementResponses = latestResponse.analysis.approvals.length;
    
    return totalResponses > 0 ? (agreementResponses / totalResponses) * 100 : 0;
  }

  /**
   * Assess momentum status
   * @private
   */
  _assessMomentumStatus(session) {
    if (session.responses.length === 0) return 'stalled';
    
    const timeSinceLastResponse = Date.now() - session.lastUpdated;
    const daysSinceLastResponse = timeSinceLastResponse / (24 * 60 * 60 * 1000);
    
    if (daysSinceLastResponse > 7) return 'stalled';
    if (daysSinceLastResponse > 2) return 'slow';
    return 'active';
  }

  /**
   * Estimate improvement potential
   * @private
   */
  _estimateImprovement(goal, session) {
    // Simplified improvement estimation
    const baseImprovement = 20; // 20% base improvement
    const sessionMultiplier = Math.min(session.iterationCount / 3, 1); // More iterations = more improvement potential
    const priorityMultiplier = goal.priority === 'high' ? 1.5 : 1;
    
    return Math.round(baseImprovement * sessionMultiplier * priorityMultiplier);
  }

  /**
   * Estimate action effort
   * @private
   */
  _estimateActionEffort(actionText) {
    const text = actionText.toLowerCase();
    
    if (text.includes('major') || text.includes('complete') || text.includes('overhaul')) {
      return 5;
    }
    
    if (text.includes('add') || text.includes('create') || text.includes('implement')) {
      return 3;
    }
    
    if (text.includes('modify') || text.includes('update') || text.includes('change')) {
      return 2;
    }
    
    return 1;
  }

  /**
   * Initialize iteration patterns
   * @private
   */
  _initializeIterationPatterns() {
    this.iterationPatterns.set('rapid_iteration', {
      maxIterations: 3,
      feedbackStyle: 'focused',
      responseTime: 'immediate',
      description: 'Quick iterative cycles with focused feedback'
    });

    this.iterationPatterns.set('thorough_review', {
      maxIterations: 5,
      feedbackStyle: 'comprehensive',
      responseTime: 'extended',
      description: 'Detailed review cycles with comprehensive feedback'
    });

    this.iterationPatterns.set('checkpoint_driven', {
      maxIterations: 4,
      feedbackStyle: 'milestone',
      responseTime: 'scheduled',
      description: 'Feedback at major milestone checkpoints'
    });
  }

  /**
   * Get collaboration engine statistics
   * @returns {Object} Current collaboration statistics
   */
  getCollaborationStatistics() {
    return {
      ...this.collaborationStats,
      activeSessions: this.collaborationSessions.size,
      feedbackHistorySize: this.feedbackHistory.length,
      averageSessionDuration: this._calculateAverageSessionDuration(),
      successRate: this.collaborationStats.totalSessions > 0 
        ? (this.collaborationStats.successfulCollaborations / this.collaborationStats.totalSessions) * 100 
        : 0
    };
  }

  /**
   * Calculate average session duration
   * @private
   */
  _calculateAverageSessionDuration() {
    const completedSessions = Array.from(this.collaborationSessions.values())
      .filter(s => s.status === 'completed' && s.completedAt);

    if (completedSessions.length === 0) return 0;

    const totalDuration = completedSessions.reduce((sum, s) => sum + (s.completedAt - s.createdAt), 0);
    return totalDuration / completedSessions.length;
  }

  /**
   * Cleanup old collaboration data
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of cleaned items
   */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const cutoffTime = Date.now() - maxAge;
    let cleanedUp = 0;

    // Clean completed sessions
    for (const [sessionId, session] of this.collaborationSessions.entries()) {
      if (session.status === 'completed' && session.completedAt && session.completedAt < cutoffTime) {
        this.collaborationSessions.delete(sessionId);
        cleanedUp++;
      }
    }

    // Clean feedback history
    const originalHistoryLength = this.feedbackHistory.length;
    this.feedbackHistory = this.feedbackHistory.filter(h => h.timestamp > cutoffTime);
    cleanedUp += originalHistoryLength - this.feedbackHistory.length;

    if (cleanedUp > 0) {
      this.logger.info(`Cleaned up ${cleanedUp} old collaboration records`);
    }

    return cleanedUp;
  }
}

export default CollaborationEngine;