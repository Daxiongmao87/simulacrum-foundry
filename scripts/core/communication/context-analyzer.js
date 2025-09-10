/**
 * Communication Enhancement - Context Analyzer
 * Communication adaptation based on task and user context
 */

import { CommunicationContext } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class ContextAnalyzer {
  constructor() {
    this.logger = createLogger('ContextAnalyzer');
    this.contextHistory = [];
    this.adaptationRules = new Map();
    this.userProfiles = new Map();
    this.analysisStats = {
      totalAnalyses: 0,
      adaptationSuccessRate: 0,
      averageAnalysisTime: 0,
      contextTypesDetected: new Map()
    };

    this._initializeAdaptationRules();
  }

  /**
   * Analyze communication context and determine adaptation strategy
   * @param {Object} taskInfo - Information about the current task
   * @param {Object} userInfo - User preferences and history
   * @param {Object} environmentInfo - Environment and session context
   * @returns {Promise<CommunicationContext>} Analyzed communication context
   */
  async analyzeContext(taskInfo, userInfo = {}, environmentInfo = {}) {
    try {
      const startTime = Date.now();
      this.logger.debug('Analyzing communication context');

      const taskComplexity = this._assessTaskComplexity(taskInfo);
      const userPreferences = await this._analyzeUserPreferences(userInfo);
      const environmentContext = this._analyzeEnvironment(environmentInfo);
      
      const context = new CommunicationContext(taskComplexity, userPreferences);
      context.sessionContext = this._buildSessionContext(taskInfo, userInfo);
      context.environmentInfo = environmentContext;

      const adaptationStrategy = await this._determineAdaptationStrategy(context, taskInfo);
      context.adaptationStrategy = adaptationStrategy;

      this._recordContextHistory(context, taskInfo);
      this._updateAnalysisStats(Date.now() - startTime, taskComplexity);

      this.logger.debug(`Context analyzed: ${taskComplexity} complexity, ${adaptationStrategy.communicationStyle} style`);
      return context;

    } catch (error) {
      this.logger.error('Context analysis failed:', error);
      throw error;
    }
  }

  /**
   * Adapt communication style based on context
   * @param {CommunicationContext} context - Communication context
   * @param {string} messageType - Type of message being adapted
   * @param {Object} content - Content to adapt
   * @returns {Object} Adapted content with style recommendations
   */
  adaptCommunicationStyle(context, messageType, content) {
    try {
      const adaptation = {
        originalContent: content,
        adaptedContent: { ...content },
        styleRecommendations: [],
        formatAdjustments: [],
        lengthAdjustments: []
      };

      const rules = this.adaptationRules.get(messageType) || this.adaptationRules.get('default');
      
      for (const rule of rules) {
        if (rule.condition(context)) {
          const adjustments = rule.adaptation(adaptation.adaptedContent, context);
          
          if (adjustments.style) {
            adaptation.styleRecommendations.push(...adjustments.style);
          }
          
          if (adjustments.format) {
            adaptation.formatAdjustments.push(...adjustments.format);
          }
          
          if (adjustments.length) {
            adaptation.lengthAdjustments.push(...adjustments.length);
          }
        }
      }

      this._applyStyleAdaptations(adaptation, context);

      this.logger.debug(`Communication adapted for ${messageType}: ${adaptation.styleRecommendations.length} style changes`);
      return adaptation;

    } catch (error) {
      this.logger.error('Communication adaptation failed:', error);
      return {
        originalContent: content,
        adaptedContent: content,
        styleRecommendations: ['Use standard formatting'],
        formatAdjustments: [],
        lengthAdjustments: []
      };
    }
  }

  /**
   * Update user profile based on interaction feedback
   * @param {string} userId - User identifier
   * @param {Object} interactionData - Data from user interaction
   * @param {Object} feedback - User feedback on communication
   */
  updateUserProfile(userId, interactionData, feedback = {}) {
    try {
      let profile = this.userProfiles.get(userId);
      
      if (!profile) {
        profile = {
          userId,
          preferences: {
            verbosityLevel: 'normal',
            technicalDetail: 'medium',
            communicationStyle: 'professional',
            responseLength: 'medium',
            examplePreference: 'some'
          },
          history: [],
          adaptationSuccess: 0,
          totalInteractions: 0,
          createdAt: Date.now(),
          lastUpdated: Date.now()
        };
      }

      profile.totalInteractions++;
      profile.history.push({
        interaction: interactionData,
        feedback,
        timestamp: Date.now()
      });

      // Keep history manageable
      if (profile.history.length > 50) {
        profile.history = profile.history.slice(-25);
      }

      // Update preferences based on feedback
      this._updatePreferencesFromFeedback(profile, feedback);

      // Calculate adaptation success rate
      if (feedback.communicationRating) {
        if (feedback.communicationRating >= 4) {
          profile.adaptationSuccess++;
        }
      }

      profile.lastUpdated = Date.now();
      this.userProfiles.set(userId, profile);

      this.logger.debug(`User profile updated for ${userId}: ${profile.totalInteractions} interactions`);

    } catch (error) {
      this.logger.error(`Failed to update user profile ${userId}:`, error);
    }
  }

  /**
   * Get communication recommendations for specific context
   * @param {CommunicationContext} context - Communication context
   * @param {string} messageType - Type of message
   * @returns {Object} Communication recommendations
   */
  getRecommendations(context, messageType) {
    const recommendations = {
      tone: this._recommendTone(context, messageType),
      length: this._recommendLength(context, messageType),
      detail: this._recommendDetailLevel(context, messageType),
      format: this._recommendFormat(context, messageType),
      examples: this._recommendExamples(context, messageType),
      timing: this._recommendTiming(context, messageType)
    };

    return recommendations;
  }

  /**
   * Analyze task complexity from task information
   * @private
   */
  _assessTaskComplexity(taskInfo) {
    let complexityScore = 0;
    
    // Factor 1: Number of requirements
    const requirementCount = taskInfo.requirements ? taskInfo.requirements.length : 0;
    complexityScore += Math.min(requirementCount * 5, 25);
    
    // Factor 2: Task type complexity
    const taskType = taskInfo.type || 'general';
    const complexityWeights = {
      'simple_edit': 5,
      'bug_fix': 15,
      'feature_addition': 25,
      'refactoring': 30,
      'architecture': 40,
      'system_design': 45
    };
    complexityScore += complexityWeights[taskType] || 20;
    
    // Factor 3: Dependencies and constraints
    if (taskInfo.dependencies && taskInfo.dependencies.length > 3) {
      complexityScore += 15;
    }
    
    if (taskInfo.constraints && Object.keys(taskInfo.constraints).length > 2) {
      complexityScore += 10;
    }
    
    // Factor 4: Estimated effort
    if (taskInfo.estimatedHours) {
      if (taskInfo.estimatedHours > 8) complexityScore += 20;
      else if (taskInfo.estimatedHours > 4) complexityScore += 10;
      else if (taskInfo.estimatedHours > 1) complexityScore += 5;
    }
    
    // Factor 5: Technology complexity
    if (taskInfo.technologies) {
      const advancedTech = ['kubernetes', 'microservices', 'blockchain', 'ai', 'ml'];
      const hasAdvanced = taskInfo.technologies.some(tech => 
        advancedTech.some(advanced => tech.toLowerCase().includes(advanced))
      );
      if (hasAdvanced) complexityScore += 15;
    }

    // Convert score to complexity level
    if (complexityScore >= 60) return 'high';
    if (complexityScore >= 30) return 'medium';
    return 'low';
  }

  /**
   * Analyze user preferences from user information and history
   * @private
   */
  async _analyzeUserPreferences(userInfo) {
    const preferences = {
      verbosityLevel: 'normal',
      preferredFormat: 'markdown',
      includeTimestamps: false,
      showTechnicalDetails: true,
      maxResponseLength: 2000,
      communicationStyle: 'professional',
      examplePreference: 'some'
    };

    // Check for explicit preferences
    if (userInfo.preferences) {
      Object.assign(preferences, userInfo.preferences);
    }

    // Check user profile if available
    if (userInfo.userId) {
      const profile = this.userProfiles.get(userInfo.userId);
      if (profile) {
        Object.assign(preferences, profile.preferences);
      }
    }

    // Infer preferences from interaction history
    if (userInfo.interactionHistory) {
      const inferred = this._inferPreferencesFromHistory(userInfo.interactionHistory);
      Object.assign(preferences, inferred);
    }

    // Adjust based on experience level
    if (userInfo.experienceLevel) {
      switch (userInfo.experienceLevel) {
        case 'beginner':
          preferences.verbosityLevel = 'verbose';
          preferences.showTechnicalDetails = true;
          preferences.examplePreference = 'many';
          break;
        case 'expert':
          preferences.verbosityLevel = 'concise';
          preferences.showTechnicalDetails = false;
          preferences.examplePreference = 'few';
          break;
      }
    }

    return preferences;
  }

  /**
   * Analyze environment context
   * @private
   */
  _analyzeEnvironment(environmentInfo) {
    const context = {
      cli: true,
      terminalWidth: 80,
      colorSupport: true,
      platform: 'unknown',
      sessionType: 'interactive',
      timeConstraints: false
    };

    if (environmentInfo.terminal) {
      Object.assign(context, environmentInfo.terminal);
    }

    if (environmentInfo.platform) {
      context.platform = environmentInfo.platform;
    }

    if (environmentInfo.sessionType) {
      context.sessionType = environmentInfo.sessionType;
    }

    // Detect time constraints
    if (environmentInfo.urgency === 'high' || environmentInfo.deadline) {
      context.timeConstraints = true;
    }

    return context;
  }

  /**
   * Build session context
   * @private
   */
  _buildSessionContext(taskInfo, userInfo) {
    return {
      taskId: taskInfo.id,
      taskType: taskInfo.type,
      sessionStart: Date.now(),
      userExperience: userInfo.experienceLevel || 'intermediate',
      previousInteractions: userInfo.interactionHistory ? userInfo.interactionHistory.length : 0,
      currentGoal: taskInfo.goal || taskInfo.title,
      urgency: taskInfo.urgency || 'normal'
    };
  }

  /**
   * Determine adaptation strategy based on context
   * @private
   */
  async _determineAdaptationStrategy(context, taskInfo) {
    const strategy = {
      communicationStyle: 'standard',
      detailLevel: 'balanced',
      responsePattern: 'comprehensive',
      interactionMode: 'guided',
      adaptationPriority: []
    };

    // Adapt based on task complexity
    if (context.isComplexTask()) {
      strategy.communicationStyle = 'detailed';
      strategy.detailLevel = 'high';
      strategy.responsePattern = 'structured';
      strategy.adaptationPriority.push('clarity', 'completeness');
    } else if (context.isSimpleTask()) {
      strategy.communicationStyle = 'concise';
      strategy.detailLevel = 'minimal';
      strategy.responsePattern = 'direct';
      strategy.adaptationPriority.push('brevity', 'efficiency');
    }

    // Adapt based on user preferences
    if (context.isVerbose()) {
      strategy.detailLevel = 'high';
      strategy.responsePattern = 'comprehensive';
      strategy.adaptationPriority.unshift('completeness');
    } else if (context.isConcise()) {
      strategy.detailLevel = 'minimal';
      strategy.responsePattern = 'direct';
      strategy.adaptationPriority.unshift('brevity');
    }

    // Adapt based on environment
    if (context.environmentInfo.timeConstraints) {
      strategy.responsePattern = 'prioritized';
      strategy.adaptationPriority.unshift('efficiency');
    }

    if (context.environmentInfo.terminalWidth < 60) {
      strategy.adaptationPriority.push('mobile-friendly');
    }

    return strategy;
  }

  /**
   * Infer preferences from interaction history
   * @private
   */
  _inferPreferencesFromHistory(interactionHistory) {
    const inferred = {};

    if (interactionHistory.length === 0) {
      return inferred;
    }

    // Analyze response lengths to infer verbosity preference
    const avgResponseLength = interactionHistory.reduce((sum, interaction) => {
      return sum + (interaction.userResponse ? interaction.userResponse.length : 0);
    }, 0) / interactionHistory.length;

    if (avgResponseLength > 200) {
      inferred.verbosityLevel = 'verbose';
    } else if (avgResponseLength < 50) {
      inferred.verbosityLevel = 'concise';
    }

    // Analyze feedback patterns
    const feedbackPatterns = interactionHistory.filter(i => i.feedback);
    if (feedbackPatterns.length > 0) {
      const avgRating = feedbackPatterns.reduce((sum, i) => sum + (i.feedback.rating || 3), 0) / feedbackPatterns.length;
      
      if (avgRating < 3) {
        // Low satisfaction might indicate need for different approach
        inferred.showTechnicalDetails = !inferred.showTechnicalDetails;
      }
    }

    // Analyze question patterns
    const questionsAsked = interactionHistory.filter(i => 
      i.userResponse && i.userResponse.includes('?')
    ).length;

    if (questionsAsked > interactionHistory.length * 0.5) {
      inferred.examplePreference = 'many';
      inferred.verbosityLevel = 'verbose';
    }

    return inferred;
  }

  /**
   * Update preferences from feedback
   * @private
   */
  _updatePreferencesFromFeedback(profile, feedback) {
    if (feedback.tooVerbose) {
      profile.preferences.verbosityLevel = this._adjustPreference(
        profile.preferences.verbosityLevel, 
        ['concise', 'normal', 'verbose'], 
        -1
      );
    }

    if (feedback.tooTechnical) {
      profile.preferences.technicalDetail = this._adjustPreference(
        profile.preferences.technicalDetail,
        ['low', 'medium', 'high'],
        -1
      );
    }

    if (feedback.needMoreDetail) {
      profile.preferences.verbosityLevel = this._adjustPreference(
        profile.preferences.verbosityLevel,
        ['concise', 'normal', 'verbose'],
        1
      );
    }

    if (feedback.preferredLength) {
      profile.preferences.responseLength = feedback.preferredLength;
    }

    if (feedback.preferredStyle) {
      profile.preferences.communicationStyle = feedback.preferredStyle;
    }
  }

  /**
   * Adjust preference along scale
   * @private
   */
  _adjustPreference(currentValue, scale, direction) {
    const currentIndex = scale.indexOf(currentValue);
    if (currentIndex === -1) return currentValue;
    
    const newIndex = Math.max(0, Math.min(scale.length - 1, currentIndex + direction));
    return scale[newIndex];
  }

  /**
   * Apply style adaptations to content
   * @private
   */
  _applyStyleAdaptations(adaptation, context) {
    // Apply length adjustments
    if (adaptation.lengthAdjustments.includes('shorten')) {
      this._shortenContent(adaptation.adaptedContent);
    } else if (adaptation.lengthAdjustments.includes('expand')) {
      this._expandContent(adaptation.adaptedContent);
    }

    // Apply format adjustments
    adaptation.formatAdjustments.forEach(adjustment => {
      switch (adjustment) {
        case 'add_structure':
          this._addStructure(adaptation.adaptedContent);
          break;
        case 'simplify_format':
          this._simplifyFormat(adaptation.adaptedContent);
          break;
        case 'add_examples':
          this._addExamples(adaptation.adaptedContent, context);
          break;
      }
    });
  }

  /**
   * Shorten content for concise preference
   * @private
   */
  _shortenContent(content) {
    if (content.description && content.description.length > 200) {
      const sentences = content.description.split('.');
      content.description = sentences.slice(0, 2).join('.') + (sentences.length > 2 ? '.' : '');
    }

    if (content.sections) {
      content.sections = content.sections.slice(0, 3);
    }
  }

  /**
   * Expand content for verbose preference
   * @private
   */
  _expandContent(content) {
    if (content.description && !content.expandedDescription) {
      content.expandedDescription = content.description + '\n\nThis approach ensures comprehensive coverage while maintaining clarity and precision.';
    }

    if (!content.additionalContext) {
      content.additionalContext = 'Additional context and background information can help provide better understanding of the implementation details and decision-making process.';
    }
  }

  /**
   * Add structure to content
   * @private
   */
  _addStructure(content) {
    if (!content.structure) {
      content.structure = {
        overview: true,
        steps: true,
        summary: true,
        nextActions: true
      };
    }
  }

  /**
   * Simplify format for basic preference
   * @private
   */
  _simplifyFormat(content) {
    if (content.formatting) {
      content.formatting.useBold = false;
      content.formatting.useItalics = false;
      content.formatting.bulletPoints = 'simple';
    }
  }

  /**
   * Add examples to content
   * @private
   */
  _addExamples(content, context) {
    if (!content.examples && context.userPreferences.examplePreference !== 'none') {
      content.examples = [
        'Example implementation showing practical application',
        'Common usage pattern with expected outcomes'
      ];
    }
  }

  /**
   * Recommend tone based on context
   * @private
   */
  _recommendTone(context, messageType) {
    if (messageType === 'error' || messageType === 'warning') {
      return 'supportive';
    }

    if (context.sessionContext.urgency === 'high') {
      return 'direct';
    }

    if (context.isComplexTask()) {
      return 'professional';
    }

    return context.userPreferences.communicationStyle || 'professional';
  }

  /**
   * Recommend response length
   * @private
   */
  _recommendLength(context, messageType) {
    if (context.environmentInfo.timeConstraints) {
      return 'short';
    }

    if (context.isVerbose() && context.isComplexTask()) {
      return 'long';
    }

    if (context.isConcise() || context.isSimpleTask()) {
      return 'short';
    }

    return 'medium';
  }

  /**
   * Recommend detail level
   * @private
   */
  _recommendDetailLevel(context, messageType) {
    if (messageType === 'error') {
      return 'high'; // Always provide detail for errors
    }

    if (context.userPreferences.showTechnicalDetails === false) {
      return 'low';
    }

    if (context.isComplexTask()) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Recommend format style
   * @private
   */
  _recommendFormat(context, messageType) {
    const format = {
      structure: 'sections',
      bullets: true,
      codeBlocks: context.userPreferences.showTechnicalDetails,
      emphasis: true,
      lineLength: Math.min(context.environmentInfo.terminalWidth - 5, 75)
    };

    if (context.isConcise()) {
      format.structure = 'minimal';
      format.emphasis = false;
    }

    if (messageType === 'simple_confirmation') {
      format.structure = 'single_line';
      format.bullets = false;
    }

    return format;
  }

  /**
   * Recommend examples inclusion
   * @private
   */
  _recommendExamples(context, messageType) {
    const examplePref = context.userPreferences.examplePreference || 'some';
    
    if (examplePref === 'none') {
      return { include: false, count: 0 };
    }

    if (messageType === 'error' || context.isComplexTask()) {
      return { include: true, count: examplePref === 'many' ? 3 : 1 };
    }

    return { 
      include: examplePref !== 'few', 
      count: examplePref === 'many' ? 2 : 1 
    };
  }

  /**
   * Recommend timing for response
   * @private
   */
  _recommendTiming(context, messageType) {
    if (context.environmentInfo.timeConstraints) {
      return { urgency: 'immediate', maxDelay: 0 };
    }

    if (messageType === 'progress_update') {
      return { urgency: 'realtime', maxDelay: 1000 };
    }

    return { urgency: 'normal', maxDelay: 5000 };
  }

  /**
   * Record context history
   * @private
   */
  _recordContextHistory(context, taskInfo) {
    this.contextHistory.push({
      context: JSON.parse(JSON.stringify(context)),
      taskInfo: {
        type: taskInfo.type,
        complexity: context.taskComplexity,
        requirements: taskInfo.requirements ? taskInfo.requirements.length : 0
      },
      timestamp: Date.now()
    });

    // Keep history manageable
    if (this.contextHistory.length > 1000) {
      this.contextHistory = this.contextHistory.slice(-500);
    }
  }

  /**
   * Update analysis statistics
   * @private
   */
  _updateAnalysisStats(analysisTime, complexityDetected) {
    this.analysisStats.totalAnalyses++;
    
    const totalTime = this.analysisStats.averageAnalysisTime * (this.analysisStats.totalAnalyses - 1) + analysisTime;
    this.analysisStats.averageAnalysisTime = totalTime / this.analysisStats.totalAnalyses;

    const currentCount = this.analysisStats.contextTypesDetected.get(complexityDetected) || 0;
    this.analysisStats.contextTypesDetected.set(complexityDetected, currentCount + 1);
  }

  /**
   * Initialize adaptation rules
   * @private
   */
  _initializeAdaptationRules() {
    // Default adaptation rules
    this.adaptationRules.set('default', [
      {
        condition: (context) => context.isConcise(),
        adaptation: (content, context) => ({
          length: ['shorten'],
          format: ['simplify_format'],
          style: ['direct', 'minimal']
        })
      },
      {
        condition: (context) => context.isVerbose(),
        adaptation: (content, context) => ({
          length: ['expand'],
          format: ['add_structure', 'add_examples'],
          style: ['comprehensive', 'detailed']
        })
      },
      {
        condition: (context) => context.isComplexTask(),
        adaptation: (content, context) => ({
          format: ['add_structure'],
          style: ['structured', 'professional']
        })
      }
    ]);

    // Error message adaptations
    this.adaptationRules.set('error', [
      {
        condition: (context) => true, // Always apply for errors
        adaptation: (content, context) => ({
          format: ['add_structure'],
          style: ['supportive', 'actionable'],
          length: ['expand'] // Always provide detail for errors
        })
      }
    ]);

    // Progress update adaptations
    this.adaptationRules.set('progress', [
      {
        condition: (context) => context.environmentInfo.timeConstraints,
        adaptation: (content, context) => ({
          length: ['shorten'],
          style: ['direct', 'essential_only']
        })
      }
    ]);

    // Simple confirmation adaptations
    this.adaptationRules.set('confirmation', [
      {
        condition: (context) => context.isSimpleTask() && context.isConcise(),
        adaptation: (content, context) => ({
          length: ['shorten'],
          format: ['simplify_format'],
          style: ['minimal']
        })
      }
    ]);
  }

  /**
   * Get context analyzer statistics
   * @returns {Object} Current analyzer statistics
   */
  getAnalyzerStatistics() {
    return {
      ...this.analysisStats,
      contextHistorySize: this.contextHistory.length,
      userProfilesCount: this.userProfiles.size,
      adaptationRulesCount: this.adaptationRules.size,
      adaptationSuccessRate: this.analysisStats.totalAnalyses > 0 
        ? this.analysisStats.adaptationSuccessRate 
        : 0
    };
  }

  /**
   * Cleanup old context data
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of cleaned items
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const cutoffTime = Date.now() - maxAge;
    let cleanedUp = 0;

    // Clean context history
    const originalHistoryLength = this.contextHistory.length;
    this.contextHistory = this.contextHistory.filter(h => h.timestamp > cutoffTime);
    cleanedUp += originalHistoryLength - this.contextHistory.length;

    // Clean old user profile interactions
    for (const [userId, profile] of this.userProfiles.entries()) {
      const originalLength = profile.history.length;
      profile.history = profile.history.filter(h => h.timestamp > cutoffTime);
      cleanedUp += originalLength - profile.history.length;

      // Remove profiles with no recent activity
      if (profile.lastUpdated < cutoffTime && profile.history.length === 0) {
        this.userProfiles.delete(userId);
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      this.logger.info(`Cleaned up ${cleanedUp} old context records`);
    }

    return cleanedUp;
  }
}

export default ContextAnalyzer;