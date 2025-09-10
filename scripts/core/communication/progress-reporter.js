/**
 * Communication Enhancement - Progress Reporter
 * Milestone tracking and status communication system
 */

import { ProgressData, ProgressMilestone, ProgressReport } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class ProgressReporter {
  constructor() {
    this.logger = createLogger('ProgressReporter');
    this.activeProgress = new Map(); // taskId -> ProgressData
    this.reportingHistory = [];
    this.reportingStats = {
      totalReports: 0,
      averageReportTime: 0,
      milestonesTracked: 0,
      completionRate: 0
    };
    this.updateInterval = null;
    this.realTimeUpdates = false;
  }

  /**
   * Initialize progress tracking for a task
   * @param {string} taskId - Task identifier
   * @param {Array} milestones - Initial milestones
   * @returns {ProgressData} Created progress data
   */
  initializeProgress(taskId, milestones = []) {
    try {
      this.logger.info(`Initializing progress tracking for task: ${taskId}`);

      const progressData = new ProgressData(milestones.length);
      
      milestones.forEach(milestone => {
        const progressMilestone = this._createMilestone(milestone);
        progressData.addMilestone(progressMilestone);
      });

      this.activeProgress.set(taskId, progressData);
      this.reportingStats.milestonesTracked += milestones.length;

      this.logger.debug(`Progress initialized: ${milestones.length} milestones for task ${taskId}`);
      return progressData;

    } catch (error) {
      this.logger.error(`Progress initialization failed for ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Update milestone progress
   * @param {string} taskId - Task identifier
   * @param {string} milestoneId - Milestone identifier
   * @param {number} progress - Progress percentage (0-100)
   * @param {Object} metadata - Additional metadata
   */
  updateMilestoneProgress(taskId, milestoneId, progress, metadata = {}) {
    try {
      const progressData = this.activeProgress.get(taskId);
      if (!progressData) {
        throw new Error(`No progress tracking found for task: ${taskId}`);
      }

      progressData.updateMilestone(milestoneId, {
        progress,
        ...metadata,
        lastUpdated: Date.now()
      });

      this.logger.debug(`Updated milestone ${milestoneId} progress: ${progress}%`);

      if (this.realTimeUpdates) {
        this._emitProgressUpdate(taskId, milestoneId, progress);
      }

    } catch (error) {
      this.logger.error(`Milestone update failed for ${taskId}:${milestoneId}:`, error);
    }
  }

  /**
   * Complete milestone
   * @param {string} taskId - Task identifier
   * @param {string} milestoneId - Milestone identifier
   * @param {Object} completionData - Completion metadata
   */
  completeMilestone(taskId, milestoneId, completionData = {}) {
    try {
      const progressData = this.activeProgress.get(taskId);
      if (!progressData) {
        throw new Error(`No progress tracking found for task: ${taskId}`);
      }

      progressData.updateMilestone(milestoneId, {
        status: 'completed',
        progress: 100,
        completedAt: Date.now(),
        ...completionData
      });

      this._updateCompletionRate();
      this.logger.info(`Milestone completed: ${milestoneId} in task ${taskId}`);

      if (this.realTimeUpdates) {
        this._emitMilestoneComplete(taskId, milestoneId);
      }

    } catch (error) {
      this.logger.error(`Milestone completion failed for ${taskId}:${milestoneId}:`, error);
    }
  }

  /**
   * Start milestone execution
   * @param {string} taskId - Task identifier
   * @param {string} milestoneId - Milestone identifier
   * @param {Object} startData - Start metadata
   */
  startMilestone(taskId, milestoneId, startData = {}) {
    try {
      const progressData = this.activeProgress.get(taskId);
      if (!progressData) {
        throw new Error(`No progress tracking found for task: ${taskId}`);
      }

      const milestone = progressData.milestones.find(m => m.id === milestoneId);
      if (milestone) {
        milestone.start();
        Object.assign(milestone.metadata, startData);
        progressData.setCurrentFocus(milestone.name);
        
        this.logger.info(`Started milestone: ${milestoneId} in task ${taskId}`);
      }

    } catch (error) {
      this.logger.error(`Milestone start failed for ${taskId}:${milestoneId}:`, error);
    }
  }

  /**
   * Add milestone blocker
   * @param {string} taskId - Task identifier
   * @param {string} milestoneId - Milestone identifier
   * @param {string} blocker - Blocker description
   */
  addMilestoneBlocker(taskId, milestoneId, blocker) {
    try {
      const progressData = this.activeProgress.get(taskId);
      if (!progressData) {
        throw new Error(`No progress tracking found for task: ${taskId}`);
      }

      const milestone = progressData.milestones.find(m => m.id === milestoneId);
      if (milestone) {
        milestone.addBlocker(blocker);
        this.logger.warn(`Blocker added to milestone ${milestoneId}: ${blocker}`);
      }

    } catch (error) {
      this.logger.error(`Failed to add blocker to ${taskId}:${milestoneId}:`, error);
    }
  }

  /**
   * Remove milestone blocker
   * @param {string} taskId - Task identifier
   * @param {string} milestoneId - Milestone identifier
   * @param {number} blockerIndex - Index of blocker to remove
   */
  removeMilestoneBlocker(taskId, milestoneId, blockerIndex) {
    try {
      const progressData = this.activeProgress.get(taskId);
      if (!progressData) {
        throw new Error(`No progress tracking found for task: ${taskId}`);
      }

      const milestone = progressData.milestones.find(m => m.id === milestoneId);
      if (milestone) {
        milestone.removeBlocker(blockerIndex);
        this.logger.info(`Blocker removed from milestone ${milestoneId}`);
      }

    } catch (error) {
      this.logger.error(`Failed to remove blocker from ${taskId}:${milestoneId}:`, error);
    }
  }

  /**
   * Generate comprehensive progress report
   * @param {string} taskId - Task identifier
   * @param {Object} options - Report options
   * @returns {Promise<ProgressReport>} Generated progress report
   */
  async generateProgressReport(taskId, options = {}) {
    try {
      const startTime = Date.now();
      
      const progressData = this.activeProgress.get(taskId);
      if (!progressData) {
        throw new Error(`No progress tracking found for task: ${taskId}`);
      }

      const report = new ProgressReport(progressData);
      
      if (options.includeDetailedAnalysis) {
        await this._addDetailedAnalysis(report, progressData);
      }

      if (options.includePredictions) {
        await this._addProgressPredictions(report, progressData);
      }

      if (options.includeRecommendations) {
        await this._addRecommendations(report, progressData);
      }

      const reportTime = Date.now() - startTime;
      this._updateReportingStats(reportTime);

      this.logger.debug(`Progress report generated for ${taskId} in ${reportTime}ms`);
      return report;

    } catch (error) {
      this.logger.error(`Progress report generation failed for ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get current progress status
   * @param {string} taskId - Task identifier
   * @returns {Object|null} Current progress status
   */
  getProgressStatus(taskId) {
    const progressData = this.activeProgress.get(taskId);
    if (!progressData) {
      return null;
    }

    return {
      taskId,
      overallProgress: progressData.overallProgress,
      currentFocus: progressData.currentFocus,
      totalMilestones: progressData.milestones.length,
      completedMilestones: progressData.getCompletedMilestones().length,
      inProgressMilestones: progressData.getInProgressMilestones().length,
      blockedMilestones: progressData.milestones.filter(m => m.isBlocked && m.isBlocked()).length,
      estimatedTimeRemaining: progressData.estimatedTimeRemaining,
      lastUpdated: progressData.lastUpdated
    };
  }

  /**
   * Enable real-time progress updates
   * @param {number} intervalMs - Update interval in milliseconds
   */
  enableRealTimeUpdates(intervalMs = 5000) {
    this.realTimeUpdates = true;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this._processRealTimeUpdates();
    }, intervalMs);

    this.logger.info(`Real-time updates enabled with ${intervalMs}ms interval`);
  }

  /**
   * Disable real-time progress updates
   */
  disableRealTimeUpdates() {
    this.realTimeUpdates = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.logger.info('Real-time updates disabled');
  }

  /**
   * Estimate completion time for task
   * @param {string} taskId - Task identifier
   * @returns {Object} Time estimates
   */
  estimateCompletionTime(taskId) {
    const progressData = this.activeProgress.get(taskId);
    if (!progressData) {
      return null;
    }

    const completedMilestones = progressData.getCompletedMilestones();
    const pendingMilestones = progressData.getPendingMilestones();
    const inProgressMilestones = progressData.getInProgressMilestones();

    if (completedMilestones.length === 0) {
      return {
        estimatedTimeRemaining: this._sumEstimatedTimes(pendingMilestones) + this._sumEstimatedTimes(inProgressMilestones),
        confidence: 'low',
        basedOn: 'initial_estimates'
      };
    }

    const averageActualTime = completedMilestones.reduce((sum, m) => sum + m.actualTime, 0) / completedMilestones.length;
    const averageEstimatedTime = completedMilestones.reduce((sum, m) => sum + m.estimatedTime, 0) / completedMilestones.length;
    
    const accuracyRatio = averageEstimatedTime > 0 ? averageActualTime / averageEstimatedTime : 1;

    const remainingEstimated = this._sumEstimatedTimes(pendingMilestones) + this._sumEstimatedTimes(inProgressMilestones);
    const adjustedRemaining = remainingEstimated * accuracyRatio;

    return {
      estimatedTimeRemaining: Math.round(adjustedRemaining),
      confidence: completedMilestones.length >= 3 ? 'high' : 'medium',
      basedOn: 'historical_performance',
      accuracyRatio,
      completedSamples: completedMilestones.length
    };
  }

  /**
   * Archive completed task progress
   * @param {string} taskId - Task identifier
   * @returns {Object} Archived progress data
   */
  archiveProgress(taskId) {
    const progressData = this.activeProgress.get(taskId);
    if (!progressData) {
      return null;
    }

    const archived = {
      taskId,
      progressData: JSON.parse(JSON.stringify(progressData)),
      archivedAt: Date.now(),
      finalStatus: {
        completed: progressData.getCompletedMilestones().length,
        total: progressData.milestones.length,
        overallProgress: progressData.overallProgress
      }
    };

    this.reportingHistory.push(archived);
    this.activeProgress.delete(taskId);

    // Keep history manageable
    if (this.reportingHistory.length > 1000) {
      this.reportingHistory = this.reportingHistory.slice(-500);
    }

    this.logger.info(`Progress archived for task: ${taskId}`);
    return archived;
  }

  /**
   * Create milestone from configuration
   * @private
   */
  _createMilestone(config) {
    const milestone = new ProgressMilestone(
      config.id || `milestone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      config.name,
      config.description
    );

    if (config.estimatedTime) {
      milestone.estimatedTime = config.estimatedTime;
    }

    if (config.dependencies) {
      milestone.dependencies = Array.isArray(config.dependencies) ? config.dependencies : [config.dependencies];
    }

    if (config.metadata) {
      Object.assign(milestone.metadata, config.metadata);
    }

    return milestone;
  }

  /**
   * Emit progress update event
   * @private
   */
  _emitProgressUpdate(taskId, milestoneId, progress) {
    // In a real implementation, this would emit events to subscribers
    this.logger.debug(`Progress update: ${taskId}:${milestoneId} -> ${progress}%`);
  }

  /**
   * Emit milestone complete event
   * @private
   */
  _emitMilestoneComplete(taskId, milestoneId) {
    // In a real implementation, this would emit events to subscribers
    this.logger.info(`Milestone complete: ${taskId}:${milestoneId}`);
  }

  /**
   * Update completion rate statistics
   * @private
   */
  _updateCompletionRate() {
    const totalMilestones = Array.from(this.activeProgress.values())
      .reduce((sum, progress) => sum + progress.milestones.length, 0);
    
    const completedMilestones = Array.from(this.activeProgress.values())
      .reduce((sum, progress) => sum + progress.getCompletedMilestones().length, 0);

    this.reportingStats.completionRate = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;
  }

  /**
   * Add detailed analysis to progress report
   * @private
   */
  async _addDetailedAnalysis(report, progressData) {
    const analysis = {
      efficiency: this._calculateEfficiency(progressData),
      bottlenecks: this._identifyBottlenecks(progressData),
      trends: this._analyzeTrends(progressData),
      riskFactors: this._assessRiskFactors(progressData)
    };

    report.detailedAnalysis = analysis;
  }

  /**
   * Add progress predictions to report
   * @private
   */
  async _addProgressPredictions(report, progressData) {
    const predictions = {
      completionTime: this._predictCompletionTime(progressData),
      nextMilestones: this._predictNextMilestones(progressData),
      potentialDelays: this._predictDelays(progressData)
    };

    report.predictions = predictions;
  }

  /**
   * Add recommendations to progress report
   * @private
   */
  async _addRecommendations(report, progressData) {
    const recommendations = [];

    // Check for blocked milestones
    const blockedMilestones = progressData.milestones.filter(m => m.isBlocked());
    if (blockedMilestones.length > 0) {
      recommendations.push({
        type: 'blocker_resolution',
        priority: 'high',
        description: `Resolve ${blockedMilestones.length} blocked milestone(s) to maintain progress`,
        action: 'Review and address blocking conditions'
      });
    }

    // Check for long-running tasks
    const longRunningMilestones = progressData.getInProgressMilestones()
      .filter(m => m.getDuration() > m.estimatedTime * 1.5);
    if (longRunningMilestones.length > 0) {
      recommendations.push({
        type: 'timeline_adjustment',
        priority: 'medium',
        description: `${longRunningMilestones.length} milestone(s) taking longer than estimated`,
        action: 'Consider breaking down into smaller tasks or adjusting estimates'
      });
    }

    // Check for dependency chains
    const dependencyChains = this._findDependencyChains(progressData);
    if (dependencyChains.some(chain => chain.length > 5)) {
      recommendations.push({
        type: 'dependency_optimization',
        priority: 'medium',
        description: 'Long dependency chains detected',
        action: 'Look for opportunities to parallelize work'
      });
    }

    report.recommendations = recommendations;
  }

  /**
   * Calculate efficiency metrics
   * @private
   */
  _calculateEfficiency(progressData) {
    const completedMilestones = progressData.getCompletedMilestones();
    
    if (completedMilestones.length === 0) {
      return { score: 0, details: 'No completed milestones to analyze' };
    }

    const totalEstimated = completedMilestones.reduce((sum, m) => sum + m.estimatedTime, 0);
    const totalActual = completedMilestones.reduce((sum, m) => sum + m.actualTime, 0);

    const efficiency = totalEstimated > 0 ? (totalEstimated / totalActual) * 100 : 100;

    return {
      score: Math.round(efficiency),
      totalEstimated,
      totalActual,
      details: efficiency > 100 ? 'Ahead of schedule' : 'Behind schedule'
    };
  }

  /**
   * Identify bottlenecks in progress
   * @private
   */
  _identifyBottlenecks(progressData) {
    const bottlenecks = [];

    // Find milestones that have been running much longer than estimated
    progressData.getInProgressMilestones().forEach(milestone => {
      const duration = milestone.getDuration();
      if (duration > milestone.estimatedTime * 2) {
        bottlenecks.push({
          type: 'long_running',
          milestone: milestone.name,
          expectedTime: milestone.estimatedTime,
          actualTime: duration,
          severity: duration > milestone.estimatedTime * 3 ? 'high' : 'medium'
        });
      }
    });

    // Find milestones with many dependents (critical path)
    progressData.milestones.forEach(milestone => {
      const dependentCount = progressData.milestones.filter(m => 
        m.dependencies.includes(milestone.id)
      ).length;

      if (dependentCount > 3 && !milestone.isCompleted()) {
        bottlenecks.push({
          type: 'critical_path',
          milestone: milestone.name,
          dependentCount,
          severity: dependentCount > 5 ? 'high' : 'medium'
        });
      }
    });

    return bottlenecks;
  }

  /**
   * Analyze progress trends
   * @private
   */
  _analyzeTrends(progressData) {
    const completedMilestones = progressData.getCompletedMilestones()
      .sort((a, b) => a.completedAt - b.completedAt);

    if (completedMilestones.length < 2) {
      return { trend: 'insufficient_data', details: 'Need more completed milestones for trend analysis' };
    }

    const recentMilestones = completedMilestones.slice(-3);
    const avgRecentTime = recentMilestones.reduce((sum, m) => sum + m.actualTime, 0) / recentMilestones.length;
    
    const olderMilestones = completedMilestones.slice(0, -3);
    const avgOlderTime = olderMilestones.reduce((sum, m) => sum + m.actualTime, 0) / Math.max(olderMilestones.length, 1);

    const trend = avgRecentTime < avgOlderTime ? 'improving' : 'declining';

    return {
      trend,
      recentAverage: avgRecentTime,
      historicalAverage: avgOlderTime,
      improvement: avgOlderTime > 0 ? ((avgOlderTime - avgRecentTime) / avgOlderTime) * 100 : 0
    };
  }

  /**
   * Assess risk factors
   * @private
   */
  _assessRiskFactors(progressData) {
    const risks = [];

    // Check for blocked milestones
    const blockedCount = progressData.milestones.filter(m => m.isBlocked()).length;
    if (blockedCount > 0) {
      risks.push({
        factor: 'blocked_milestones',
        severity: blockedCount > 2 ? 'high' : 'medium',
        impact: `${blockedCount} milestone(s) currently blocked`
      });
    }

    // Check for overdue milestones
    const overdueCount = progressData.getInProgressMilestones()
      .filter(m => m.getDuration() > m.estimatedTime * 1.5).length;
    if (overdueCount > 0) {
      risks.push({
        factor: 'timeline_overruns',
        severity: overdueCount > 1 ? 'high' : 'medium',
        impact: `${overdueCount} milestone(s) running behind schedule`
      });
    }

    // Check for dependency concentration
    const dependencyChains = this._findDependencyChains(progressData);
    const maxChainLength = Math.max(...dependencyChains.map(chain => chain.length));
    if (maxChainLength > 5) {
      risks.push({
        factor: 'dependency_concentration',
        severity: 'medium',
        impact: `Longest dependency chain has ${maxChainLength} steps`
      });
    }

    return risks;
  }

  /**
   * Predict completion time
   * @private
   */
  _predictCompletionTime(progressData) {
    const estimates = this.estimateCompletionTime(progressData.taskId || 'unknown');
    return estimates;
  }

  /**
   * Predict next milestones to complete
   * @private
   */
  _predictNextMilestones(progressData) {
    const pendingMilestones = progressData.getPendingMilestones();
    
    // Find milestones with all dependencies met
    const readyMilestones = pendingMilestones.filter(milestone => {
      return milestone.dependencies.every(depId => {
        const dependency = progressData.milestones.find(m => m.id === depId);
        return dependency && dependency.isCompleted();
      });
    });

    return readyMilestones.slice(0, 3).map(m => ({
      name: m.name,
      estimatedTime: m.estimatedTime,
      readiness: 'ready'
    }));
  }

  /**
   * Predict potential delays
   * @private
   */
  _predictDelays(progressData) {
    const delays = [];

    // Check milestones approaching deadline
    progressData.getInProgressMilestones().forEach(milestone => {
      const timeLeft = milestone.estimatedTime - milestone.getDuration();
      if (timeLeft < milestone.estimatedTime * 0.2) {
        delays.push({
          milestone: milestone.name,
          risk: 'high',
          timeRemaining: timeLeft,
          reason: 'Approaching estimated completion time'
        });
      }
    });

    return delays;
  }

  /**
   * Find dependency chains in progress data
   * @private
   */
  _findDependencyChains(progressData) {
    const chains = [];
    const visited = new Set();

    const buildChain = (milestoneId, currentChain = []) => {
      if (visited.has(milestoneId) || currentChain.includes(milestoneId)) {
        return currentChain;
      }

      const milestone = progressData.milestones.find(m => m.id === milestoneId);
      if (!milestone) {
        return currentChain;
      }

      const newChain = [...currentChain, milestoneId];
      visited.add(milestoneId);

      let longestChain = newChain;
      for (const depId of milestone.dependencies) {
        const depChain = buildChain(depId, newChain);
        if (depChain.length > longestChain.length) {
          longestChain = depChain;
        }
      }

      return longestChain;
    };

    progressData.milestones.forEach(milestone => {
      if (!visited.has(milestone.id)) {
        const chain = buildChain(milestone.id);
        if (chain.length > 1) {
          chains.push(chain);
        }
      }
    });

    return chains;
  }

  /**
   * Sum estimated times for milestones
   * @private
   */
  _sumEstimatedTimes(milestones) {
    return milestones.reduce((sum, milestone) => sum + (milestone.estimatedTime || 0), 0);
  }

  /**
   * Process real-time updates
   * @private
   */
  _processRealTimeUpdates() {
    for (const [taskId, progressData] of this.activeProgress.entries()) {
      const inProgressMilestones = progressData.getInProgressMilestones();
      
      // Auto-update progress for running milestones
      inProgressMilestones.forEach(milestone => {
        const elapsed = milestone.getDuration();
        const estimated = milestone.estimatedTime || 1;
        const autoProgress = Math.min(90, (elapsed / estimated) * 100);
        
        if (autoProgress > milestone.progress) {
          milestone.updateProgress(autoProgress);
        }
      });
    }
  }

  /**
   * Update reporting statistics
   * @private
   */
  _updateReportingStats(reportTime) {
    this.reportingStats.totalReports++;
    
    const totalTime = this.reportingStats.averageReportTime * (this.reportingStats.totalReports - 1) + reportTime;
    this.reportingStats.averageReportTime = totalTime / this.reportingStats.totalReports;
  }

  /**
   * Get progress reporter statistics
   * @returns {Object} Current reporter statistics
   */
  getReporterStatistics() {
    return {
      ...this.reportingStats,
      activeProgressTracking: this.activeProgress.size,
      archivedReports: this.reportingHistory.length,
      realTimeEnabled: this.realTimeUpdates,
      totalMilestonesActive: Array.from(this.activeProgress.values())
        .reduce((sum, progress) => sum + progress.milestones.length, 0)
    };
  }

  /**
   * Cleanup old progress data
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of cleaned items
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const cutoffTime = Date.now() - maxAge;
    let cleanedUp = 0;

    // Clean history
    const originalHistoryLength = this.reportingHistory.length;
    this.reportingHistory = this.reportingHistory.filter(h => h.archivedAt > cutoffTime);
    cleanedUp += originalHistoryLength - this.reportingHistory.length;

    // Clean inactive progress
    for (const [taskId, progressData] of this.activeProgress.entries()) {
      if (progressData.lastUpdated < cutoffTime) {
        this.activeProgress.delete(taskId);
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      this.logger.info(`Cleaned up ${cleanedUp} old progress records`);
    }

    return cleanedUp;
  }
}

export default ProgressReporter;