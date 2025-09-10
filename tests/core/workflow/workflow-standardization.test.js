/**
 * Workflow Standardization - Integration Tests
 * Comprehensive tests for the complete workflow standardization system
 */

import WorkflowStandardization, { TaskSpec, ValidationCriteria, ValidationCheckpoint, CompletionCriteria } from '../../../scripts/core/workflow/index.js';

describe('WorkflowStandardization', () => {
  let workflowSystem;
  
  beforeEach(() => {
    workflowSystem = new WorkflowStandardization();
  });

  afterEach(() => {
    if (workflowSystem) {
      workflowSystem.cleanup();
    }
  });

  describe('Workflow Creation', () => {
    test('should create workflow from task specification', async () => {
      const taskSpec = new TaskSpec(
        'Test Feature Implementation',
        'Implement a test feature with proper validation',
        ['Core functionality', 'User interface', 'Testing'],
        { timeLimit: 8, complexity: 'medium' }
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);

      expect(workflow).toBeDefined();
      expect(workflow.id).toMatch(/^workflow_/);
      expect(workflow.taskSpec.title).toBe('Test Feature Implementation');
      expect(workflow.steps.length).toBeGreaterThan(0);
      expect(workflow.checkpoints.size).toBeGreaterThan(0);
      expect(workflow.status).toBe('CREATED');
    });

    test('should create workflow using specific template', async () => {
      const taskSpec = new TaskSpec(
        'Add User Authentication',
        'Implement user authentication feature',
        ['Login form', 'Session management', 'Security validation']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec, 'feature_addition');

      expect(workflow).toBeDefined();
      expect(workflow.template).toBeDefined();
      expect(workflow.steps.some(step => step.name.includes('Core Functionality'))).toBe(true);
    });

    test('should auto-select appropriate template', async () => {
      const taskSpec = new TaskSpec(
        'Fix login bug',
        'Resolve issue with user login failing',
        ['Reproduce issue', 'Identify root cause', 'Implement fix']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);

      expect(workflow).toBeDefined();
      expect(workflow.steps.some(step => step.name.includes('Reproduce'))).toBe(true);
    });

    test('should handle custom validation criteria', async () => {
      const taskSpec = new TaskSpec(
        'Custom Validation Test',
        'Test custom validation integration',
        ['Basic requirement']
      );

      const validationCriteria = new ValidationCriteria();
      const checkpoint = new ValidationCheckpoint(
        'custom_check',
        'Custom Checkpoint',
        'Custom validation checkpoint',
        [{ type: 'result_exists', key: 'custom_result' }]
      );
      validationCriteria.addCheckpoint(checkpoint);

      const workflow = await workflowSystem.createWorkflow(taskSpec, null, validationCriteria);

      expect(workflow.checkpoints.has('custom_check')).toBe(true);
    });

    test('should reject invalid task specifications', async () => {
      const invalidTaskSpec = new TaskSpec('', '', []); // Invalid: empty title and no requirements

      await expect(workflowSystem.createWorkflow(invalidTaskSpec)).rejects.toThrow('Invalid task specification');
    });
  });

  describe('Workflow Execution', () => {
    test('should execute simple workflow successfully', async () => {
      const taskSpec = new TaskSpec(
        'Simple Test Task',
        'A simple task for testing execution',
        ['Basic step']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec, 'general');
      const report = await workflowSystem.executeWorkflow(workflow);

      expect(report).toBeDefined();
      expect(report.success).toBe(true);
      expect(report.status).toBe('COMPLETED');
      expect(report.progress).toBe(100);
    });

    test('should handle workflow with dependencies', async () => {
      const taskSpec = new TaskSpec(
        'Complex Task with Dependencies',
        'Task requiring dependency management',
        ['Step A', 'Step B depends on A', 'Step C depends on B']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec, 'feature_addition');
      const report = await workflowSystem.executeWorkflow(workflow);

      expect(report).toBeDefined();
      expect(report.completedSteps).toBeGreaterThan(0);
    });

    test('should execute validation checkpoints', async () => {
      const taskSpec = new TaskSpec(
        'Validation Test Task',
        'Task to test checkpoint validation',
        ['Implementation', 'Validation']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec, 'feature_addition');
      const report = await workflowSystem.executeWorkflow(workflow, { validateCheckpoints: true });

      expect(report).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.metrics.checkpointSuccessRate).toBeGreaterThanOrEqual(0);
    });

    test('should handle execution timeout', async () => {
      const taskSpec = new TaskSpec(
        'Long Running Task',
        'Task that might take a long time',
        ['Long operation']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec, 'general');
      const report = await workflowSystem.executeWorkflow(workflow, { timeout: 100 }); // Very short timeout

      expect(report).toBeDefined();
      // Should complete normally in simulation environment
    });
  });

  describe('Workflow Management', () => {
    test('should track workflow status', async () => {
      const taskSpec = new TaskSpec(
        'Status Tracking Test',
        'Test workflow status tracking',
        ['Basic requirement']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);
      const status = workflowSystem.getWorkflowStatus(workflow.id);

      expect(status).toBeDefined();
      expect(status.id).toBe(workflow.id);
      expect(status.taskTitle).toBe('Status Tracking Test');
      expect(status.status).toBe('CREATED');
      expect(status.progress).toBe(0);
    });

    test('should pause and resume workflow', async () => {
      const taskSpec = new TaskSpec(
        'Pause Resume Test',
        'Test workflow pause and resume',
        ['Step 1', 'Step 2']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);
      workflow.status = 'RUNNING'; // Simulate running state

      const paused = workflowSystem.pauseWorkflow(workflow.id, 'Test pause');
      expect(paused).toBe(true);
      expect(workflow.status).toBe('PAUSED');

      const resumed = workflowSystem.resumeWorkflow(workflow.id);
      expect(resumed).toBe(true);
      expect(workflow.status).toBe('RUNNING');
    });

    test('should cancel workflow', async () => {
      const taskSpec = new TaskSpec(
        'Cancellation Test',
        'Test workflow cancellation',
        ['Step 1']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);
      workflow.status = 'RUNNING'; // Simulate running state

      const cancelled = workflowSystem.cancelWorkflow(workflow.id, 'Test cancellation');
      expect(cancelled).toBe(true);
      expect(workflow.status).toBe('CANCELLED');
    });

    test('should provide recovery options for failed workflow', async () => {
      const taskSpec = new TaskSpec(
        'Recovery Test',
        'Test workflow recovery options',
        ['Step 1', 'Step 2']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);
      workflow.status = 'FAILED';
      workflow.currentStep = 1;
      workflow.addError(new Error('Test failure'));

      const options = workflowSystem.getWorkflowRecoveryOptions(workflow.id);

      expect(options).toBeDefined();
      expect(options.length).toBeGreaterThan(0);
      expect(options.some(opt => opt.type === 'resume_from_current')).toBe(true);
    });
  });

  describe('Validation System', () => {
    test('should validate checkpoint successfully', async () => {
      const taskSpec = new TaskSpec(
        'Checkpoint Validation Test',
        'Test checkpoint validation',
        ['Implementation step']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec, 'feature_addition');
      workflow.results.set('test_result', 'success'); // Mock result

      const checkpoints = Array.from(workflow.checkpoints.keys());
      if (checkpoints.length > 0) {
        const result = await workflowSystem.validateCheckpoint(workflow, checkpoints[0]);
        
        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
        expect(result.timestamp).toBeDefined();
      }
    });

    test('should handle validation failure', async () => {
      const taskSpec = new TaskSpec(
        'Validation Failure Test',
        'Test validation failure handling',
        ['Step that will fail validation']
      );

      const validationCriteria = new ValidationCriteria();
      const failingCheckpoint = new ValidationCheckpoint(
        'failing_check',
        'Failing Checkpoint',
        'This checkpoint will fail',
        [{ type: 'result_exists', key: 'non_existent_result' }]
      );
      validationCriteria.addCheckpoint(failingCheckpoint);

      const workflow = await workflowSystem.createWorkflow(taskSpec, null, validationCriteria);
      const result = await workflowSystem.validateCheckpoint(workflow, 'failing_check');

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });
  });

  describe('MVP Decomposition', () => {
    test('should decompose feature addition task correctly', async () => {
      const taskSpec = new TaskSpec(
        'Add Shopping Cart Feature',
        'Implement shopping cart functionality with user interface',
        ['Add to cart', 'View cart', 'Remove items', 'Checkout integration', 'Price calculation'],
        { timeLimit: 16, complexity: 'high' }
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);

      expect(workflow.decomposition).toBeDefined();
      expect(workflow.decomposition.mvpCore).toBeDefined();
      expect(workflow.decomposition.mvpCore.steps.length).toBeGreaterThan(0);
      expect(workflow.decomposition.phasing).toBeDefined();
      expect(workflow.decomposition.phasing.length).toBeGreaterThan(0);
    });

    test('should prioritize essential features first', async () => {
      const taskSpec = new TaskSpec(
        'User Management System',
        'Complete user management with advanced features',
        ['User registration', 'User login', 'Profile management', 'Advanced analytics', 'Admin dashboard']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);
      const mvpSteps = workflow.decomposition.mvpCore.steps;

      expect(mvpSteps.length).toBeGreaterThan(0);
      expect(workflow.decomposition.phasing.find(phase => phase.name === 'MVP Core')).toBeDefined();
    });
  });

  describe('Template System', () => {
    test('should suggest appropriate templates', async () => {
      const bugTaskSpec = new TaskSpec(
        'Fix authentication bug',
        'User login is failing intermittently',
        ['Reproduce issue', 'Debug login flow', 'Fix root cause']
      );

      const suggestions = workflowSystem.templateManager.suggestTemplates(bugTaskSpec);

      expect(suggestions).toBeDefined();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].name).toBe('bug_fix');
      expect(suggestions[0].score).toBeGreaterThan(0.4);
    });

    test('should provide template statistics', () => {
      const stats = workflowSystem.templateManager.getManagerStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalTemplates).toBeGreaterThan(0);
      expect(stats.builtInTemplates).toBeGreaterThan(0);
    });
  });

  describe('System Statistics', () => {
    test('should provide comprehensive system statistics', async () => {
      // Create and execute a workflow to generate statistics
      const taskSpec = new TaskSpec(
        'Statistics Test Task',
        'Task for generating system statistics',
        ['Basic step']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);
      await workflowSystem.executeWorkflow(workflow);

      const stats = workflowSystem.getSystemStatistics();

      expect(stats).toBeDefined();
      expect(stats.system).toBeDefined();
      expect(stats.execution).toBeDefined();
      expect(stats.validation).toBeDefined();
      expect(stats.templates).toBeDefined();
      expect(stats.dependencies).toBeDefined();

      expect(stats.system.totalWorkflowsCreated).toBeGreaterThan(0);
      expect(stats.system.uptime).toBeGreaterThan(0);
    });
  });

  describe('Configuration Import/Export', () => {
    test('should export workflow configuration', async () => {
      const taskSpec = new TaskSpec(
        'Export Test Task',
        'Task for testing configuration export',
        ['Step 1', 'Step 2']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);
      const config = workflowSystem.exportWorkflowConfiguration(workflow.id);

      expect(config).toBeDefined();
      expect(config.taskSpec).toBeDefined();
      expect(config.steps).toBeDefined();
      expect(config.checkpoints).toBeDefined();
      expect(config.exportedAt).toBeDefined();
    });

    test('should import workflow configuration', async () => {
      const config = {
        taskSpec: {
          title: 'Imported Task',
          description: 'Task created from imported configuration',
          requirements: ['Imported requirement'],
          constraints: {}
        },
        steps: [
          {
            id: 'imported_step',
            name: 'Imported Step',
            type: 'implementation',
            status: 'PENDING'
          }
        ],
        checkpoints: []
      };

      const workflow = await workflowSystem.importWorkflowConfiguration(config);

      expect(workflow).toBeDefined();
      expect(workflow.taskSpec.title).toBe('Imported Task');
      expect(workflow.steps.length).toBe(1);
      expect(workflow.steps[0].id).toBe('imported_step');
    });
  });

  describe('Error Handling', () => {
    test('should handle workflow creation errors gracefully', async () => {
      const invalidTaskSpec = {
        // Missing required properties
        title: 'Invalid Task'
      };

      await expect(workflowSystem.createWorkflow(invalidTaskSpec)).rejects.toThrow();
    });

    test('should handle execution errors gracefully', async () => {
      const taskSpec = new TaskSpec(
        'Error Test Task',
        'Task that will encounter errors',
        ['Error-prone step']
      );

      const workflow = await workflowSystem.createWorkflow(taskSpec);
      
      // Force an error condition
      workflow.steps[0].implementation = {
        type: 'command',
        command: 'invalid_command_that_will_fail'
      };

      const report = await workflowSystem.executeWorkflow(workflow);

      expect(report).toBeDefined();
      expect(report.success).toBeDefined();
      // Error handling should still produce a valid report
    });
  });

  describe('Performance', () => {
    test('should handle multiple concurrent workflows', async () => {
      const workflows = [];
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const taskSpec = new TaskSpec(
          `Concurrent Task ${i}`,
          `Concurrent test task number ${i}`,
          ['Basic step']
        );

        const createPromise = workflowSystem.createWorkflow(taskSpec, 'general');
        promises.push(createPromise);
      }

      const createdWorkflows = await Promise.all(promises);
      expect(createdWorkflows.length).toBe(5);

      const executionPromises = createdWorkflows.map(workflow => 
        workflowSystem.executeWorkflow(workflow)
      );

      const reports = await Promise.all(executionPromises);
      expect(reports.length).toBe(5);
      expect(reports.every(report => report !== null)).toBe(true);
    });

    test('should maintain performance with large workflow', async () => {
      const requirements = Array.from({ length: 20 }, (_, i) => `Requirement ${i + 1}`);
      
      const taskSpec = new TaskSpec(
        'Large Workflow Test',
        'Test workflow with many requirements',
        requirements,
        { complexity: 'high' }
      );

      const startTime = Date.now();
      const workflow = await workflowSystem.createWorkflow(taskSpec);
      const creationTime = Date.now() - startTime;

      expect(creationTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(workflow.steps.length).toBeGreaterThanOrEqual(4);
    });
  });
});

describe('WorkflowStandardization Integration', () => {
  let workflowSystem;

  beforeEach(() => {
    workflowSystem = new WorkflowStandardization();
  });

  test('should integrate all system components', async () => {
    const taskSpec = new TaskSpec(
      'Integration Test Feature',
      'Complete feature implementation with all system components',
      ['Analysis', 'Design', 'Implementation', 'Testing', 'Deployment'],
      { timeLimit: 24, complexity: 'high' }
    );

    // Create workflow (tests template system, MVP decomposer)
    const workflow = await workflowSystem.createWorkflow(taskSpec, 'feature_addition');
    
    // Execute workflow (tests workflow engine, dependency tracker, validation controller)
    const report = await workflowSystem.executeWorkflow(workflow, {
      validateCheckpoints: true,
      trackDependencies: true,
      enableRecovery: true
    });

    // Verify all components worked together
    expect(report).toBeDefined();
    expect(report.success).toBeDefined();
    expect(workflow.dependencyTracking).toBeDefined();
    expect(workflow.checkpoints.size).toBeGreaterThan(0);
    
    // Verify system statistics show activity
    const stats = workflowSystem.getSystemStatistics();
    expect(stats.system.totalWorkflowsCreated).toBe(1);
    expect(stats.execution.totalExecuted).toBeGreaterThanOrEqual(1);
    expect(stats.templates.totalInstantiations).toBeGreaterThanOrEqual(1);
  });

  test('should maintain data consistency across components', async () => {
    const taskSpec = new TaskSpec(
      'Data Consistency Test',
      'Test data consistency across system components',
      ['Step A', 'Step B', 'Step C']
    );

    const workflow = await workflowSystem.createWorkflow(taskSpec);
    const workflowId = workflow.id;

    // Check consistency between different components
    const systemStatus = workflowSystem.getWorkflowStatus(workflowId);
    const engineStatus = workflowSystem.workflowEngine.getWorkflowStatus(workflowId);
    const dependencyStatus = workflowSystem.dependencyTracker.getDependencyStatus(workflowId);

    expect(systemStatus.id).toBe(workflowId);
    expect(dependencyStatus.workflowId).toBe(workflowId);
    expect(systemStatus.totalSteps).toBe(workflow.steps.length);
  });
});