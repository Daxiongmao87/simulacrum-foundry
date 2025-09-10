/**
 * SubAgent Architecture - SubAgent Executor Tests  
 * Test suite derived from Phase 2 specification requirements
 */

import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { SubAgentExecutor } from '../../../scripts/core/subagent/subagent-executor.js';

describe('SubAgentExecutor', () => {
  let executor;
  let mockToolRegistry;
  let mockAiClient;

  beforeEach(() => {
    mockToolRegistry = {
      getTool: jest.fn()
    };
    
    mockAiClient = {
      chat: jest.fn()
    };

    executor = new SubAgentExecutor(mockToolRegistry, mockAiClient);
  });

  describe('initializeScope - Req 1: SubAgent execution lifecycle', () => {
    it('should initialize scope with proper configuration validation', async () => {
      const config = {
        prompt: 'Test SubAgent prompt with {{variable}} placeholder',
        modelSettings: { model: 'gpt-3.5-turbo' },
        toolPermissions: ['Read', 'Write'],
        outputDefinitions: { result: { type: 'string' } },
        constraints: {
          timeoutMs: 60000,
          maxTurns: 10
        }
      };

      const contextState = { variables: { variable: 'test_value' } };
      const scope = await executor.initializeScope(config, contextState);

      expect(scope).toBeDefined();
      expect(scope.id).toMatch(/^scope_/);
      expect(scope.config.prompt).toBe(config.prompt);
      expect(scope.config.constraints.timeoutMs).toBe(60000);
      expect(scope.config.constraints.maxTurns).toBe(10);
      expect(scope.contextState.variables.get('variable')).toBe('test_value');
      expect(scope.status).toBe('INITIALIZED');
    });

    it('should apply default constraints when not provided', async () => {
      const config = {
        prompt: 'Test prompt',
        toolPermissions: [],
        outputDefinitions: {}
      };

      const scope = await executor.initializeScope(config);

      expect(scope.config.constraints.timeoutMs).toBe(900000); // 15 minutes default
      expect(scope.config.constraints.maxTurns).toBe(50);
      expect(scope.config.constraints.resourceLimits.maxMemoryMB).toBe(100);
      expect(scope.config.constraints.resourceLimits.maxCpuTimeMs).toBe(300000);
    });

    it('should validate required configuration fields', async () => {
      const invalidConfigs = [
        null,
        {},
        { toolPermissions: [] },
        { prompt: '', toolPermissions: [] },
        { prompt: 'test', toolPermissions: 'invalid' }
      ];

      for (const config of invalidConfigs) {
        await expect(executor.initializeScope(config)).rejects.toThrow();
      }
    });
  });

  describe('execute - Req 1: Complete execution lifecycle', () => {
    let scope;

    beforeEach(async () => {
      const config = {
        prompt: 'Execute test task',
        toolPermissions: ['Read'],
        outputDefinitions: { result: { type: 'string' } },
        constraints: {
          timeoutMs: 5000,
          maxTurns: 3,
          terminationConditions: []
        }
      };

      scope = await executor.initializeScope(config);
    });

    it('should execute complete lifecycle with turn counting', async () => {
      const result = await executor.execute(scope);

      expect(result).toBeDefined();
      expect(result.termination).toBeDefined();
      expect(result.termination.turnsExecuted).toBeGreaterThan(0);
      expect(result.termination.executionDuration).toBeGreaterThan(0);
      expect(result.emittedVariables).toBeInstanceOf(Map);
      expect(result.finalContext).toBeDefined();
      expect(scope.status).toBe('COMPLETED');
    });

    it('should respect max turns limit', async () => {
      scope.config.constraints.maxTurns = 1;
      
      const result = await executor.execute(scope);

      expect(result.termination.reason).toBe('MAX_TURNS');
      expect(result.termination.turnsExecuted).toBe(1);
    });

    it('should handle execution timeout', async () => {
      scope.config.constraints.timeoutMs = 1; // Very short timeout
      
      const result = await executor.execute(scope);

      expect(result.termination.reason).toBe('TIMEOUT');
      expect(result.termination.status).toBe('SUCCESS'); // Terminated gracefully
    });
  });

  describe('emitVariable - Req 4: Variable emission', () => {
    let scope;

    beforeEach(async () => {
      const config = {
        prompt: 'Variable emission test',
        toolPermissions: [],
        outputDefinitions: {
          test_var: { type: 'string', description: 'Test variable' }
        }
      };

      scope = await executor.initializeScope(config);
    });

    it('should emit variables with metadata', async () => {
      await executor.emitVariable(scope, 'test_var', 'test_value');

      expect(scope.emittedVariables.has('test_var')).toBe(true);
      const variable = scope.emittedVariables.get('test_var');
      expect(variable.value).toBe('test_value');
      expect(variable.timestamp).toBeInstanceOf(Date);
      expect(variable.turn).toBe(0); // Before execution starts
    });

    it('should update context state when emitting variables', async () => {
      await executor.emitVariable(scope, 'context_var', 'context_value');

      expect(scope.contextState.variables.get('context_var')).toBe('context_value');
    });

    it('should validate variable emission parameters', async () => {
      await expect(executor.emitVariable(null, 'test', 'value')).rejects.toThrow();
      await expect(executor.emitVariable(scope, '', 'value')).rejects.toThrow();
      await expect(executor.emitVariable(scope, null, 'value')).rejects.toThrow();
    });
  });

  describe('checkTermination - Req 5: Timeout and termination', () => {
    let scope;

    beforeEach(async () => {
      const config = {
        prompt: 'Termination test',
        toolPermissions: [],
        outputDefinitions: {},
        constraints: {
          timeoutMs: 1000,
          maxTurns: 5,
          terminationConditions: [],
          resourceLimits: {
            maxMemoryMB: 50,
            maxCpuTimeMs: 1000
          }
        }
      };

      scope = await executor.initializeScope(config);
    });

    it('should check timeout condition', async () => {
      scope.startExecution();
      // Simulate timeout by manually setting start time in the past
      scope.executionStartTime = Date.now() - 2000; // 2 seconds ago
      
      const termination = await executor.checkTermination(scope);
      
      expect(termination).toBeDefined();
      expect(termination.type).toBe('TIMEOUT');
    });

    it('should check max turns condition', async () => {
      scope.executionTurns = 6; // Exceed max turns
      
      const termination = await executor.checkTermination(scope);
      
      expect(termination).toBeDefined();
      expect(termination.type).toBe('MAX_TURNS');
    });

    it('should check resource limits', async () => {
      scope.resources.memoryUsage = 100; // Exceed memory limit
      
      const termination = await executor.checkTermination(scope);
      
      expect(termination).toBeDefined();
      expect(termination.type).toBe('ERROR');
      expect(termination.reason).toContain('Memory limit exceeded');
    });

    it('should return null when no termination conditions are met', async () => {
      scope.startExecution();
      
      const termination = await executor.checkTermination(scope);
      
      expect(termination).toBeNull();
    });
  });

  describe('Tool permission validation - Req 6: Compatibility with existing agents', () => {
    let scope;

    beforeEach(async () => {
      mockToolRegistry.getTool.mockImplementation((name) => {
        const tools = {
          'Read': { execute: jest.fn().mockResolvedValue('file content') },
          'Write': { execute: jest.fn().mockResolvedValue('write success') }
        };
        return tools[name] || null;
      });

      const config = {
        prompt: 'Tool permission test',
        toolPermissions: ['Read'], // Only Read allowed
        outputDefinitions: {}
      };

      scope = await executor.initializeScope(config);
    });

    it('should allow execution of permitted tools', async () => {
      const toolCalls = [{
        function: { name: 'Read', arguments: { file_path: '/test.txt' } }
      }];

      await expect(executor._processToolCalls(scope, toolCalls)).resolves.not.toThrow();
      expect(scope.contextState.variables.has('_tool_Read_result')).toBe(true);
    });

    it('should reject execution of non-permitted tools', async () => {
      const toolCalls = [{
        function: { name: 'Write', arguments: { file_path: '/test.txt' } }
      }];

      await expect(executor._processToolCalls(scope, toolCalls))
        .rejects.toThrow('Tool \'Write\' not permitted for this SubAgent');
    });
  });

  describe('cleanup - Req 7: Resource cleanup', () => {
    it('should properly cleanup resources and mark scope as completed', async () => {
      const config = {
        prompt: 'Cleanup test',
        toolPermissions: [],
        outputDefinitions: {}
      };

      const scope = await executor.initializeScope(config);
      const scopeId = scope.id;

      // Verify scope is tracked
      expect(executor.activeScopes.has(scopeId)).toBe(true);

      await executor.cleanup(scope);

      // Verify cleanup
      expect(executor.activeScopes.has(scopeId)).toBe(false);
      expect(scope.status).toBe('COMPLETED');
    });
  });

  describe('Performance requirements - Non-functional Req 1-4', () => {
    it('should complete initialization within timeout limits', async () => {
      const config = {
        prompt: 'Performance test',
        toolPermissions: [],
        outputDefinitions: {}
      };

      const startTime = Date.now();
      await executor.initializeScope(config);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50); // Should be very fast
    });

    it('should handle up to 10 concurrent scopes', async () => {
      const configs = Array.from({ length: 10 }, (_, i) => ({
        prompt: `Concurrent test ${i}`,
        toolPermissions: [],
        outputDefinitions: {},
        constraints: { timeoutMs: 1000, maxTurns: 1 }
      }));

      const scopes = await Promise.all(
        configs.map(config => executor.initializeScope(config))
      );

      expect(scopes.length).toBe(10);
      expect(executor.activeScopes.size).toBe(10);

      // Cleanup all scopes
      await Promise.all(scopes.map(scope => executor.cleanup(scope)));
    });

    it('should maintain memory isolation between scopes', async () => {
      const config1 = {
        prompt: 'Isolation test 1',
        toolPermissions: [],
        outputDefinitions: {}
      };

      const config2 = {
        prompt: 'Isolation test 2', 
        toolPermissions: [],
        outputDefinitions: {}
      };

      const scope1 = await executor.initializeScope(config1, { var1: 'value1' });
      const scope2 = await executor.initializeScope(config2, { var2: 'value2' });

      // Verify isolation
      expect(scope1.contextState.variables.has('var2')).toBe(false);
      expect(scope2.contextState.variables.has('var1')).toBe(false);
      expect(scope1.id).not.toBe(scope2.id);

      await executor.cleanup(scope1);
      await executor.cleanup(scope2);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid scope references gracefully', async () => {
      await expect(executor.emitVariable(null, 'test', 'value')).rejects.toThrow();
      await expect(executor.checkTermination(null)).rejects.toThrow();
      await expect(executor.cleanup(null)).resolves.not.toThrow();
    });

    it('should handle tool execution failures', async () => {
      mockToolRegistry.getTool.mockImplementation(() => ({
        execute: jest.fn().mockRejectedValue(new Error('Tool execution failed'))
      }));

      const config = {
        prompt: 'Error handling test',
        toolPermissions: ['FailingTool'],
        outputDefinitions: {}
      };

      const scope = await executor.initializeScope(config);
      const toolCalls = [{
        function: { name: 'FailingTool', arguments: {} }
      }];

      await expect(executor._processToolCalls(scope, toolCalls))
        .rejects.toThrow('Tool execution failed');
    });
  });
});