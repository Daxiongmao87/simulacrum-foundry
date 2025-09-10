/**
 * Enhanced Planning Framework - Planning Engine Tests
 * Test suite derived from Phase 1 specification requirements
 */

import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { PlanningEngine } from '../../../scripts/core/planning/planning-engine.js';

describe('PlanningEngine', () => {
  let planningEngine;

  beforeEach(() => {
    planningEngine = new PlanningEngine();
  });

  describe('createPlan - Req 1: Structured task decomposition', () => {
    it('should create a plan with hierarchical step organization', async () => {
      const taskDescription = 'Implement user authentication feature';
      const result = await planningEngine.createPlan(taskDescription);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^plan_/);
      expect(result.steps).toBeInstanceOf(Array);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.context.originalTask).toBe(taskDescription);
    });

    it('should generate steps with proper structure', async () => {
      const taskDescription = 'Add user registration functionality';
      const result = await planningEngine.createPlan(taskDescription);

      result.steps.forEach((step, index) => {
        expect(step).toHaveProperty('id');
        expect(step).toHaveProperty('content');
        expect(step).toHaveProperty('activeForm');
        expect(step).toHaveProperty('status', 'pending');
        expect(step).toHaveProperty('dependencies');
        expect(step).toHaveProperty('metadata');
        expect(step.metadata.order).toBe(index + 1);
      });
    });

    it('should create feature steps for feature requests', async () => {
      const taskDescription = 'Create new dashboard component';
      const result = await planningEngine.createPlan(taskDescription);

      expect(result.steps.length).toBe(5); // Feature pattern has 5 steps
      expect(result.steps[0].content).toContain('requirements');
      expect(result.steps[1].content).toContain('architecture');
      expect(result.steps[2].content).toContain('MVP');
    });

    it('should create bug fix steps for bug reports', async () => {
      const taskDescription = 'Fix authentication login issue';
      const result = await planningEngine.createPlan(taskDescription);

      expect(result.steps.length).toBe(4); // Bug fix pattern has 4 steps
      expect(result.steps[0].content.toLowerCase()).toContain('investigate');
      expect(result.steps[1].content.toLowerCase()).toContain('root cause');
      expect(result.steps[2].content.toLowerCase()).toContain('fix');
      expect(result.steps[3].content.toLowerCase()).toContain('verify');
    });

    it('should validate input constraints', async () => {
      // Test empty description
      await expect(planningEngine.createPlan('')).rejects.toThrow('Task description is required');
      
      // Test too long description
      const longDescription = 'a'.repeat(2001);
      await expect(planningEngine.createPlan(longDescription)).rejects.toThrow('exceeds maximum length');
    });
  });

  describe('Status tracking - Req 2: Formal status tracking', () => {
    let planId;
    let stepId;

    beforeEach(async () => {
      const plan = await planningEngine.createPlan('Test task for status tracking');
      planId = plan.id;
      stepId = plan.steps[0].id;
    });

    it('should start step with proper dependency validation', async () => {
      const result = await planningEngine.startStep(planId, stepId);
      
      expect(result.steps[0].status).toBe('in_progress');
      expect(result.modified).toBeInstanceOf(Date);
    });

    it('should enforce only one in_progress step', async () => {
      const firstResult = await planningEngine.startStep(planId, stepId);
      
      // Try to start another step
      const secondStepId = firstResult.steps[1]?.id;
      if (secondStepId) {
        await planningEngine.startStep(planId, secondStepId);
        const updatedPlan = planningEngine.activePlans.get(planId);
        
        // First step should be reset to pending
        expect(updatedPlan.steps[0].status).toBe('pending');
        expect(updatedPlan.steps[1].status).toBe('in_progress');
      }
    });

    it('should complete step successfully', async () => {
      await planningEngine.startStep(planId, stepId);
      const result = await planningEngine.completeStep(planId, stepId);
      
      expect(result.steps[0].status).toBe('completed');
    });

    it('should mark plan as completed when all steps are done', async () => {
      const plan = planningEngine.activePlans.get(planId);
      
      // Complete all steps
      for (const step of plan.steps) {
        await planningEngine.startStep(planId, step.id);
        await planningEngine.completeStep(planId, step.id);
      }
      
      const finalPlan = planningEngine.activePlans.get(planId);
      expect(finalPlan.status).toBe('completed');
    });
  });

  describe('updatePlan - Req 6: Plan modification support', () => {
    it('should update plan with new steps', async () => {
      const plan = await planningEngine.createPlan('Analyze data structures');
      const planId = plan.id;
      const originalStepCount = plan.steps.length;
      
      const updates = {
        steps: [
          ...plan.steps,
          {
            id: 'new_step_' + Date.now(),
            content: 'Additional step',
            activeForm: 'Adding additional step',
            status: 'pending',
            dependencies: [],
            metadata: { order: originalStepCount + 1, category: 'additional' }
          }
        ]
      };

      const result = await planningEngine.updatePlan(planId, updates);
      
      expect(result.steps.length).toBe(originalStepCount + 1);
      expect(result.modified).toBeInstanceOf(Date);
    });

    it('should preserve context when updating', async () => {
      const plan = await planningEngine.createPlan('Test task');
      const planId = plan.id;
      
      const updates = {
        context: { newProperty: 'test value' }
      };

      const result = await planningEngine.updatePlan(planId, updates);
      
      expect(result.context.originalTask).toBe('Test task');
      expect(result.context.newProperty).toBe('test value');
    });
  });

  describe('getProgress - Progress tracking', () => {
    it('should return accurate progress information', async () => {
      const plan = await planningEngine.createPlan('Progress test task');
      const planId = plan.id;
      
      // Complete first step
      await planningEngine.startStep(planId, plan.steps[0].id);
      await planningEngine.completeStep(planId, plan.steps[0].id);
      
      const progress = await planningEngine.getProgress(planId);
      
      expect(progress.completedSteps).toBe(1);
      expect(progress.totalSteps).toBe(plan.steps.length);
      expect(progress.message).toContain('1/' + plan.steps.length);
    });
  });

  describe('generatePreamble - User communication', () => {
    it('should generate concise preamble messages', () => {
      const plan = {
        steps: [
          {
            id: 'step1',
            content: 'Analyze user requirements and create detailed specification',
            status: 'pending'
          }
        ]
      };

      const preamble = planningEngine.generatePreamble(plan);
      
      expect(preamble).toBeDefined();
      expect(typeof preamble).toBe('string');
      expect(preamble.split(' ').length).toBeLessThanOrEqual(12);
      expect(preamble.toLowerCase()).toContain('i\'ll');
    });

    it('should handle empty plans gracefully', () => {
      const emptyPlan = { steps: [] };
      const preamble = planningEngine.generatePreamble(emptyPlan);
      
      expect(preamble).toBeDefined();
      expect(preamble).toBe('Planning task approach');
    });
  });

  describe('Performance requirements - Non-functional Req 1-3', () => {
    it('should create plan within performance limits', async () => {
      const startTime = Date.now();
      
      await planningEngine.createPlan('Performance test task');
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle plans with up to 50 steps', async () => {
      // Create a complex task that generates many steps
      const complexTask = 'Implement complete e-commerce system with user management, product catalog, shopping cart, payment processing, order management, and admin dashboard';
      
      const startTime = Date.now();
      const plan = await planningEngine.createPlan(complexTask);
      const duration = Date.now() - startTime;
      
      expect(plan.steps.length).toBeLessThanOrEqual(50);
      expect(duration).toBeLessThan(100); // Performance should not degrade
    });
  });

  describe('Error handling', () => {
    it('should handle invalid plan IDs gracefully', async () => {
      await expect(planningEngine.updatePlan('invalid-id', {}))
        .rejects.toThrow('Plan invalid-id not found');
      
      await expect(planningEngine.startStep('invalid-id', 'step1'))
        .rejects.toThrow('Plan invalid-id not found');
    });

    it('should validate step dependencies', async () => {
      const plan = await planningEngine.createPlan('Dependency test');
      const planId = plan.id;
      
      // Create a step with unmet dependencies
      if (plan.steps.length > 1 && plan.steps[1].dependencies.length > 0) {
        await expect(planningEngine.startStep(planId, plan.steps[1].id))
          .rejects.toThrow('unmet dependencies');
      }
    });
  });
});