/**
 * Tool Registry - Manages and registers all available tools
 * Handles tool registration, discovery, and execution
 */

import { ToolError, NotFoundError, ValidationError } from '../utils/errors.js';
import { ValidationResult } from '../utils/validation.js';
import { createLogger } from '../utils/logger.js';

/**
 * Tool Registry - Manages all available tools and their registration
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.categories = new Map();
    this.dependencies = new Map();
    this.executionQueue = [];
    this.hooks = new Map();
    this.permissions = new Map();
    this.logger = createLogger('ToolRegistry');
  }

  /**
   * Register a new tool in the registry
   * @param {BaseTool} tool - Tool instance to register
   * @param {object} options - Registration options
   * @returns {object} - Registration result
   */
  registerTool(tool, options = {}) {
    this._validateToolForRegistration(tool, options);
    const registration = this._createRegistration(tool, options);
    this._completeRegistration(tool, registration, options);
    
    return {
      success: true,
      tool: tool.name,
      category: options.category || 'general',
      dependencies: (options.dependencies || []).length,
      permissions: (options.permissions || []).length
    };
  }

  _validateToolForRegistration(tool, options) {
    if (!tool) {
      throw new ToolError('Tool instance is required for registration');
    }

    // Validate tool structure
    if (!tool.name || !tool.description || !tool.execute) {
      throw new ToolError('Invalid tool structure: missing required fields');
    }

    // Check for duplicate registration
    if (this.tools.has(tool.name)) {
      throw new ToolError(`Tool with name '${tool.name}' already exists`);
    }

    // Validate dependencies
    const dependencies = options.dependencies || [];
    const unresolvedDeps = dependencies.filter(dep => 
      !this.tools.has(dep) && !this.dependencies.has(dep)
    );

    if (unresolvedDeps.length > 0) {
      throw new ToolError(`Unresolved dependencies: ${unresolvedDeps.join(', ')}`);
    }
  }

  _createRegistration(tool, options) {
    const {
      category = 'general',
      required = false,
      dependencies = [],
      permissions = [],
      version = '1.0.0',
      description = '',
      tags = []
    } = options;

    return {
      tool,
      category,
      version,
      description,
      created: new Date(),
      updated: new Date(),
      dependencies,
      permissions,
      tags,
      required,
      enabled: true,
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      lastExecution: null
    };
  }

  _completeRegistration(tool, registration, options) {
    const { category = 'general', dependencies = [], permissions = [] } = options;
    
    this.tools.set(tool.name, registration);
    this._addToCategory(category, tool.name);
    this._registerDependencies(tool.name, dependencies);
    this._registerPermissions(tool.name, permissions);
    this._registerToolHooks(tool);
    this._emitHook('tool:registered', { tool, registration });
  }

  /**
   * Unregister a tool from the registry
   * @param {string} name - Tool name to unregister
   * @returns {boolean} - Success status
   */
  unregisterTool(name) {
    if (!this.tools.has(name)) {
      throw new NotFoundError(`Tool '${name}' not found`, 'tool', name);
    }

    const tool = this.tools.get(name);
    
    // Check for dependent tools
    const dependents = this._getDependentTools(name);
    if (dependents.length > 0) {
      throw new ToolError(
        `Cannot unregister tool '${name}' - it has ${dependents.length} dependent tools`
      );
    }

    // Remove from category
    this._removeFromCategory(tool.category, name);
    
    // Remove dependencies
    this._unregisterDependencies(name);
    
    // Remove permissions
    this.permissions.delete(name);
    
    // Remove tool
    this.tools.delete(name);
    
    // Emit unregistration hook
    this._emitHook('tool:unregistered', { name });

    return true;
  }

  /**
   * Get a tool by name
   * @param {string} name - Tool name
   * @returns {BaseTool|null}
   */
  getTool(name) {
    const registration = this.tools.get(name);
    return registration ? registration.tool : null;
  }

  /**
   * Get tool registration information
   * @param {string} name - Tool name
   * @returns {object|null}
   */
  getToolInfo(name) {
    return this.tools.get(name) || null;
  }

  /**
   * Get all registered tools (Map interface for compatibility)
   * @returns {Map} - Map of tool names to registrations
   */
  getAllTools() {
    return this.tools;
  }

  /**
   * Get schemas for all registered tools
   * @returns {Array<Object>} Array of tool schemas
   */
  getToolSchemas() {
    // Return OpenAI-compatible function-calling tool specs to enable tool_calls
    // [{ type: 'function', function: { name, description, parameters } }]
    return Array.from(this.tools.values()).map(registration => {
      const tool = registration.tool;
      const raw = tool.schema || (typeof tool.getParameterSchema === 'function' ? tool.getParameterSchema() : null) || {};
      let parameters = raw;
      if (!raw || typeof raw !== 'object' || raw.type !== 'object') {
        const props = (raw && typeof raw === 'object' && raw.properties && typeof raw.properties === 'object') ? raw.properties : {};
        parameters = { type: 'object', properties: props };
      }
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters
        }
      };
    });
  }

  /**
   * List all registered tools
   * @param {object} options - Filter options
   * @returns {Array<Object>}
   */
  listTools(options = {}) {
    const { 
      category = null, 
      enabled = true, 
      tags = [], 
      sortBy = 'name'
    } = options;

    let tools = Array.from(this.tools.values());

    if (category) {
      tools = tools.filter(tool => tool.category === category);
    }

    if (enabled !== null) {
      tools = tools.filter(tool => tool.enabled === enabled);
    }

    if (tags.length > 0) {
      tools = tools.filter(tool => 
        tags.some(tag => tool.tags.includes(tag))
      );
    }

    // Sort tools by specified field
    tools.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.tool.name.localeCompare(b.tool.name);
        case 'category':
          return a.category.localeCompare(b.category);
        case 'created':
          return a.created - b.created;
        case 'executionCount':
          return b.executionCount - a.executionCount;
        default:
          return a.tool.name.localeCompare(b.tool.name);
      }
    });

    return tools.map(tool => ({
      name: tool.tool.name,
      description: tool.tool.description,
      category: tool.category,
      version: tool.version,
      dependencies: tool.dependencies,
      enabled: tool.enabled,
      executionCount: tool.executionCount,
      lastExecution: tool.lastExecution,
      tags: tool.tags
    }));
  }

  /**
   * List available categories
   * @returns {Array<string>}
   */
  listCategories() {
    return Array.from(this.categories.keys())
      .sort()
      .map(category => ({
        name: category,
        toolCount: this.categories.get(category).length
      }));
  }

  /**
   * Execute a tool synchronously
   * @param {string} name - Tool name
   * @param {object} context - Execution context
   * @returns {Promise<object>}
   */
  async executeTool(name, context = {}) {
    console.log(`[Simulacrum:ToolExecution] Starting execution of tool '${name}'`);
    console.log(`[Simulacrum:ToolExecution] Context:`, context);
    
    const tool = this.getTool(name);
    if (!tool) {
      console.error(`[Simulacrum:ToolExecution] Tool '${name}' not found`);
      throw new NotFoundError(`Tool '${name}' not found`, 'tool', name);
    }

    const registration = this.tools.get(name);
    const executionId = this._generateExecutionId();

    try {
      console.log(`[Simulacrum:ToolExecution] Validating permissions for '${name}'`);
      this._validatePermissions(name, context);
      
      console.log(`[Simulacrum:ToolExecution] Validating dependencies for '${name}'`);
      this._validateDependencies(name);
      
      // Update execution stats
      registration.executionCount++;
      registration.lastExecution = new Date();

      // Emit pre-execution hook
      this._emitHook('tool:beforeExecute', { name, context, executionId });

      console.log(`[Simulacrum:ToolExecution] Executing tool '${name}' with ID ${executionId}`);
      // Execute tool
      const result = await tool.execute(context);

      // Update success stats
      registration.successCount++;
      
      console.log(`[Simulacrum:ToolExecution] Tool '${name}' executed successfully`);
      console.log(`[Simulacrum:ToolExecution] Result:`, result);

      // Emit post-execution hook
      this._emitHook('tool:afterExecute', { name, context, executionId, result });

      return {
        success: true,
        tool: name,
        executionId,
        result,
        duration: Date.now() - registration.lastExecution.getTime()
      };
    } catch (error) {
      // Update failure stats
      registration.failureCount++;
      
      // Tool execution errors should be handled by the agentic loop, not logged to console

      // Emit error hook
      this._emitHook('tool:executeError', { name, context, executionId, error });

      throw new ToolError(`${tool.name} execution failed: ${error.message}`, name, {
        executionId,
        context,
        cause: error
      });
    }
  }

  /**
   * Execute multiple tools in sequence
   * @param {Array<object>} tasks - Array of {tool, context} objects
   * @param {object} options - Execution options
   * @returns {Promise<Array<object>>}
   */
  async executeSequence(tasks, options = {}) {
    const { rollbackOnError = true, timeout = 30000 } = options;
    const results = [];
    const executed = [];
    const startTime = Date.now();

    try {
      for (const task of tasks) {
        const { tool: toolName, context } = task;
        
        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new ToolError('Tool sequence execution timed out');
        }

        const result = await this.executeTool(toolName, context);
        results.push(result);
        executed.push({ tool: toolName, result });

        // Stop on first error if rollback enabled
        if (!result.success && rollbackOnError) {
          throw new ToolError(`Tool '${toolName}' failed, rolling back sequence`);
        }
      }

      return results;
    } catch (error) {
      if (rollbackOnError) {
        await this._rollbackSequence(executed);
      }
      throw error;
    }
  }

  /**
   * Enable or disable a tool
   * @param {string} name - Tool name
   * @param {boolean} enabled - Enable/disable
   * @returns {boolean}
   */
  setToolEnabled(name, enabled) {
    if (!this.tools.has(name)) {
      throw new NotFoundError(`Tool '${name}' not found`, 'tool', name);
    }

    const tool = this.tools.get(name);
    
    if (tool.required && !enabled) {
      throw new ToolError(`Cannot disable required tool '${name}'`);
    }

    tool.enabled = enabled;
    tool.updated = new Date();

    this._emitHook('tool:enabledChanged', { name, enabled });
    return true;
  }

  /**
   * Check if tool can be executed
   * @param {string} name - Tool name
   * @param {object} context - Execution context
   * @returns {ValidationResult}
   */
  validateToolExecution(name, context = {}) {
    const result = new ValidationResult();

    if (!this.tools.has(name)) {
      result.addError('tool', 'Tool not found', name);
      return result;
    }

    const tool = this.tools.get(name);
    
    if (!tool.enabled) {
      result.addError('tool', 'Tool is disabled', name);
      return result;
    }

    // Validate tool permissions
    try {
      this._validatePermissions(name, context);
    } catch (error) {
      result.addError('permissions', error.message, error.details);
    }

    // Validate dependencies
    if (tool.dependencies.length > 0) {
      try {
        this._validateDependencies(name);
      } catch (error) {
        result.addError('dependencies', error.message, tool.dependencies);
      }
    }

    return result;
  }

  /**
   * Get execution statistics
   * @returns {object}
   */
  getStats() {
    const tools = Array.from(this.tools.values());
    
    return {
      total: tools.length,
      enabled: tools.filter(t => t.enabled).length,
      disabled: tools.filter(t => !t.enabled).length,
      categories: this.categories.size,
      totalExecutions: tools.reduce((sum, tool) => sum + tool.executionCount, 0),
      totalSuccesses: tools.reduce((sum, tool) => sum + tool.successCount, 0),
      totalFailures: tools.reduce((sum, tool) => sum + tool.failureCount, 0),
      mostExecuted: tools
        .sort((a, b) => b.executionCount - a.executionCount)
        .slice(0, 5)
        .map(t => ({ name: t.tool.name, count: t.executionCount }))
    };
  }

  // Private helper methods

  _addToCategory(category, toolName) {
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    
    const categoryTools = this.categories.get(category);
    if (!categoryTools.includes(toolName)) {
      categoryTools.push(toolName);
    }
  }

  _removeFromCategory(category, toolName) {
    if (this.categories.has(category)) {
      const tools = this.categories.get(category);
      const index = tools.indexOf(toolName);
      if (index > -1) {
        tools.splice(index, 1);
      }
    }
  }

  _registerDependencies(toolName, dependencies) {
    dependencies.forEach(dep => {
      if (!this.dependencies.has(dep)) {
        this.dependencies.set(dep, []);
      }
      
      const dependants = this.dependencies.get(dep);
      if (!dependants.includes(toolName)) {
        dependants.push(toolName);
      }
    });
  }

  _unregisterDependencies(toolName) {
    for (const [, dependants] of this.dependencies) {
      const index = dependants.indexOf(toolName);
      if (index > -1) {
        dependants.splice(index, 1);
      }
    }
  }

  _registerPermissions(toolName, permissions) {
    this.permissions.set(toolName, permissions);
  }

  _registerToolHooks(tool) {
    if (typeof tool.registerHooks === 'function') {
      tool.registerHooks(this);
    }
  }

  _emitHook(hook, data) {
    const hooks = this.hooks.get(hook) || [];
    hooks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        this.logger.warn(`Hook ${hook} callback failed:`, error);
      }
    });
  }

  _getDependentTools(toolName) {
    return this.dependencies.get(toolName) || [];
  }

  _validatePermissions(toolName, context) {
    const permissions = this.permissions.get(toolName) || [];
    
    // Check general permissions
    if (permissions.includes('gm') && !game.user.isGM) {
      throw new ValidationError(`Tool '${toolName}' requires GM permissions`);
    }
    
    // Check custom permissions defined by tool
    const tool = this.getTool(toolName);
    if (tool && typeof tool.validatePermissions === 'function') {
      tool.validatePermissions(context);
    }
  }

  _validateDependencies(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool) return true;

    for (const dep of tool.dependencies) {
      if (!this.tools.has(dep) || !this.tools.get(dep).enabled) {
        throw new ToolError(`Missing or disabled dependency: ${dep}`);
      }
    }
  }

  _generateExecutionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  _rollbackSequence(executed) {
    // Placeholder for rollback logic
    // In future, tools could implement rollback functionality
    this.logger.debug('Rollback sequence implemented for:', executed);
  }

  /**
   * Register a hook callback
   * @param {string} hook - Hook name
   * @param {function} callback - Callback function
   */
  addHook(hook, callback) {
    if (!this.hooks.has(hook)) {
      this.hooks.set(hook, []);
    }
    
    this.hooks.get(hook).push(callback);
  }

  /**
   * Remove a hook callback
   * @param {string} hook - Hook name
   * @param {function} callback - Callback function to remove
   */
  removeHook(hook, callback) {
    if (this.hooks.has(hook)) {
      const callbacks = this.hooks.get(hook);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
}

// Export singleton instance
const toolRegistry = new ToolRegistry();
export { toolRegistry };
export default toolRegistry;
