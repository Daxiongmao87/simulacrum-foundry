/**
 * Communication Enhancement - Integration Tests
 * Comprehensive tests for the complete communication enhancement system
 */

import CommunicationEnhancement, { TaskResults, CommunicationContext, ProgressData, ProgressMilestone } from '../../../scripts/core/communication/index.js';

describe('CommunicationEnhancement', () => {
  let communicationSystem;
  
  beforeEach(() => {
    communicationSystem = new CommunicationEnhancement();
  });

  afterEach(() => {
    if (communicationSystem) {
      communicationSystem.cleanup();
    }
  });

  describe('Final Response Formatting', () => {
    test('should format successful task completion response', async () => {
      const taskResults = new TaskResults('task_1', 'Test Feature Implementation', 'completed');
      taskResults.addOutput('feature_code', 'implementation.js', 'Main feature implementation');
      taskResults.addChange({ type: 'file_created', description: 'Created feature implementation' });
      taskResults.duration = 5000;

      const contextInfo = {
        userInfo: { experienceLevel: 'intermediate' },
        environmentInfo: { cli: true, terminalWidth: 80 }
      };

      const response = await communicationSystem.formatFinalResponse(taskResults, contextInfo);

      expect(response).toBeDefined();
      expect(response.sections).toBeDefined();
      expect(response.sections.length).toBeGreaterThan(0);
      expect(response.render()).toContain('Test Feature Implementation');
      
      const metadata = response.getMetadata();
      expect(metadata.wordCount).toBeGreaterThan(0);
      expect(metadata.characterCount).toBeGreaterThan(0);
    });

    test('should format error response with recovery options', async () => {
      const taskResults = new TaskResults('task_2', 'Failed Task', 'failed');
      taskResults.addError(new Error('Test error occurred'), 'During implementation');
      taskResults.addOutput('partial_work', 'partial.js', 'Partially completed work');

      const contextInfo = {
        userInfo: { experienceLevel: 'beginner' },
        environmentInfo: { cli: true }
      };

      const response = await communicationSystem.formatFinalResponse(taskResults, contextInfo);

      expect(response).toBeDefined();
      expect(response.render()).toContain('Failed Task');
      expect(response.sections.some(s => s.title.toLowerCase().includes('error'))).toBe(true);
    });

    test('should adapt formatting based on user experience level', async () => {
      const taskResults = new TaskResults('task_3', 'Simple Task', 'completed');
      taskResults.addOutput('result', 'output.txt', 'Simple output');

      const beginnerContext = {
        userInfo: { experienceLevel: 'beginner' },
        environmentInfo: { cli: true }
      };

      const expertContext = {
        userInfo: { experienceLevel: 'expert' },
        environmentInfo: { cli: true }
      };

      const beginnerResponse = await communicationSystem.formatFinalResponse(taskResults, beginnerContext);
      const expertResponse = await communicationSystem.formatFinalResponse(taskResults, expertContext);

      const beginnerLength = beginnerResponse.getMetadata().characterCount;
      const expertLength = expertResponse.getMetadata().characterCount;

      // Beginner responses should generally be more verbose
      expect(beginnerLength).toBeGreaterThanOrEqual(expertLength * 0.8);
    });

    test('should include handoff section when requested', async () => {
      const taskResults = new TaskResults('task_4', 'Task with Handoff', 'completed');
      taskResults.addOutput('deliverable', 'result.js', 'Final deliverable');

      const response = await communicationSystem.formatFinalResponse(
        taskResults,
        { userInfo: {}, environmentInfo: {} },
        { includeHandoff: true }
      );

      expect(response.sections.some(s => s.title.toLowerCase().includes('next'))).toBe(true);
    });
  });

  describe('Progress Reporting', () => {
    test('should initialize progress tracking with milestones', () => {
      const milestones = [
        { id: 'milestone_1', name: 'Analysis', estimatedTime: 30 },
        { id: 'milestone_2', name: 'Implementation', estimatedTime: 60 },
        { id: 'milestone_3', name: 'Testing', estimatedTime: 20 }
      ];

      const setup = communicationSystem.initializeProgressTracking('task_progress_1', milestones);

      expect(setup).toBeDefined();
      expect(setup.trackingEnabled).toBe(true);
      expect(setup.taskId).toBe('task_progress_1');
      expect(setup.progressData).toBeDefined();
    });

    test('should generate comprehensive progress report', async () => {
      const milestones = [
        { id: 'milestone_1', name: 'Analysis', estimatedTime: 30 },
        { id: 'milestone_2', name: 'Implementation', estimatedTime: 60 }
      ];

      communicationSystem.initializeProgressTracking('task_progress_2', milestones);
      
      // Complete first milestone
      await communicationSystem.updateProgress('task_progress_2', 'milestone_1', 100);

      const progressData = communicationSystem.progressReporter.getProgressStatus('task_progress_2');
      const report = await communicationSystem.generateProgressReport(progressData);

      expect(report).toBeDefined();
      expect(report.sections.length).toBeGreaterThan(0);
      expect(report.render()).toContain('Progress');
    });

    test('should update milestone progress and generate reports', async () => {
      const milestones = [
        { id: 'milestone_1', name: 'Development', estimatedTime: 45 }
      ];

      communicationSystem.initializeProgressTracking('task_progress_3', milestones);

      const response = await communicationSystem.updateProgress(
        'task_progress_3',
        'milestone_1',
        75,
        {
          generateReport: true,
          contextInfo: { userInfo: {}, environmentInfo: {} }
        }
      );

      expect(response).toBeDefined();
      expect(response.render()).toContain('Progress');
    });

    test('should handle progress completion', async () => {
      const milestones = [
        { id: 'milestone_complete', name: 'Task Completion', estimatedTime: 30 }
      ];

      communicationSystem.initializeProgressTracking('task_progress_4', milestones);

      await communicationSystem.updateProgress(
        'task_progress_4',
        'milestone_complete',
        100,
        {
          completionData: { completedBy: 'system', quality: 'high' }
        }
      );

      const status = communicationSystem.progressReporter.getProgressStatus('task_progress_4');
      expect(status.completedMilestones).toBe(1);
      expect(status.overallProgress).toBe(100);
    });
  });

  describe('Collaboration Workflow', () => {
    test('should facilitate collaborative workflow with feedback points', async () => {
      const taskResults = new TaskResults('collab_task_1', 'Collaborative Review', 'completed');
      taskResults.addOutput('implementation', 'feature.js', 'Feature implementation');

      const feedbackPoints = [
        {
          title: 'Implementation Approach',
          description: 'Does the implementation approach meet your requirements?',
          type: 'choice',
          options: ['Yes, proceed', 'Needs modification', 'Start over']
        },
        {
          title: 'Code Quality',
          description: 'How would you rate the code quality?',
          type: 'rating',
          options: ['Excellent', 'Good', 'Needs improvement']
        }
      ];

      const response = await communicationSystem.facilitateCollaboration(
        'collab_session_1',
        taskResults,
        feedbackPoints,
        { userInfo: {}, environmentInfo: {} }
      );

      expect(response).toBeDefined();
      expect(response.render()).toContain('Feedback Needed');
      expect(response.render()).toContain('Implementation Approach');
      expect(response.render()).toContain('Code Quality');
    });

    test('should process collaborative feedback and generate iteration plan', async () => {
      const taskResults = new TaskResults('collab_task_2', 'Feedback Processing', 'completed');
      const feedbackPoints = [
        { id: 'feedback_1', title: 'Approach Review', description: 'Review the approach' }
      ];

      await communicationSystem.facilitateCollaboration(
        'collab_session_2',
        taskResults,
        feedbackPoints
      );

      const userFeedback = {
        'feedback_1': 'The approach looks good but needs some modifications to handle edge cases better'
      };

      const response = await communicationSystem.processCollaborativeFeedback(
        'collab_session_2',
        userFeedback
      );

      expect(response).toBeDefined();
      expect(response.render()).toContain('Feedback Received');
    });

    test('should complete collaboration with summary', async () => {
      const taskResults = new TaskResults('collab_task_3', 'Summary Test', 'completed');
      const feedbackPoints = [{ title: 'Test Point', description: 'Test description' }];

      await communicationSystem.facilitateCollaboration('collab_session_3', taskResults, feedbackPoints);

      const summary = await communicationSystem.completeCollaboration('collab_session_3', {
        outcome: 'successful',
        userSatisfaction: 'high'
      });

      expect(summary).toBeDefined();
      expect(summary.render()).toContain('Collaboration Complete');
    });

    test('should handle missing collaboration sessions gracefully', async () => {
      const response = await communicationSystem.processCollaborativeFeedback(
        'nonexistent_session',
        { feedback: 'test' }
      );

      expect(response).toBeDefined();
      expect(response.render().toLowerCase()).toContain('error');
    });
  });

  describe('Handoff Instructions', () => {
    test('should create comprehensive handoff instructions', async () => {
      const taskResults = new TaskResults('handoff_task_1', 'Feature Implementation', 'completed');
      taskResults.addOutput('feature_code', 'feature.js', 'Implemented feature');
      taskResults.addChange({ type: 'file_created', description: 'Created feature file' });

      const nextActions = [
        {
          action: 'Deploy to staging environment',
          priority: 'high',
          estimatedTime: 20
        },
        {
          action: 'Update documentation',
          priority: 'medium',
          estimatedTime: 30
        }
      ];

      const handoff = await communicationSystem.createHandoffInstructions(
        taskResults,
        nextActions,
        { userInfo: {}, environmentInfo: {} }
      );

      expect(handoff).toBeDefined();
      expect(handoff.render()).toContain('Deploy to staging');
      expect(handoff.render()).toContain('Update documentation');
    });

    test('should validate handoff completeness', async () => {
      const taskResults = new TaskResults('handoff_task_2', 'Validation Test', 'completed');
      taskResults.addOutput('output', 'result.txt', 'Task output');

      const handoff = await communicationSystem.createHandoffInstructions(
        taskResults,
        [],
        { includeValidation: true, userInfo: {}, environmentInfo: {} }
      );

      expect(handoff).toBeDefined();
      // Should include validation section if handoff is incomplete
      const content = handoff.render();
      expect(content.length).toBeGreaterThan(50);
    });

    test('should generate contextual next actions', async () => {
      const taskResults = new TaskResults('handoff_task_3', 'Next Actions Test', 'completed');
      taskResults.addOutput('api', 'api.js', 'REST API implementation');
      taskResults.metadata.type = 'feature_addition';

      const nextActions = await communicationSystem.handoffManager.generateNextActions(
        taskResults
      );

      expect(nextActions).toBeDefined();
      expect(nextActions.length).toBeGreaterThan(0);
      expect(nextActions.some(action => action.priority === 'high')).toBe(true);
    });
  });

  describe('Context Analysis and Adaptation', () => {
    test('should analyze task complexity correctly', async () => {
      const simpleTask = {
        title: 'Simple file edit',
        type: 'simple_edit',
        requirements: ['Edit one file'],
        estimatedHours: 0.5
      };

      const complexTask = {
        title: 'Microservices architecture implementation',
        type: 'architecture',
        requirements: ['Design', 'Implementation', 'Testing', 'Documentation', 'Deployment'],
        estimatedHours: 40,
        technologies: ['kubernetes', 'microservices', 'api-gateway']
      };

      const simpleContext = await communicationSystem.contextAnalyzer.analyzeContext(simpleTask);
      const complexContext = await communicationSystem.contextAnalyzer.analyzeContext(complexTask);

      expect(simpleContext.taskComplexity).toBe('low');
      expect(complexContext.taskComplexity).toBe('high');
    });

    test('should adapt communication style based on context', async () => {
      const taskInfo = {
        title: 'Test Task',
        type: 'general',
        requirements: ['Basic requirement']
      };

      const verboseUser = { preferences: { verbosityLevel: 'verbose' } };
      const conciseUser = { preferences: { verbosityLevel: 'concise' } };

      const verboseContext = await communicationSystem.contextAnalyzer.analyzeContext(
        taskInfo,
        verboseUser
      );
      
      const conciseContext = await communicationSystem.contextAnalyzer.analyzeContext(
        taskInfo,
        conciseUser
      );

      expect(verboseContext.isVerbose()).toBe(true);
      expect(conciseContext.isConcise()).toBe(true);
    });

    test('should provide communication recommendations', async () => {
      const contextInfo = {
        taskInfo: { title: 'Error Handling', type: 'bug_fix' },
        userInfo: { experienceLevel: 'beginner' },
        environmentInfo: { timeConstraints: true }
      };

      const recommendations = await communicationSystem.getCommunicationRecommendations(
        contextInfo,
        'error'
      );

      expect(recommendations).toBeDefined();
      expect(recommendations.tone).toBeDefined();
      expect(recommendations.length).toBeDefined();
      expect(recommendations.detail).toBeDefined();
    });
  });

  describe('System Integration', () => {
    test('should integrate all communication components', async () => {
      // Initialize progress tracking
      const milestones = [
        { id: 'analysis', name: 'Analysis Phase', estimatedTime: 20 },
        { id: 'implementation', name: 'Implementation Phase', estimatedTime: 40 }
      ];

      const progressSetup = communicationSystem.initializeProgressTracking('integration_test', milestones);
      expect(progressSetup.trackingEnabled).toBe(true);

      // Update progress
      await communicationSystem.updateProgress('integration_test', 'analysis', 100);
      await communicationSystem.updateProgress('integration_test', 'implementation', 50);

      // Create task results
      const taskResults = new TaskResults('integration_test', 'Integration Test Task', 'completed');
      taskResults.addOutput('result', 'output.js', 'Integration test output');

      // Generate final response with progress
      const progressData = communicationSystem.progressReporter.getProgressStatus('integration_test');
      const response = await communicationSystem.formatFinalResponse(
        taskResults,
        { progressData, userInfo: {}, environmentInfo: {} },
        { includeProgress: true, includeHandoff: true }
      );

      expect(response).toBeDefined();
      expect(response.sections.length).toBeGreaterThanOrEqual(2);

      // Verify system statistics
      const stats = communicationSystem.getSystemStatistics();
      expect(stats.system.totalCommunications).toBeGreaterThan(0);
      expect(stats.progressReporter.activeProgressTracking).toBeGreaterThanOrEqual(1);
    });

    test('should handle error scenarios gracefully', async () => {
      const taskResults = new TaskResults('error_test', 'Error Scenario Test', 'failed');
      taskResults.addError(new Error('Critical system failure'));

      const response = await communicationSystem.formatFinalResponse(
        taskResults,
        { userInfo: {}, environmentInfo: {} }
      );

      expect(response).toBeDefined();
      expect(response.render()).toContain('Error Scenario Test');
    });

    test('should maintain performance with large datasets', async () => {
      const startTime = Date.now();

      // Create large task result
      const taskResults = new TaskResults('performance_test', 'Performance Test Task', 'completed');
      
      for (let i = 0; i < 50; i++) {
        taskResults.addOutput(`output_${i}`, `file_${i}.js`, `Output file ${i}`);
        taskResults.addChange({ type: 'file_created', description: `Created file ${i}` });
      }

      const response = await communicationSystem.formatFinalResponse(
        taskResults,
        { userInfo: {}, environmentInfo: {} }
      );

      const processingTime = Date.now() - startTime;

      expect(response).toBeDefined();
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(response.getMetadata().characterCount).toBeGreaterThan(0);
    });
  });

  describe('User Profile Management', () => {
    test('should update user profile with interaction feedback', () => {
      const userId = 'test_user_1';
      const interactionData = {
        taskType: 'feature_addition',
        responseLength: 500,
        userResponse: 'This looks good, but could you make it more concise?'
      };
      
      const feedback = {
        communicationRating: 4,
        tooVerbose: true,
        preferredStyle: 'concise'
      };

      communicationSystem.updateUserProfile(userId, interactionData, feedback);

      const profile = communicationSystem.contextAnalyzer.userProfiles.get(userId);
      expect(profile).toBeDefined();
      expect(profile.totalInteractions).toBe(1);
      expect(profile.preferences.verbosityLevel).toBeDefined();
    });

    test('should adapt responses based on user profile history', async () => {
      const userId = 'test_user_2';
      
      // Simulate user preferring concise responses
      for (let i = 0; i < 3; i++) {
        communicationSystem.updateUserProfile(userId, 
          { taskType: 'general', responseLength: 200 },
          { tooVerbose: true, preferredStyle: 'concise' }
        );
      }

      const contextInfo = {
        userInfo: { userId, preferences: { verbosityLevel: 'concise' } },
        environmentInfo: {}
      };

      const taskResults = new TaskResults('user_profile_test', 'Profile Test', 'completed');
      const response = await communicationSystem.formatFinalResponse(taskResults, contextInfo);

      expect(response).toBeDefined();
      // Response should be adapted for concise preference
      expect(response.getMetadata().characterCount).toBeLessThan(1500);
    });
  });

  describe('Cleanup and Maintenance', () => {
    test('should cleanup old communication data', () => {
      // Add some test data
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      
      communicationSystem.communicationHistory.push({
        id: 'old_comm_1',
        type: 'test',
        timestamp: oldTimestamp
      });

      const cleanedUp = communicationSystem.cleanup(24 * 60 * 60 * 1000); // 24 hours
      
      expect(cleanedUp).toBeGreaterThanOrEqual(1);
    });

    test('should provide comprehensive system statistics', () => {
      const stats = communicationSystem.getSystemStatistics();

      expect(stats).toBeDefined();
      expect(stats.system).toBeDefined();
      expect(stats.responseFormatter).toBeDefined();
      expect(stats.progressReporter).toBeDefined();
      expect(stats.collaborationEngine).toBeDefined();
      expect(stats.contextAnalyzer).toBeDefined();
      expect(stats.handoffManager).toBeDefined();

      expect(stats.system.uptime).toBeGreaterThan(0);
    });
  });
});

describe('CommunicationEnhancement Performance', () => {
  let communicationSystem;

  beforeEach(() => {
    communicationSystem = new CommunicationEnhancement();
  });

  afterEach(() => {
    communicationSystem.cleanup();
  });

  test('should handle concurrent operations efficiently', async () => {
    const promises = [];
    
    // Create multiple concurrent operations
    for (let i = 0; i < 10; i++) {
      const taskResults = new TaskResults(`concurrent_${i}`, `Concurrent Task ${i}`, 'completed');
      taskResults.addOutput(`output_${i}`, `result_${i}.js`, `Output ${i}`);
      
      const promise = communicationSystem.formatFinalResponse(
        taskResults,
        { userInfo: {}, environmentInfo: {} }
      );
      
      promises.push(promise);
    }

    const startTime = Date.now();
    const responses = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    expect(responses.length).toBe(10);
    expect(responses.every(r => r !== null)).toBe(true);
    expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
  });

  test('should maintain memory efficiency with large operations', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Perform large operation
    const taskResults = new TaskResults('memory_test', 'Memory Efficiency Test', 'completed');
    
    for (let i = 0; i < 100; i++) {
      taskResults.addOutput(`large_output_${i}`, `large_file_${i}.js`, `Large output file ${i}`);
    }

    await communicationSystem.formatFinalResponse(
      taskResults,
      { userInfo: {}, environmentInfo: {} }
    );

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (less than 50MB)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  });
});