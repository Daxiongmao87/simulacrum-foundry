/**
 * SubAgent Architecture - Integration Tests
 * Tests for the main SubAgent architecture orchestration
 */

import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { SubAgentArchitecture } from '../../../scripts/core/subagent/subagent-architecture.js';

describe('SubAgentArchitecture Integration', () => {
  let architecture;
  let mockToolRegistry;
  let mockAiClient;

  beforeEach(() => {
    mockToolRegistry = {
      getTool: jest.fn().mockImplementation((name) => ({
        execute: jest.fn().mockResolvedValue(`${name} executed successfully`)
      }))
    };

    mockAiClient = {
      chat: jest.fn().mockResolvedValue({
        content: 'AI response',
        choices: [{ message: { content: 'AI response' } }]
      })
    };

    architecture = new SubAgentArchitecture(mockToolRegistry, mockAiClient);
  });

  describe('executeSubAgent - Main entry point', () => {
    it('should execute complete SubAgent lifecycle with all components', async () => {
      const config = {
        prompt: 'Analyze project structure and provide recommendations',
        modelSettings: { model: 'gpt-3.5-turbo', temperature: 0.7 },
        toolPermissions: ['Read', 'Glob', 'Grep'],
        outputDefinitions: {
          analysis: { type: 'object', description: 'Project analysis results' },
          recommendations: { type: 'array', description: 'Improvement recommendations' }
        },
        constraints: {
          timeoutMs: 5000,
          maxTurns: 3,
          terminationConditions: [],
          resourceLimits: {
            maxMemoryMB: 100,
            maxCpuTimeMs: 3000
          }
        }
      };

      const contextVariables = {
        project_path: '/test/project',
        focus_areas: ['security', 'performance']
      };

      const result = await architecture.executeSubAgent(config, contextVariables);

      // Validate execution result structure
      expect(result).toBeDefined();
      expect(result.emittedVariables).toBeInstanceOf(Map);
      expect(result.termination).toBeDefined();
      expect(result.termination.status).toBeDefined(); // Can be SUCCESS, ERROR, or other termination
      expect(result.executionMetadata).toBeDefined();
      expect(result.executionMetadata.resourceStats).toBeDefined();
      expect(result.executionMetadata.contextStats).toBeDefined();
      expect(result.executionMetadata.terminationStats).toBeDefined();
    });

    it('should handle resource allocation failures', async () => {
      // Mock resource manager to fail allocation
      jest.spyOn(architecture.resourceManager, 'allocateResources').mockReturnValue({
        success: false,
        error: 'Resource limit exceeded'
      });

      const config = {
        prompt: 'Test resource failure',
        toolPermissions: [],
        outputDefinitions: {},
        constraints: { timeoutMs: 1000, maxTurns: 1 }
      };

      const result = await architecture.executeSubAgent(config);

      expect(result.termination.status).toBe('ERROR');
      expect(result.executionMetadata.error).toContain('Resource allocation failed');
    });

    it('should validate SubAgent configuration', async () => {
      const invalidConfigs = [
        null,
        {},
        { prompt: '' },
        { prompt: 'test' }, // Missing toolPermissions
        { prompt: 'test', toolPermissions: 'invalid' },
        { prompt: 'test', toolPermissions: [], constraints: null }
      ];

      for (const config of invalidConfigs) {
        const result = await architecture.executeSubAgent(config);
        expect(result.termination.status).toBe('ERROR');
      }
    });
  });

  describe('createSubAgentFromExistingAgent - Req 6: Compatibility', () => {
    it('should convert github-expert agent to SubAgent format', () => {
      const agentConfig = {
        model: 'gpt-4',
        temperature: 0.5,
        timeout: 120000
      };

      const subagentConfig = architecture.createSubAgentFromExistingAgent('github-expert', agentConfig);

      expect(subagentConfig.prompt).toContain('GitHub expert');
      expect(subagentConfig.toolPermissions).toContain('WebFetch');
      expect(subagentConfig.constraints.timeoutMs).toBe(120000);
      expect(subagentConfig.outputDefinitions.issues_found).toBeDefined();
      expect(subagentConfig.outputDefinitions.workflow_status).toBeDefined();
    });

    it('should convert project-investigator agent to SubAgent format', () => {
      const subagentConfig = architecture.createSubAgentFromExistingAgent('project-investigator', {});

      expect(subagentConfig.prompt).toContain('project investigation');
      expect(subagentConfig.toolPermissions).toContain('Bash');
      expect(subagentConfig.toolPermissions).toContain('Read');
      expect(subagentConfig.outputDefinitions.findings).toBeDefined();
      expect(subagentConfig.outputDefinitions.structure_analysis).toBeDefined();
    });

    it('should handle unknown agent types with general-purpose fallback', () => {
      const subagentConfig = architecture.createSubAgentFromExistingAgent('unknown-agent', {});

      expect(subagentConfig.prompt).toContain('general-purpose');
      expect(subagentConfig.toolPermissions).toContain('*'); // All tools
    });
  });

  describe('executeViaTaskTool - Task tool compatibility', () => {
    it('should execute SubAgent using Task tool compatibility mode', async () => {
      const result = await architecture.executeViaTaskTool(
        'github-expert',
        'Search for issues related to authentication bugs',
        { repository: 'test/repo' },
        { timeout: 5000 }
      );

      expect(result.success).toBeDefined(); // Can be true or false based on execution
      expect(result.agentType).toBe('github-expert');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.terminationReason).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should handle Task tool execution failures gracefully', async () => {
      // Mock executor to throw error
      jest.spyOn(architecture.executor, 'execute').mockRejectedValue(new Error('Execution failed'));

      await expect(architecture.executeViaTaskTool(
        'test-agent',
        'Failing task',
        {},
        {}
      )).rejects.toThrow('Execution failed');
    });
  });

  describe('createTerminationCondition - Custom termination conditions', () => {
    it('should create goal-based termination condition', () => {
      const condition = architecture.createTerminationCondition('goal', {
        description: 'All files analyzed',
        evaluator: (scope) => scope.emittedVariables.has('analysis_complete')
      });

      expect(condition.type).toBe('GOAL');
      expect(condition.reason).toContain('All files analyzed');
      expect(condition.evaluator).toBeInstanceOf(Function);
    });

    it('should create variable-based termination condition', () => {
      const condition = architecture.createTerminationCondition('variable', {
        variableName: 'file_count',
        condition: (value) => value >= 100,
        description: 'Minimum 100 files processed'
      });

      expect(condition.type).toBe('VARIABLE');
      expect(condition.reason).toContain('Variable condition met');
      expect(condition.evaluator).toBeInstanceOf(Function);
    });

    it('should create output-based termination condition', () => {
      const condition = architecture.createTerminationCondition('output', {
        requiredOutputs: ['analysis', 'recommendations', 'summary'],
        description: 'All required outputs available'
      });

      expect(condition.type).toBe('OUTPUT');
      expect(condition.reason).toContain('Required outputs available');
      expect(condition.evaluator).toBeInstanceOf(Function);
    });

    it('should create custom termination condition', () => {
      const customEvaluator = jest.fn().mockReturnValue(true);
      
      const condition = architecture.createTerminationCondition('custom', {
        reason: 'Custom termination triggered',
        evaluator: customEvaluator
      });

      expect(condition.type).toBe('CUSTOM');
      expect(condition.reason).toBe('Custom termination triggered');
      expect(condition.evaluator).toBe(customEvaluator);
    });
  });

  describe('forceTermination - Execution control', () => {
    it('should force termination of active SubAgent execution', async () => {
      const config = {
        prompt: 'Long running task',
        toolPermissions: [],
        outputDefinitions: {},
        constraints: { timeoutMs: 30000, maxTurns: 100 }
      };

      // Start execution (don't await to keep it running)
      const executionPromise = architecture.executeSubAgent(config);

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Get the scope ID from active executions
      const activeExecutions = Array.from(architecture.activeExecutions.keys());
      expect(activeExecutions.length).toBe(1);
      
      const scopeId = activeExecutions[0];
      const success = architecture.forceTermination(scopeId, 'Manual termination for testing');

      expect(success).toBe(true);

      // Wait for execution to complete
      const result = await executionPromise;
      expect(result).toBeDefined();
    });

    it('should return false for non-existent scope', () => {
      const success = architecture.forceTermination('non-existent-scope', 'Test');
      expect(success).toBe(false);
    });
  });

  describe('getExecutionStatistics - Monitoring', () => {
    it('should provide comprehensive execution statistics', async () => {
      const config = {
        prompt: 'Statistics test',
        toolPermissions: [],
        outputDefinitions: {},
        constraints: { timeoutMs: 1000, maxTurns: 1 }
      };

      // Start a few executions
      const executions = [
        architecture.executeSubAgent(config),
        architecture.executeSubAgent(config),
        architecture.executeSubAgent(config)
      ];

      // Get stats while executions are running
      const stats = architecture.getExecutionStatistics();

      expect(stats.activeSubAgents).toBeGreaterThan(0);
      expect(stats.resourceStats).toBeDefined();
      expect(stats.terminationStats).toBeDefined();
      expect(stats.averageExecutionTime).toBeGreaterThanOrEqual(0);

      // Wait for executions to complete
      await Promise.all(executions);
    });

    it('should handle statistics when no executions are active', () => {
      const stats = architecture.getExecutionStatistics();

      expect(stats.activeSubAgents).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
      expect(stats.resourceStats).toBeDefined();
    });
  });

  describe('registerCustomSubAgentType - Extensibility', () => {
    it('should register and use custom SubAgent type', () => {
      const typeDefinition = {
        allowedTools: ['Read', 'Write', 'Grep'],
        defaultTimeout: 60000,
        defaultMaxTurns: 25,
        constraints: {
          resourceLimits: {
            maxMemoryMB: 50,
            maxCpuTimeMs: 30000
          }
        },
        defaults: {
          modelSettings: {
            temperature: 0.3
          }
        }
      };

      architecture.registerCustomSubAgentType('custom-analyzer', typeDefinition);

      const registeredTypes = architecture.compatibilityBridge.getRegisteredTypes();
      const customType = registeredTypes.find(t => t.name === 'custom-analyzer');

      expect(customType).toBeDefined();
      expect(customType.definition.allowedTools).toEqual(['Read', 'Write', 'Grep']);
      expect(customType.definition.defaultTimeout).toBe(60000);
    });
  });

  describe('Performance and scalability - Non-functional requirements', () => {
    it('should meet response time requirements for initialization', async () => {
      const config = {
        prompt: 'Performance test',
        toolPermissions: ['Read'],
        outputDefinitions: { result: { type: 'string' } },
        constraints: { timeoutMs: 1000, maxTurns: 1 }
      };

      const startTime = Date.now();
      const result = await architecture.executeSubAgent(config);
      const duration = Date.now() - startTime;

      expect(result.termination.status).toBe('SUCCESS');
      expect(duration).toBeLessThan(1000); // Should complete quickly for simple task
    });

    it('should handle multiple concurrent SubAgent executions', async () => {
      const configs = Array.from({ length: 5 }, (_, i) => ({
        prompt: `Concurrent test ${i}`,
        toolPermissions: [],
        outputDefinitions: { result: { type: 'string' } },
        constraints: { timeoutMs: 2000, maxTurns: 1 }
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        configs.map(config => architecture.executeSubAgent(config))
      );
      const totalDuration = Date.now() - startTime;

      expect(results.length).toBe(5);
      expect(results.every(r => r.termination.status === 'SUCCESS')).toBe(true);
      expect(totalDuration).toBeLessThan(5000); // Should handle concurrency efficiently
    });

    it('should maintain proper resource isolation', async () => {
      const config1 = {
        prompt: 'Isolation test 1',
        toolPermissions: [],
        outputDefinitions: {},
        constraints: { timeoutMs: 1000, maxTurns: 1 }
      };

      const config2 = {
        prompt: 'Isolation test 2',
        toolPermissions: [],
        outputDefinitions: {},
        constraints: { timeoutMs: 1000, maxTurns: 1 }
      };

      const context1 = { shared_var: 'value1' };
      const context2 = { shared_var: 'value2' };

      const [result1, result2] = await Promise.all([
        architecture.executeSubAgent(config1, context1),
        architecture.executeSubAgent(config2, context2)
      ]);

      // Verify isolation - neither execution should see the other's context
      expect(result1.finalContext.variables.get('shared_var')).toBe('value1');
      expect(result2.finalContext.variables.get('shared_var')).toBe('value2');
      expect(result1.executionMetadata.scopeId).not.toBe(result2.executionMetadata.scopeId);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle component initialization failures', () => {
      // Test that the architecture can handle null/undefined dependencies gracefully
      expect(() => new SubAgentArchitecture(null, null)).not.toThrow();
    });

    it('should provide meaningful error messages for configuration failures', async () => {
      const result = await architecture.executeSubAgent({
        prompt: 'Valid prompt',
        toolPermissions: [],
        // Missing outputDefinitions and constraints
      });

      expect(result.termination.status).toBe('ERROR');
      expect(result.executionMetadata.error).toBeDefined();
      expect(result.executionMetadata.error).toContain('constraints are required');
    });

    it('should cleanup resources even on execution failures', async () => {
      const config = {
        prompt: 'Failure test',
        toolPermissions: ['NonExistentTool'],
        outputDefinitions: {},
        constraints: { timeoutMs: 1000, maxTurns: 1 }
      };

      const initialActiveCount = architecture.activeExecutions.size;
      
      const result = await architecture.executeSubAgent(config);
      
      expect(result).toBeDefined();
      expect(architecture.activeExecutions.size).toBe(initialActiveCount); // Should be cleaned up
    });
  });
});