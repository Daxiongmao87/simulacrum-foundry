/**
 * SubAgent Architecture - Context State Manager
 * Manages variable templating, state persistence, and context isolation
 */

import { createLogger } from '../../utils/logger.js';

export class ContextStateManager {
  constructor() {
    this.logger = createLogger('ContextStateManager');
    this.contexts = new Map(); // scope -> context mapping
  }

  /**
   * Create a new context state for a scope
   * @param {string} scopeId - Unique scope identifier
   * @param {Object} initialVariables - Initial template variables
   * @returns {ContextState} Created context state
   */
  createContext(scopeId, initialVariables = {}) {
    const context = {
      scopeId,
      variables: new Map(Object.entries(initialVariables)),
      executionHistory: [],
      created: new Date(),
      lastUpdated: new Date(),
      metadata: {
        version: 1,
        isolated: true
      }
    };

    this.contexts.set(scopeId, context);
    this.logger.debug(`Created context for scope ${scopeId}`);
    
    return context;
  }

  /**
   * Get context state for a scope
   * @param {string} scopeId - Scope identifier
   * @returns {ContextState|null} Context state or null if not found
   */
  getContext(scopeId) {
    return this.contexts.get(scopeId) || null;
  }

  /**
   * Update context variable
   * @param {string} scopeId - Scope identifier
   * @param {string} name - Variable name
   * @param {Any} value - Variable value
   * @param {Object} metadata - Optional metadata
   */
  setVariable(scopeId, name, value, metadata = {}) {
    const context = this.contexts.get(scopeId);
    if (!context) {
      throw new Error(`Context not found for scope ${scopeId}`);
    }

    // Validate variable name
    if (!this._isValidVariableName(name)) {
      throw new Error(`Invalid variable name: ${name}`);
    }

    context.variables.set(name, {
      value,
      metadata,
      updated: new Date()
    });

    context.lastUpdated = new Date();
    this.logger.debug(`Set variable ${name} in scope ${scopeId}`);
  }

  /**
   * Get context variable
   * @param {string} scopeId - Scope identifier
   * @param {string} name - Variable name
   * @returns {Any} Variable value or undefined
   */
  getVariable(scopeId, name) {
    const context = this.contexts.get(scopeId);
    if (!context) {
      return undefined;
    }

    const variable = context.variables.get(name);
    return variable ? variable.value : undefined;
  }

  /**
   * Check if variable exists in context
   * @param {string} scopeId - Scope identifier  
   * @param {string} name - Variable name
   * @returns {boolean} True if variable exists
   */
  hasVariable(scopeId, name) {
    const context = this.contexts.get(scopeId);
    return context ? context.variables.has(name) : false;
  }

  /**
   * Get all variables for a context
   * @param {string} scopeId - Scope identifier
   * @returns {Map<String, Any>} All variables or empty Map
   */
  getAllVariables(scopeId) {
    const context = this.contexts.get(scopeId);
    if (!context) {
      return new Map();
    }

    // Return a copy to maintain isolation
    const variablesCopy = new Map();
    for (const [name, data] of context.variables.entries()) {
      variablesCopy.set(name, data.value);
    }
    
    return variablesCopy;
  }

  /**
   * Process template substitution in text
   * @param {string} template - Template text with {{variable}} placeholders
   * @param {string} scopeId - Scope identifier for variable lookup
   * @returns {string} Processed text with variables substituted
   */
  processTemplate(template, scopeId) {
    if (!template || typeof template !== 'string') {
      return template;
    }

    const context = this.contexts.get(scopeId);
    if (!context) {
      this.logger.warn(`No context found for scope ${scopeId} during template processing`);
      return template;
    }

    let processed = template;
    
    // Find all template placeholders
    const placeholders = template.match(/\{\{[^}]+\}\}/g) || [];
    
    for (const placeholder of placeholders) {
      const variableName = placeholder.slice(2, -2).trim(); // Remove {{ }}
      
      if (context.variables.has(variableName)) {
        const variableData = context.variables.get(variableName);
        let value = variableData.value;
        
        // Convert value to string appropriately
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        } else {
          value = String(value);
        }
        
        processed = processed.replace(placeholder, value);
      } else {
        this.logger.warn(`Template variable '${variableName}' not found in scope ${scopeId}`);
        // Keep placeholder as-is for missing variables
      }
    }

    return processed;
  }

  /**
   * Validate template and return missing variables
   * @param {string} template - Template text to validate
   * @param {string} scopeId - Scope identifier
   * @returns {Object} Validation result with missing variables
   */
  validateTemplate(template, scopeId) {
    const placeholders = template.match(/\{\{[^}]+\}\}/g) || [];
    const missingVariables = [];
    const invalidVariables = [];
    
    const context = this.contexts.get(scopeId);
    
    for (const placeholder of placeholders) {
      const variableName = placeholder.slice(2, -2).trim();
      
      if (!this._isValidVariableName(variableName)) {
        invalidVariables.push(variableName);
        continue;
      }
      
      if (!context || !context.variables.has(variableName)) {
        missingVariables.push(variableName);
      }
    }

    return {
      valid: missingVariables.length === 0 && invalidVariables.length === 0,
      missingVariables,
      invalidVariables,
      totalPlaceholders: placeholders.length
    };
  }

  /**
   * Create isolated context copy for SubAgent execution
   * @param {string} sourceScope - Source scope identifier
   * @param {string} targetScope - Target scope identifier
   * @param {string[]} includeVariables - Variables to include (empty = all)
   * @returns {ContextState} Isolated context copy
   */
  createIsolatedCopy(sourceScope, targetScope, includeVariables = []) {
    const sourceContext = this.contexts.get(sourceScope);
    if (!sourceContext) {
      throw new Error(`Source context not found: ${sourceScope}`);
    }

    const variablesToCopy = includeVariables.length > 0 
      ? includeVariables 
      : Array.from(sourceContext.variables.keys());

    const isolatedVariables = {};
    for (const varName of variablesToCopy) {
      if (sourceContext.variables.has(varName)) {
        const variable = sourceContext.variables.get(varName);
        // Deep copy the value to ensure isolation
        isolatedVariables[varName] = this._deepCopy(variable.value);
      }
    }

    return this.createContext(targetScope, isolatedVariables);
  }

  /**
   * Merge context variables from one scope to another
   * @param {string} fromScope - Source scope identifier
   * @param {string} toScope - Target scope identifier
   * @param {string[]} variableNames - Variables to merge (empty = all)
   * @param {boolean} overwrite - Whether to overwrite existing variables
   */
  mergeContexts(fromScope, toScope, variableNames = [], overwrite = false) {
    const fromContext = this.contexts.get(fromScope);
    const toContext = this.contexts.get(toScope);

    if (!fromContext || !toContext) {
      throw new Error('Both source and target contexts must exist');
    }

    const varsToMerge = variableNames.length > 0 
      ? variableNames 
      : Array.from(fromContext.variables.keys());

    for (const varName of varsToMerge) {
      if (fromContext.variables.has(varName)) {
        const shouldSet = overwrite || !toContext.variables.has(varName);
        
        if (shouldSet) {
          const sourceVariable = fromContext.variables.get(varName);
          toContext.variables.set(varName, {
            value: this._deepCopy(sourceVariable.value),
            metadata: { ...sourceVariable.metadata, merged: true },
            updated: new Date()
          });
        }
      }
    }

    toContext.lastUpdated = new Date();
    this.logger.debug(`Merged ${varsToMerge.length} variables from ${fromScope} to ${toScope}`);
  }

  /**
   * Clear context and free memory
   * @param {string} scopeId - Scope identifier
   */
  clearContext(scopeId) {
    const context = this.contexts.get(scopeId);
    if (context) {
      context.variables.clear();
      context.executionHistory = [];
      this.contexts.delete(scopeId);
      this.logger.debug(`Cleared context for scope ${scopeId}`);
    }
  }

  /**
   * Get context statistics
   * @param {string} scopeId - Scope identifier
   * @returns {Object} Context statistics
   */
  getContextStats(scopeId) {
    const context = this.contexts.get(scopeId);
    if (!context) {
      return null;
    }

    return {
      variableCount: context.variables.size,
      historyLength: context.executionHistory.length,
      age: Date.now() - context.created.getTime(),
      lastUpdateAge: Date.now() - context.lastUpdated.getTime(),
      memoryEstimate: this._estimateMemoryUsage(context)
    };
  }

  /**
   * Validate variable name
   * @private
   */
  _isValidVariableName(name) {
    if (typeof name !== 'string' || name.length === 0) {
      return false;
    }

    // Allow alphanumeric, underscore, hyphen
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
  }

  /**
   * Deep copy a value
   * @private
   */
  _deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this._deepCopy(item));
    }

    const copied = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        copied[key] = this._deepCopy(obj[key]);
      }
    }

    return copied;
  }

  /**
   * Estimate memory usage of context
   * @private
   */
  _estimateMemoryUsage(context) {
    let estimate = 0;
    
    // Rough estimation based on JSON serialization
    try {
      const serialized = JSON.stringify({
        variables: Array.from(context.variables.entries()),
        history: context.executionHistory
      });
      estimate = serialized.length * 2; // Rough estimate in bytes
    } catch (error) {
      estimate = -1; // Unable to estimate
    }

    return estimate;
  }
}