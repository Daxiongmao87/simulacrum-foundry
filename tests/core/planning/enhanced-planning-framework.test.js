/**
 * Enhanced Planning Framework - Integration Tests
 * Tests for the main framework orchestration
 */

import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { EnhancedPlanningFramework } from '../../../scripts/core/planning/enhanced-planning-framework.js';

describe('EnhancedPlanningFramework Integration', () => {
  let framework;

  beforeEach(() => {
    framework = new EnhancedPlanningFramework();
  });

  describe('createStructuredPlan - Main entry point', () => {
    it('should create complete planning response', async () => {
      const taskDescription = 'Implement user dashboard with analytics';
      const context = { projectType: 'web-app', framework: 'react' };

      const response = await framework.createStructuredPlan(taskDescription, context);

      // Validate response structure
      expect(response).toHaveProperty('structured_plan');
      expect(response).toHaveProperty('preamble_message');
      expect(response).toHaveProperty('progress_update');
      expect(response).toHaveProperty('todo_compatibility');
      expect(response).toHaveProperty('validation');

      // Validate plan structure
      expect(response.structured_plan.id).toBeDefined();
      expect(response.structured_plan.steps).toBeInstanceOf(Array);
      expect(response.structured_plan.context.originalTask).toBe(taskDescription);

      // Validate preamble message constraints (8-12 words)
      const preambleWords = response.preamble_message.split(' ').length;
      expect(preambleWords).toBeGreaterThanOrEqual(3);
      expect(preambleWords).toBeLessThanOrEqual(12);

      // Validate TodoWrite compatibility
      expect(response.todo_compatibility.todos).toBeInstanceOf(Array);
      expect(response.todo_compatibility.planId).toBe(response.structured_plan.id);
    });

    it('should validate input constraints', async () => {
      // Test empty task description
      await expect(framework.createStructuredPlan(''))
        .rejects.toThrow('Task description must be a non-empty string');

      // Test invalid context
      await expect(framework.createStructuredPlan('Valid task', 'invalid context'))
        .rejects.toThrow('Context information must be an object');
    });
  });

  describe('Step execution workflow', () => {
    let planId;
    let stepId;

    beforeEach(async () => {
      const response = await framework.createStructuredPlan('Test workflow task');
      planId = response.structured_plan.id;
      stepId = response.structured_plan.steps[0].id;
    });

    it('should execute complete step lifecycle', async () => {
      // Start step
      const startResponse = await framework.startStep(planId, stepId);
      expect(startResponse.step_started).toBe(stepId);
      expect(startResponse.structured_plan.steps[0].status).toBe('in_progress');

      // Complete step
      const completeResponse = await framework.completeStep(planId, stepId);
      expect(completeResponse.step_completed).toBe(stepId);
      expect(completeResponse.structured_plan.steps[0].status).toBe('completed');
    });

    it('should handle step errors with recovery', async () => {
      const error = 'Test error for recovery';
      
      const recoveryResponse = await framework.handleStepError(planId, stepId, error);
      
      expect(recoveryResponse).toHaveProperty('error_recovery');
      expect(recoveryResponse.failed_step).toBe(stepId);
      expect(recoveryResponse.error_recovery).toContain('Issue encountered');
    });
  });

  describe('Progress tracking', () => {
    it('should provide accurate progress information', async () => {
      const response = await framework.createStructuredPlan('Progress tracking test');
      const planId = response.structured_plan.id;

      const progress = await framework.getProgress(planId);
      
      expect(progress).toHaveProperty('plan_id', planId);
      expect(progress).toHaveProperty('progress_report');
      expect(progress).toHaveProperty('validation_status');
      expect(progress.progress_report.totalSteps).toBeGreaterThan(0);
      expect(progress.progress_report.completedSteps).toBe(0);
    });
  });

  describe('TodoWrite integration', () => {
    it('should integrate with TodoWrite updates', async () => {
      const response = await framework.createStructuredPlan('TodoWrite integration test');
      const planId = response.structured_plan.id;

      const todoUpdates = [
        {
          content: 'Updated first step',
          status: 'completed',
          activeForm: 'Updating first step'
        },
        {
          content: 'Second step remains',
          status: 'pending',
          activeForm: 'Working on second step'
        }
      ];

      const integrationResponse = await framework.integrateWithTodoWrite(planId, todoUpdates);
      
      expect(integrationResponse.integration_success).toBe(true);
      expect(integrationResponse.structured_plan.steps[0].status).toBe('completed');
      expect(integrationResponse.structured_plan.steps[0].content).toBe('Updated first step');
    });

    it('should validate TodoWrite compatibility', async () => {
      const response = await framework.createStructuredPlan('Compatibility test');
      const planId = response.structured_plan.id;

      const invalidTodos = [
        {
          content: 'Valid step',
          status: 'invalid_status', // Invalid status
          activeForm: 'Working on valid step'
        }
      ];

      await expect(framework.integrateWithTodoWrite(planId, invalidTodos))
        .rejects.toThrow('TodoWrite compatibility issues');
    });
  });

  describe('Plan modification', () => {
    it('should update plans while maintaining consistency', async () => {
      const response = await framework.createStructuredPlan('Modification test');
      const planId = response.structured_plan.id;
      const originalStepCount = response.structured_plan.steps.length;

      const updates = {
        steps: [
          ...response.structured_plan.steps,
          {
            id: 'new_step_' + Date.now(),
            content: 'Additional step added',
            activeForm: 'Adding additional step',
            status: 'pending',
            dependencies: [],
            metadata: { order: originalStepCount + 1 }
          }
        ]
      };

      const updateResponse = await framework.updatePlan(planId, updates);
      
      expect(updateResponse.structured_plan.steps.length).toBe(originalStepCount + 1);
      expect(updateResponse.preamble_message).toContain('updated');
    });
  });

  describe('Performance and scalability', () => {
    it('should meet response time requirements', async () => {
      const startTime = Date.now();
      
      await framework.createStructuredPlan('Performance test task');
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200); // Framework initialization should be under 200ms
    });

    it('should handle complex plans efficiently', async () => {
      const complexTask = 'Build comprehensive project management system with user authentication, project creation, task management, team collaboration, reporting dashboard, file sharing, notifications, and admin panel';
      
      const startTime = Date.now();
      const response = await framework.createStructuredPlan(complexTask);
      const duration = Date.now() - startTime;
      
      expect(response.structured_plan.steps.length).toBeLessThanOrEqual(50);
      expect(duration).toBeLessThan(200);
      expect(response.validation.valid).toBe(true);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle plan not found errors', async () => {
      await expect(framework.startStep('nonexistent-plan', 'step1'))
        .rejects.toThrow('Plan nonexistent-plan not found');
      
      await expect(framework.getProgress('nonexistent-plan'))
        .rejects.toThrow('Plan nonexistent-plan not found');
    });

    it('should validate step existence', async () => {
      const response = await framework.createStructuredPlan('Step validation test');
      const planId = response.structured_plan.id;
      
      await expect(framework.startStep(planId, 'nonexistent-step'))
        .rejects.toThrow('Step nonexistent-step not found');
    });

    it('should maintain data integrity on errors', async () => {
      const response = await framework.createStructuredPlan('Integrity test');
      const planId = response.structured_plan.id;
      
      // Try to cause an error
      try {
        await framework.startStep(planId, 'invalid-step-id');
      } catch (error) {
        // Plan should still be accessible and unchanged
        const progress = await framework.getProgress(planId);
        expect(progress.plan_id).toBe(planId);
        expect(progress.progress_report.completedSteps).toBe(0);
      }
    });
  });

  describe('Message generation quality', () => {
    it('should generate appropriate preamble messages', async () => {
      const testCases = [
        'Create user authentication system',
        'Fix database connection issue',
        'Refactor payment processing code'
      ];

      for (const task of testCases) {
        const response = await framework.createStructuredPlan(task);
        const preamble = response.preamble_message;
        
        expect(preamble).toBeDefined();
        expect(typeof preamble).toBe('string');
        expect(preamble.length).toBeGreaterThan(0);
        expect(preamble.toLowerCase()).toContain('i\'ll');
      }
    });

    it('should generate contextual progress updates', async () => {
      const response = await framework.createStructuredPlan('Progress update test');
      const planId = response.structured_plan.id;
      const stepId = response.structured_plan.steps[0].id;

      // Start and complete a step
      await framework.startStep(planId, stepId);
      await framework.completeStep(planId, stepId);

      const progress = await framework.getProgress(planId);
      
      expect(progress.progress_report.message).toContain('1/');
      expect(progress.progress_report.completedSteps).toBe(1);
    });
  });
});