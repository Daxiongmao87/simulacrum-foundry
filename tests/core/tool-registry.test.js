/**
 * Tests for ToolRegistry
 */

import { ToolRegistry } from '../../scripts/core/tool-registry.js';
// eslint-disable-next-line no-unused-vars
import { toolRegistry } from '../../scripts/core/tool-registry.js';

describe('ToolRegistry - constructor', () => {
  it('should initialize with empty tools registry', () => {
    const registry = new ToolRegistry();
    const tools = registry.getAllTools();
    
    expect(tools.size).toBe(0);
    expect(tools).toBeInstanceOf(Map);
  });
});

describe('ToolRegistry - registerTool', () => {
  it('should register a new tool', () => {
    const registry = new ToolRegistry();
    const mockTool = { 
      name: 'mock_tool', 
      description: 'A mock tool', 
      schema: {},
      execute: async () => ({ success: true })
    };
    
    registry.registerTool(mockTool);
    
    expect(registry.getTool('mock_tool')).toBe(mockTool);
  });
});

describe('ToolRegistry - getTool', () => {
  it('should return a registered tool', () => {
    const registry = new ToolRegistry();
    const mockTool = { 
      name: 'test_tool', 
      description: 'A test tool', 
      schema: {},
      execute: async () => ({ success: true })
    };
    
    registry.registerTool(mockTool);
    
    expect(registry.getTool('test_tool')).toBe(mockTool);
  });

  it('should return null for unregistered tools', () => {
    const registry = new ToolRegistry();
    
    expect(registry.getTool('nonexistent_tool')).toBeNull();
  });
});

describe('ToolRegistry - getToolSchemas', () => {
  it('should return schemas for all registered tools (OpenAI-compatible shape)', () => {
    const registry = new ToolRegistry();
    const mockTool = {
      name: 'test_tool',
      description: 'A test tool',
      schema: {
        type: 'object',
        properties: {
          param1: { type: 'string' }
        }
      },
      execute: async () => ({ success: true })
    };
    
    registry.registerTool(mockTool);
    const schemas = registry.getToolSchemas();
    // OpenAI-compatible: { type:'function', function:{ name, description, parameters } }
    const spec = schemas.find(s => s?.function?.name === 'test_tool');
    expect(spec).toBeDefined();
    expect(spec.type).toBe('function');
    expect(spec.function.name).toBe('test_tool');
    expect(spec.function.description).toBe('A test tool');
    expect(spec.function.parameters).toEqual({
      type: 'object',
      properties: {
        param1: { type: 'string' }
      }
    });
  });

  it('should handle tools with getParameterSchema method (OpenAI-compatible shape)', () => {
    const registry = new ToolRegistry();
    const mockTool = {
      name: 'test_tool',
      description: 'A test tool',
      getParameterSchema: () => ({ type: 'object', properties: { id: { type: 'string' } } }),
      execute: async () => ({ success: true })
    };
    
    registry.registerTool(mockTool);
    const schemas = registry.getToolSchemas();
    const spec = schemas.find(s => s?.function?.name === 'test_tool');
    expect(spec).toBeDefined();
    expect(spec.type).toBe('function');
    expect(spec.function.parameters).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } }
    });
  });
});

describe('ToolRegistry - registerTool validation', () => {
  it('should throw error when registering null tool', () => {
    const registry = new ToolRegistry();
    expect(() => registry.registerTool(null)).toThrow('Tool instance is required for registration');
  });

  it('should throw error when registering tool without name', () => {
    const registry = new ToolRegistry();
    const invalidTool = { description: 'Missing name', execute: async () => ({}) };
    expect(() => registry.registerTool(invalidTool)).toThrow('Invalid tool structure: missing required fields');
  });

  it('should throw error when registering tool without execute method', () => {
    const registry = new ToolRegistry();
    const invalidTool = { name: 'invalid', description: 'Missing execute' };
    expect(() => registry.registerTool(invalidTool)).toThrow('Invalid tool structure: missing required fields');
  });

  it('should throw error when registering duplicate tool', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'duplicate', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool);
    expect(() => registry.registerTool(tool)).toThrow("Tool with name 'duplicate' already exists");
  });

  it('should throw error for unresolved dependencies', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'dependent', description: 'Test', execute: async () => ({}) };
    
    expect(() => registry.registerTool(tool, { dependencies: ['missing_tool'] }))
      .toThrow('Unresolved dependencies: missing_tool');
  });
});

describe('ToolRegistry - registration options', () => {
  it('should register tool with category', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'categorized', description: 'Test', execute: async () => ({}) };
    
    const result = registry.registerTool(tool, { category: 'test-category' });
    
    expect(result.success).toBe(true);
    expect(result.category).toBe('test-category');
  });

  it('should register tool with dependencies', () => {
    const registry = new ToolRegistry();
    const dependency = { name: 'dep1', description: 'Dependency', execute: async () => ({}) };
    const dependent = { name: 'dep2', description: 'Dependent', execute: async () => ({}) };
    
    registry.registerTool(dependency);
    const result = registry.registerTool(dependent, { dependencies: ['dep1'] });
    
    expect(result.dependencies).toBe(1);
  });

  it('should register tool with permissions', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'restricted', description: 'Test', execute: async () => ({}) };
    
    const result = registry.registerTool(tool, { permissions: ['gm'] });
    
    expect(result.permissions).toBe(1);
  });
});

describe('ToolRegistry - unregisterTool', () => {
  it('should unregister existing tool', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'removeme', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool);
    expect(registry.getTool('removeme')).toBeDefined();
    
    const result = registry.unregisterTool('removeme');
    expect(result).toBe(true);
    expect(registry.getTool('removeme')).toBeNull();
  });

  it('should throw error when unregistering nonexistent tool', () => {
    const registry = new ToolRegistry();
    expect(() => registry.unregisterTool('nonexistent')).toThrow("Tool 'nonexistent' not found");
  });

  it('should throw error when unregistering tool with dependents', () => {
    const registry = new ToolRegistry();
    const dependency = { name: 'dep1', description: 'Dependency', execute: async () => ({}) };
    const dependent = { name: 'dep2', description: 'Dependent', execute: async () => ({}) };
    
    registry.registerTool(dependency);
    registry.registerTool(dependent, { dependencies: ['dep1'] });
    
    expect(() => registry.unregisterTool('dep1'))
      .toThrow("Cannot unregister tool 'dep1' - it has 1 dependent tools");
  });
});

describe('ToolRegistry - getToolInfo', () => {
  it('should return tool registration info', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'info_tool', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool, { category: 'test' });
    const info = registry.getToolInfo('info_tool');
    
    expect(info).toBeDefined();
    expect(info.tool).toBe(tool);
    expect(info.category).toBe('test');
    expect(info.enabled).toBe(true);
    expect(info.executionCount).toBe(0);
  });

  it('should return null for nonexistent tool', () => {
    const registry = new ToolRegistry();
    expect(registry.getToolInfo('nonexistent')).toBeNull();
  });
});

describe('ToolRegistry - listTools', () => {
  let registry;
  
  beforeEach(() => {
    registry = new ToolRegistry();
    
    const tool1 = { name: 'tool1', description: 'First tool', execute: async () => ({}) };
    const tool2 = { name: 'tool2', description: 'Second tool', execute: async () => ({}) };
    const tool3 = { name: 'tool3', description: 'Third tool', execute: async () => ({}) };
    
    registry.registerTool(tool1, { category: 'cat1', tags: ['tag1'] });
    registry.registerTool(tool2, { category: 'cat2', tags: ['tag2'] });
    registry.registerTool(tool3, { category: 'cat1', tags: ['tag1', 'tag3'] });
  });

  it('should list all tools', () => {
    const tools = registry.listTools();
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name)).toEqual(['tool1', 'tool2', 'tool3']);
  });

  it('should filter by category', () => {
    const tools = registry.listTools({ category: 'cat1' });
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(['tool1', 'tool3']);
  });

  it('should filter by tags', () => {
    const tools = registry.listTools({ tags: ['tag1'] });
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(['tool1', 'tool3']);
  });

  it('should sort by name', () => {
    const tools = registry.listTools({ sortBy: 'name' });
    expect(tools.map(t => t.name)).toEqual(['tool1', 'tool2', 'tool3']);
  });

  it('should sort by category', () => {
    const tools = registry.listTools({ sortBy: 'category' });
    expect(tools.map(t => t.category)).toEqual(['cat1', 'cat1', 'cat2']);
  });
});

describe('ToolRegistry - listCategories', () => {
  it('should list all categories', () => {
    const registry = new ToolRegistry();
    const tool1 = { name: 'tool1', description: 'Test', execute: async () => ({}) };
    const tool2 = { name: 'tool2', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool1, { category: 'cat1' });
    registry.registerTool(tool2, { category: 'cat2' });
    
    const categories = registry.listCategories();
    expect(categories).toHaveLength(2);
    expect(categories.map(c => c.name)).toEqual(['cat1', 'cat2']);
    expect(categories.find(c => c.name === 'cat1').toolCount).toBe(1);
  });
});

describe('ToolRegistry - setToolEnabled', () => {
  it('should enable/disable tools', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'toggleable', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool);
    expect(registry.getToolInfo('toggleable').enabled).toBe(true);
    
    registry.setToolEnabled('toggleable', false);
    expect(registry.getToolInfo('toggleable').enabled).toBe(false);
    
    registry.setToolEnabled('toggleable', true);
    expect(registry.getToolInfo('toggleable').enabled).toBe(true);
  });

  it('should throw error when disabling nonexistent tool', () => {
    const registry = new ToolRegistry();
    expect(() => registry.setToolEnabled('nonexistent', false))
      .toThrow("Tool 'nonexistent' not found");
  });

  it('should throw error when disabling required tool', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'required', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool, { required: true });
    
    expect(() => registry.setToolEnabled('required', false))
      .toThrow("Cannot disable required tool 'required'");
  });
});

describe('ToolRegistry - getStats', () => {
  it('should return registry statistics', () => {
    const registry = new ToolRegistry();
    const tool1 = { name: 'tool1', description: 'Test', execute: async () => ({}) };
    const tool2 = { name: 'tool2', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool1, { category: 'cat1' });
    registry.registerTool(tool2, { category: 'cat2' });
    registry.setToolEnabled('tool2', false);
    
    const stats = registry.getStats();
    
    expect(stats.total).toBe(2);
    expect(stats.enabled).toBe(1);
    expect(stats.disabled).toBe(1);
    expect(stats.categories).toBe(2);
    expect(stats.totalExecutions).toBe(0);
  });
});

describe('ToolRegistry - executeTool', () => {
  // Mock game globals for permission testing
  beforeEach(() => {
    global.game = { user: { isGM: true } };
  });

  it('should execute tool successfully', async () => {
    const registry = new ToolRegistry();
    const tool = { 
      name: 'executable', 
      description: 'Test', 
      execute: jest.fn(async () => ({ success: true, result: 'done' }))
    };
    
    registry.registerTool(tool);
    const result = await registry.executeTool('executable', { param: 'value' });
    
    expect(result.success).toBe(true);
    expect(result.tool).toBe('executable');
    expect(result.result).toEqual({ success: true, result: 'done' });
    expect(tool.execute).toHaveBeenCalledWith({ param: 'value' });
  });

  it('should throw error for nonexistent tool', async () => {
    const registry = new ToolRegistry();
    
    await expect(registry.executeTool('nonexistent'))
      .rejects.toThrow("Tool 'nonexistent' not found");
  });

  it('should update execution stats on success', async () => {
    const registry = new ToolRegistry();
    const tool = { name: 'stats', description: 'Test', execute: async () => ({ success: true }) };
    
    registry.registerTool(tool);
    
    const beforeStats = registry.getToolInfo('stats');
    expect(beforeStats.executionCount).toBe(0);
    expect(beforeStats.successCount).toBe(0);
    
    await registry.executeTool('stats');
    
    const afterStats = registry.getToolInfo('stats');
    expect(afterStats.executionCount).toBe(1);
    expect(afterStats.successCount).toBe(1);
    expect(afterStats.lastExecution).toBeInstanceOf(Date);
  });

  it('should update failure stats on error', async () => {
    const registry = new ToolRegistry();
    const tool = { 
      name: 'failing', 
      description: 'Test', 
      execute: async () => { throw new Error('Tool failed'); }
    };
    
    registry.registerTool(tool);
    
    await expect(registry.executeTool('failing')).rejects.toThrow('failing execution failed');
    
    const stats = registry.getToolInfo('failing');
    expect(stats.executionCount).toBe(1);
    expect(stats.failureCount).toBe(1);
  });
});

describe('ToolRegistry - validateToolExecution', () => {
  beforeEach(() => {
    global.game = { user: { isGM: false } };
  });

  it('should validate enabled tool', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'valid', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool);
    const result = registry.validateToolExecution('valid');
    
    expect(result.isValid).toBe(true);
  });

  it('should fail validation for nonexistent tool', () => {
    const registry = new ToolRegistry();
    const result = registry.validateToolExecution('nonexistent');
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      field: 'tool',
      message: 'Tool not found'
    }));
  });

  it('should fail validation for disabled tool', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'disabled', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool);
    registry.setToolEnabled('disabled', false);
    
    const result = registry.validateToolExecution('disabled');
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      field: 'tool',
      message: 'Tool is disabled'
    }));
  });

  it('should validate tool with gm permission', () => {
    global.game = { user: { isGM: false } };
    
    const registry = new ToolRegistry();
    const tool = { name: 'restricted', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(tool, { permissions: ['gm'] });
    const result = registry.validateToolExecution('restricted');
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      field: 'permissions',
      message: "Tool 'restricted' requires GM permissions"
    }));
  });
});

describe('ToolRegistry - executeSequence', () => {
  beforeEach(() => {
    global.game = { user: { isGM: true } };
  });

  it('should execute tools in sequence', async () => {
    const registry = new ToolRegistry();
    const tool1 = { name: 'seq1', description: 'Test', execute: jest.fn(async () => ({ success: true, result: 'first' })) };
    const tool2 = { name: 'seq2', description: 'Test', execute: jest.fn(async () => ({ success: true, result: 'second' })) };
    
    registry.registerTool(tool1);
    registry.registerTool(tool2);
    
    const tasks = [
      { tool: 'seq1', context: { data: '1' } },
      { tool: 'seq2', context: { data: '2' } }
    ];
    
    const results = await registry.executeSequence(tasks);
    
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(tool1.execute).toHaveBeenCalledWith({ data: '1' });
    expect(tool2.execute).toHaveBeenCalledWith({ data: '2' });
  });

  it('should handle rollback on error when rollbackOnError is true', async () => {
    const registry = new ToolRegistry();
    const tool1 = { 
      name: 'first', 
      description: 'Test', 
      execute: jest.fn(async () => ({ success: true }))
    };
    const tool2 = { 
      name: 'failing', 
      description: 'Test', 
      execute: jest.fn(async () => { throw new Error('Tool failed'); })
    };
    
    registry.registerTool(tool1);
    registry.registerTool(tool2);
    
    const tasks = [
      { tool: 'first', context: {} },
      { tool: 'failing', context: {} }
    ];
    
    await expect(registry.executeSequence(tasks, { rollbackOnError: true }))
      .rejects.toThrow('failing execution failed');
      
    expect(tool1.execute).toHaveBeenCalled();
    expect(tool2.execute).toHaveBeenCalled();
  });
});

describe('ToolRegistry - hooks', () => {
  it('should add and trigger hooks', () => {
    const registry = new ToolRegistry();
    const callback = jest.fn();
    
    registry.addHook('test:hook', callback);
    registry._emitHook('test:hook', { data: 'test' });
    
    expect(callback).toHaveBeenCalledWith({ data: 'test' });
  });

  it('should remove hooks', () => {
    const registry = new ToolRegistry();
    const callback = jest.fn();
    
    registry.addHook('test:hook', callback);
    registry.removeHook('test:hook', callback);
    registry._emitHook('test:hook', { data: 'test' });
    
    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle hook errors gracefully', () => {
    const registry = new ToolRegistry();
    const failingCallback = () => { throw new Error('Hook failed'); };
    
    registry.addHook('test:hook', failingCallback);
    
    expect(() => registry._emitHook('test:hook', {})).not.toThrow();
  });

  it('should register tool hooks during registration', () => {
    const registry = new ToolRegistry();
    const registerHooks = jest.fn();
    const tool = { 
      name: 'hooked', 
      description: 'Test', 
      execute: async () => ({}),
      registerHooks
    };
    
    registry.registerTool(tool);
    
    expect(registerHooks).toHaveBeenCalledWith(registry);
  });
});

describe('ToolRegistry - helper methods', () => {
  it('should generate unique execution IDs', () => {
    const registry = new ToolRegistry();
    const id1 = registry._generateExecutionId();
    const id2 = registry._generateExecutionId();
    
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it('should handle dependency validation', () => {
    const registry = new ToolRegistry();
    const dep = { name: 'dependency', description: 'Dep', execute: async () => ({}) };
    const tool = { name: 'dependent', description: 'Test', execute: async () => ({}) };
    
    registry.registerTool(dep);
    registry.registerTool(tool, { dependencies: ['dependency'] });
    
    // Should not throw for valid dependencies
    expect(() => registry._validateDependencies('dependent')).not.toThrow();
    
    // Disable dependency and test
    registry.setToolEnabled('dependency', false);
    expect(() => registry._validateDependencies('dependent'))
      .toThrow('Missing or disabled dependency: dependency');
  });
});

describe('ToolRegistry - sorting functionality', () => {
  let registry;
  
  beforeEach(() => {
    registry = new ToolRegistry();
    const tool1 = { name: 'zeta', description: 'Last', execute: async () => ({}) };
    const tool2 = { name: 'alpha', description: 'First', execute: async () => ({}) };
    
    registry.registerTool(tool1, { category: 'z-cat' });
    registry.registerTool(tool2, { category: 'a-cat' });
    
    // Execute tool1 to give it execution stats
    registry.getToolInfo('zeta').executionCount = 5;
    registry.getToolInfo('alpha').executionCount = 3;
  });

  it('should sort by execution count', () => {
    const tools = registry.listTools({ sortBy: 'executionCount' });
    expect(tools.map(t => t.name)).toEqual(['zeta', 'alpha']);
  });

  it('should sort by created date', () => {
    const tools = registry.listTools({ sortBy: 'created' });
    // Both created at same time, should maintain order
    expect(tools).toHaveLength(2);
  });

  it('should default to name sorting for unknown sort field', () => {
    const tools = registry.listTools({ sortBy: 'unknown' });
    expect(tools.map(t => t.name)).toEqual(['alpha', 'zeta']);
  });
});
