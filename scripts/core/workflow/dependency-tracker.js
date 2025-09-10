/**
 * Workflow Standardization - Dependency Tracker
 * Prerequisite monitoring and resolution system
 */

import { createLogger } from '../../utils/logger.js';

export class DependencyTracker {
  constructor() {
    this.logger = createLogger('DependencyTracker');
    this.dependencies = new Map(); // workflowId -> dependency graph
    this.resolutionStrategies = new Map();
    this.blockingConditions = new Map();
    this.resolutionHistory = [];
    
    this._initializeResolutionStrategies();
  }

  /**
   * Track dependencies for workflow instance
   * @param {WorkflowInstance} workflowInstance - Workflow to track
   * @returns {Object} Dependency tracking setup
   */
  trackWorkflowDependencies(workflowInstance) {
    try {
      this.logger.info(`Setting up dependency tracking for workflow: ${workflowInstance.id}`);

      const dependencyGraph = this._buildDependencyGraph(workflowInstance);
      this.dependencies.set(workflowInstance.id, dependencyGraph);

      const analysis = this._analyzeDependencies(dependencyGraph);
      
      this.logger.info(`Dependency tracking configured: ${analysis.totalDependencies} dependencies, ${analysis.criticalPath.length} critical path steps`);
      
      return {
        graph: dependencyGraph,
        analysis,
        trackingId: workflowInstance.id
      };

    } catch (error) {
      this.logger.error(`Dependency tracking setup failed for ${workflowInstance.id}:`, error);
      throw error;
    }
  }

  /**
   * Check if step dependencies are satisfied
   * @param {string} workflowId - Workflow identifier
   * @param {string} stepId - Step identifier
   * @returns {Promise<Object>} Dependency check result
   */
  async checkStepDependencies(workflowId, stepId) {
    try {
      const graph = this.dependencies.get(workflowId);
      if (!graph) {
        throw new Error(`No dependency tracking found for workflow: ${workflowId}`);
      }

      const stepNode = graph.nodes.get(stepId);
      if (!stepNode) {
        throw new Error(`Step not found in dependency graph: ${stepId}`);
      }

      const dependencyResults = [];
      let allSatisfied = true;

      for (const depId of stepNode.dependencies) {
        const result = await this._checkSingleDependency(graph, stepId, depId);
        dependencyResults.push(result);
        
        if (!result.satisfied && result.required) {
          allSatisfied = false;
        }
      }

      return {
        stepId,
        allSatisfied,
        results: dependencyResults,
        blockingDependencies: dependencyResults.filter(r => !r.satisfied && r.required),
        optionalDependencies: dependencyResults.filter(r => !r.satisfied && !r.required)
      };

    } catch (error) {
      this.logger.error(`Dependency check failed for ${workflowId}:${stepId}:`, error);
      return {
        stepId,
        allSatisfied: false,
        error: error.message,
        results: []
      };
    }
  }

  /**
   * Resolve blocking dependencies
   * @param {string} workflowId - Workflow identifier
   * @param {Array} blockingDependencies - List of blocking dependencies
   * @param {Object} context - Resolution context
   * @returns {Promise<Object>} Resolution results
   */
  async resolveBlockingDependencies(workflowId, blockingDependencies, context = {}) {
    try {
      this.logger.info(`Resolving ${blockingDependencies.length} blocking dependencies for workflow ${workflowId}`);

      const resolutionResults = [];

      for (const dependency of blockingDependencies) {
        const result = await this._resolveSingleDependency(workflowId, dependency, context);
        resolutionResults.push(result);
        
        this._recordResolutionAttempt(workflowId, dependency, result);
      }

      const resolved = resolutionResults.filter(r => r.resolved).length;
      const failed = resolutionResults.length - resolved;

      this.logger.info(`Dependency resolution complete: ${resolved} resolved, ${failed} failed`);

      return {
        totalDependencies: blockingDependencies.length,
        resolved,
        failed,
        results: resolutionResults,
        remainingBlocks: resolutionResults.filter(r => !r.resolved && r.blocking)
      };

    } catch (error) {
      this.logger.error(`Dependency resolution failed for workflow ${workflowId}:`, error);
      return {
        totalDependencies: blockingDependencies.length,
        resolved: 0,
        failed: blockingDependencies.length,
        error: error.message,
        results: []
      };
    }
  }

  /**
   * Get dependency status for workflow
   * @param {string} workflowId - Workflow identifier
   * @returns {Object} Current dependency status
   */
  getDependencyStatus(workflowId) {
    const graph = this.dependencies.get(workflowId);
    if (!graph) {
      return { error: 'Workflow not found' };
    }

    const status = {
      workflowId,
      totalSteps: graph.nodes.size,
      readySteps: [],
      blockedSteps: [],
      completedSteps: [],
      dependencyChains: [],
      criticalPath: graph.criticalPath || []
    };

    for (const [stepId, node] of graph.nodes.entries()) {
      if (node.status === 'COMPLETED') {
        status.completedSteps.push(stepId);
      } else if (node.dependencies.length === 0 || 
                 node.dependencies.every(depId => graph.nodes.get(depId)?.status === 'COMPLETED')) {
        status.readySteps.push(stepId);
      } else {
        status.blockedSteps.push({
          stepId,
          blockingDependencies: node.dependencies.filter(depId => 
            graph.nodes.get(depId)?.status !== 'COMPLETED'
          )
        });
      }
    }

    return status;
  }

  /**
   * Update step status in dependency graph
   * @param {string} workflowId - Workflow identifier
   * @param {string} stepId - Step identifier
   * @param {string} status - New status
   */
  updateStepStatus(workflowId, stepId, status) {
    const graph = this.dependencies.get(workflowId);
    if (!graph) {
      this.logger.warn(`No dependency graph found for workflow: ${workflowId}`);
      return;
    }

    const node = graph.nodes.get(stepId);
    if (!node) {
      this.logger.warn(`Step not found in dependency graph: ${stepId}`);
      return;
    }

    const oldStatus = node.status;
    node.status = status;
    node.lastUpdated = Date.now();

    if (status === 'COMPLETED') {
      node.completedAt = Date.now();
    }

    this.logger.debug(`Updated step status: ${stepId} from ${oldStatus} to ${status}`);

    if (status === 'COMPLETED') {
      this._checkUnblockedSteps(graph, stepId);
    }
  }

  /**
   * Add blocking condition
   * @param {string} workflowId - Workflow identifier
   * @param {string} conditionId - Condition identifier
   * @param {Object} condition - Blocking condition details
   */
  addBlockingCondition(workflowId, conditionId, condition) {
    if (!this.blockingConditions.has(workflowId)) {
      this.blockingConditions.set(workflowId, new Map());
    }

    this.blockingConditions.get(workflowId).set(conditionId, {
      ...condition,
      addedAt: Date.now(),
      status: 'ACTIVE'
    });

    this.logger.info(`Added blocking condition: ${conditionId} for workflow ${workflowId}`);
  }

  /**
   * Remove blocking condition
   * @param {string} workflowId - Workflow identifier
   * @param {string} conditionId - Condition identifier
   * @returns {boolean} Success status
   */
  removeBlockingCondition(workflowId, conditionId) {
    const workflowConditions = this.blockingConditions.get(workflowId);
    if (!workflowConditions) {
      return false;
    }

    const removed = workflowConditions.delete(conditionId);
    if (removed) {
      this.logger.info(`Removed blocking condition: ${conditionId} from workflow ${workflowId}`);
    }

    return removed;
  }

  /**
   * Build dependency graph from workflow instance
   * @private
   */
  _buildDependencyGraph(workflowInstance) {
    const graph = {
      workflowId: workflowInstance.id,
      nodes: new Map(),
      edges: [],
      createdAt: Date.now()
    };

    for (const step of workflowInstance.steps) {
      const node = {
        stepId: step.id,
        name: step.name,
        type: step.type,
        dependencies: step.dependencies || [],
        dependents: [],
        status: step.status || 'PENDING',
        required: step.required !== false,
        estimatedEffort: step.estimatedEffort || 2,
        riskLevel: step.riskLevel || 'medium'
      };

      graph.nodes.set(step.id, node);
    }

    for (const [stepId, node] of graph.nodes.entries()) {
      for (const depId of node.dependencies) {
        const depNode = graph.nodes.get(depId);
        if (depNode) {
          depNode.dependents.push(stepId);
          graph.edges.push({ from: depId, to: stepId });
        } else {
          this.logger.warn(`Dependency not found: ${depId} for step ${stepId}`);
        }
      }
    }

    graph.criticalPath = this._calculateCriticalPath(graph);
    
    return graph;
  }

  /**
   * Analyze dependency structure
   * @private
   */
  _analyzeDependencies(graph) {
    const analysis = {
      totalDependencies: graph.edges.length,
      circularDependencies: this._detectCircularDependencies(graph),
      criticalPath: graph.criticalPath,
      parallelGroups: this._identifyParallelGroups(graph),
      riskAssessment: this._assessDependencyRisks(graph)
    };

    if (analysis.circularDependencies.length > 0) {
      this.logger.warn(`Circular dependencies detected:`, analysis.circularDependencies);
    }

    return analysis;
  }

  /**
   * Check single dependency
   * @private
   */
  async _checkSingleDependency(graph, stepId, depId) {
    const depNode = graph.nodes.get(depId);
    
    if (!depNode) {
      return {
        dependencyId: depId,
        satisfied: false,
        required: true,
        reason: 'Dependency not found in graph',
        resolutionStrategy: 'manual_check'
      };
    }

    const satisfied = depNode.status === 'COMPLETED';
    
    return {
      dependencyId: depId,
      satisfied,
      required: depNode.required !== false,
      status: depNode.status,
      reason: satisfied ? 'Dependency completed' : `Dependency status: ${depNode.status}`,
      resolutionStrategy: satisfied ? null : this._selectResolutionStrategy(depNode)
    };
  }

  /**
   * Resolve single dependency
   * @private
   */
  async _resolveSingleDependency(workflowId, dependency, context) {
    const strategy = this.resolutionStrategies.get(dependency.resolutionStrategy);
    
    if (!strategy) {
      return {
        dependencyId: dependency.dependencyId,
        resolved: false,
        blocking: true,
        reason: `No resolution strategy available: ${dependency.resolutionStrategy}`
      };
    }

    try {
      const result = await strategy.resolve(dependency, workflowId, context);
      
      return {
        dependencyId: dependency.dependencyId,
        resolved: result.success === true,
        blocking: !result.canContinue,
        reason: result.message || 'Resolution attempted',
        strategy: dependency.resolutionStrategy,
        details: result.details
      };

    } catch (error) {
      return {
        dependencyId: dependency.dependencyId,
        resolved: false,
        blocking: true,
        reason: `Resolution failed: ${error.message}`,
        strategy: dependency.resolutionStrategy,
        error: error.message
      };
    }
  }

  /**
   * Select appropriate resolution strategy
   * @private
   */
  _selectResolutionStrategy(depNode) {
    if (depNode.status === 'FAILED') {
      return 'retry_dependency';
    }
    
    if (depNode.status === 'PENDING' || depNode.status === 'RUNNING') {
      return 'wait_for_completion';
    }
    
    if (depNode.status === 'BLOCKED') {
      return 'resolve_blocking';
    }
    
    if (!depNode.required) {
      return 'skip_optional';
    }
    
    return 'manual_intervention';
  }

  /**
   * Calculate critical path through dependency graph
   * @private
   */
  _calculateCriticalPath(graph) {
    const criticalPath = [];
    const visited = new Set();
    const pathLengths = new Map();

    const calculateLongestPath = (nodeId) => {
      if (visited.has(nodeId)) {
        return pathLengths.get(nodeId) || 0;
      }

      visited.add(nodeId);
      const node = graph.nodes.get(nodeId);
      let maxPath = 0;

      for (const depId of node.dependencies) {
        const pathLength = calculateLongestPath(depId);
        maxPath = Math.max(maxPath, pathLength);
      }

      const nodeLength = maxPath + (node.estimatedEffort || 1);
      pathLengths.set(nodeId, nodeLength);
      
      return nodeLength;
    };

    let maxPathLength = 0;
    let criticalNode = null;

    for (const [nodeId, node] of graph.nodes.entries()) {
      if (node.dependents.length === 0) { // End nodes
        const pathLength = calculateLongestPath(nodeId);
        if (pathLength > maxPathLength) {
          maxPathLength = pathLength;
          criticalNode = nodeId;
        }
      }
    }

    if (criticalNode) {
      criticalPath.push(...this._traceCriticalPath(graph, criticalNode, pathLengths));
    }

    return criticalPath;
  }

  /**
   * Trace critical path from end node
   * @private
   */
  _traceCriticalPath(graph, nodeId, pathLengths) {
    const path = [nodeId];
    const node = graph.nodes.get(nodeId);

    if (node.dependencies.length === 0) {
      return path;
    }

    let criticalDep = null;
    let maxPathLength = 0;

    for (const depId of node.dependencies) {
      const pathLength = pathLengths.get(depId) || 0;
      if (pathLength > maxPathLength) {
        maxPathLength = pathLength;
        criticalDep = depId;
      }
    }

    if (criticalDep) {
      path.unshift(...this._traceCriticalPath(graph, criticalDep, pathLengths));
    }

    return path;
  }

  /**
   * Detect circular dependencies
   * @private
   */
  _detectCircularDependencies(graph) {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    const dfs = (nodeId, path = []) => {
      if (recursionStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        cycles.push([...path.slice(cycleStart), nodeId]);
        return;
      }

      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = graph.nodes.get(nodeId);
      for (const depId of node.dependencies) {
        dfs(depId, [...path]);
      }

      recursionStack.delete(nodeId);
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }

    return cycles;
  }

  /**
   * Identify parallel execution groups
   * @private
   */
  _identifyParallelGroups(graph) {
    const parallelGroups = [];
    const processed = new Set();

    for (const [nodeId, node] of graph.nodes.entries()) {
      if (processed.has(nodeId)) continue;

      const parallelGroup = [nodeId];
      processed.add(nodeId);

      for (const [otherNodeId, otherNode] of graph.nodes.entries()) {
        if (processed.has(otherNodeId) || nodeId === otherNodeId) continue;

        if (this._canRunInParallel(node, otherNode, graph)) {
          parallelGroup.push(otherNodeId);
          processed.add(otherNodeId);
        }
      }

      if (parallelGroup.length > 1) {
        parallelGroups.push(parallelGroup);
      }
    }

    return parallelGroups;
  }

  /**
   * Check if nodes can run in parallel
   * @private
   */
  _canRunInParallel(nodeA, nodeB, graph) {
    if (nodeA.dependencies.includes(nodeB.stepId) || nodeB.dependencies.includes(nodeA.stepId)) {
      return false;
    }

    if (this._hasTransitiveDependency(nodeA.stepId, nodeB.stepId, graph) ||
        this._hasTransitiveDependency(nodeB.stepId, nodeA.stepId, graph)) {
      return false;
    }

    return true;
  }

  /**
   * Check for transitive dependencies
   * @private
   */
  _hasTransitiveDependency(fromNodeId, toNodeId, graph, visited = new Set()) {
    if (visited.has(fromNodeId)) return false;
    visited.add(fromNodeId);

    const fromNode = graph.nodes.get(fromNodeId);
    if (!fromNode) return false;

    if (fromNode.dependencies.includes(toNodeId)) {
      return true;
    }

    return fromNode.dependencies.some(depId => 
      this._hasTransitiveDependency(depId, toNodeId, graph, visited)
    );
  }

  /**
   * Assess dependency-related risks
   * @private
   */
  _assessDependencyRisks(graph) {
    const risks = [];

    const longChains = this._findLongDependencyChains(graph, 5);
    if (longChains.length > 0) {
      risks.push({
        type: 'long_dependency_chains',
        severity: 'medium',
        description: `${longChains.length} dependency chains longer than 5 steps`,
        chains: longChains
      });
    }

    const highRiskNodes = Array.from(graph.nodes.values())
      .filter(node => node.riskLevel === 'high' && node.dependents.length > 2);
    if (highRiskNodes.length > 0) {
      risks.push({
        type: 'high_risk_bottlenecks',
        severity: 'high',
        description: `${highRiskNodes.length} high-risk nodes with multiple dependents`,
        nodes: highRiskNodes.map(n => n.stepId)
      });
    }

    return risks;
  }

  /**
   * Find long dependency chains
   * @private
   */
  _findLongDependencyChains(graph, threshold) {
    const longChains = [];

    const findChain = (nodeId, chain = []) => {
      const node = graph.nodes.get(nodeId);
      if (!node) return;

      const currentChain = [...chain, nodeId];

      if (currentChain.length >= threshold) {
        longChains.push([...currentChain]);
      }

      for (const depId of node.dependencies) {
        findChain(depId, currentChain);
      }
    };

    for (const nodeId of graph.nodes.keys()) {
      findChain(nodeId);
    }

    return longChains.filter((chain, index, self) => 
      index === self.findIndex(c => JSON.stringify(c) === JSON.stringify(chain))
    );
  }

  /**
   * Check for unblocked steps after completion
   * @private
   */
  _checkUnblockedSteps(graph, completedStepId) {
    const completedNode = graph.nodes.get(completedStepId);
    if (!completedNode) return;

    const newlyUnblocked = [];

    for (const dependentId of completedNode.dependents) {
      const dependentNode = graph.nodes.get(dependentId);
      if (!dependentNode || dependentNode.status !== 'PENDING') continue;

      const allDepsCompleted = dependentNode.dependencies.every(depId => {
        const depNode = graph.nodes.get(depId);
        return depNode && depNode.status === 'COMPLETED';
      });

      if (allDepsCompleted) {
        newlyUnblocked.push(dependentId);
      }
    }

    if (newlyUnblocked.length > 0) {
      this.logger.info(`Steps unblocked by completion of ${completedStepId}:`, newlyUnblocked);
    }

    return newlyUnblocked;
  }

  /**
   * Record resolution attempt
   * @private
   */
  _recordResolutionAttempt(workflowId, dependency, result) {
    this.resolutionHistory.push({
      workflowId,
      dependencyId: dependency.dependencyId,
      strategy: result.strategy,
      resolved: result.resolved,
      timestamp: Date.now(),
      details: result.details
    });

    if (this.resolutionHistory.length > 1000) {
      this.resolutionHistory = this.resolutionHistory.slice(-500);
    }
  }

  /**
   * Initialize built-in resolution strategies
   * @private
   */
  _initializeResolutionStrategies() {
    this.resolutionStrategies.set('wait_for_completion', {
      resolve: async (dependency, workflowId, context) => {
        const waitTime = context.maxWaitTime || 30000;
        const startTime = Date.now();

        while (Date.now() - startTime < waitTime) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const graph = this.dependencies.get(workflowId);
          const depNode = graph?.nodes.get(dependency.dependencyId);
          
          if (depNode?.status === 'COMPLETED') {
            return {
              success: true,
              message: 'Dependency completed during wait',
              canContinue: true
            };
          }
        }

        return {
          success: false,
          message: 'Wait timeout exceeded',
          canContinue: false
        };
      }
    });

    this.resolutionStrategies.set('retry_dependency', {
      resolve: async (dependency, workflowId, context) => {
        const maxRetries = context.maxRetries || 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          
          const simulatedSuccess = Math.random() > 0.3;
          
          if (simulatedSuccess) {
            return {
              success: true,
              message: `Dependency resolved on retry attempt ${attempt}`,
              canContinue: true,
              details: { attempt }
            };
          }
        }

        return {
          success: false,
          message: `Dependency retry failed after ${maxRetries} attempts`,
          canContinue: false
        };
      }
    });

    this.resolutionStrategies.set('skip_optional', {
      resolve: async (dependency, workflowId, context) => {
        return {
          success: true,
          message: 'Optional dependency skipped',
          canContinue: true,
          details: { skipped: true }
        };
      }
    });

    this.resolutionStrategies.set('manual_intervention', {
      resolve: async (dependency, workflowId, context) => {
        return {
          success: false,
          message: 'Manual intervention required for dependency resolution',
          canContinue: false,
          details: { requiresManualAction: true }
        };
      }
    });
  }

  /**
   * Get dependency tracker statistics
   * @returns {Object} Current tracker statistics
   */
  getTrackerStatistics() {
    const activeWorkflows = this.dependencies.size;
    const totalResolutions = this.resolutionHistory.length;
    const successfulResolutions = this.resolutionHistory.filter(r => r.resolved).length;

    return {
      activeWorkflows,
      totalDependencies: Array.from(this.dependencies.values())
        .reduce((sum, graph) => sum + graph.edges.length, 0),
      totalResolutions,
      successfulResolutions,
      resolutionSuccessRate: totalResolutions > 0 ? (successfulResolutions / totalResolutions) * 100 : 0,
      availableStrategies: Array.from(this.resolutionStrategies.keys()),
      activeBlockingConditions: Array.from(this.blockingConditions.values())
        .reduce((sum, conditions) => sum + conditions.size, 0)
    };
  }

  /**
   * Clean up completed workflows
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of cleaned up workflows
   */
  cleanupCompletedWorkflows(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoffTime = Date.now() - maxAge;
    let cleanedUp = 0;

    for (const [workflowId, graph] of this.dependencies.entries()) {
      if (graph.createdAt < cutoffTime) {
        this.dependencies.delete(workflowId);
        this.blockingConditions.delete(workflowId);
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      this.logger.info(`Cleaned up ${cleanedUp} old workflow dependency graphs`);
    }

    return cleanedUp;
  }
}

export default DependencyTracker;