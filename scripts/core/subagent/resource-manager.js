/**
 * SubAgent Architecture - Resource Manager  
 * Handles scope isolation, resource allocation, and cleanup coordination
 */

import { createLogger } from '../../utils/logger.js';

export class ResourceManager {
  constructor() {
    this.logger = createLogger('ResourceManager');
    this.allocations = new Map(); // scopeId -> allocation data
    this.globalLimits = {
      maxConcurrentScopes: 10,
      maxTotalMemoryMB: 500,
      maxTotalCpuTimeMs: 1800000 // 30 minutes total
    };
  }

  /**
   * Allocate resources for a new scope
   * @param {string} scopeId - Scope identifier
   * @param {Object} resourceRequirements - Required resources
   * @returns {Object} Allocation result
   */
  allocateResources(scopeId, resourceRequirements) {
    try {
      // Check global limits
      this._checkGlobalLimits(resourceRequirements);

      const allocation = {
        scopeId,
        allocated: Date.now(),
        requirements: resourceRequirements,
        usage: {
          memoryMB: 0,
          cpuTimeMs: 0,
          fileHandles: 0,
          networkConnections: 0
        },
        limits: {
          maxMemoryMB: resourceRequirements.maxMemoryMB || 100,
          maxCpuTimeMs: resourceRequirements.maxCpuTimeMs || 300000,
          maxFileHandles: resourceRequirements.maxFileHandles || 50,
          maxNetworkConnections: resourceRequirements.maxNetworkConnections || 10
        },
        isolated: true,
        status: 'ACTIVE'
      };

      this.allocations.set(scopeId, allocation);
      this.logger.debug(`Allocated resources for scope ${scopeId}`);

      return {
        success: true,
        allocation: allocation,
        remainingCapacity: {
          scopes: this.globalLimits.maxConcurrentScopes - this.allocations.size,
          memoryMB: this.globalLimits.maxTotalMemoryMB - 100, // Rough estimate
          cpuTimeMs: this.globalLimits.maxTotalCpuTimeMs - 300000 // Rough estimate
        }
      };

    } catch (error) {
      this.logger.error('Resource allocation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update resource usage for a scope
   * @param {string} scopeId - Scope identifier
   * @param {Object} usage - Current resource usage
   */
  updateUsage(scopeId, usage) {
    const allocation = this.allocations.get(scopeId);
    if (!allocation) {
      this.logger.warn(`No allocation found for scope ${scopeId}`);
      return;
    }

    // Update usage tracking
    allocation.usage = { ...allocation.usage, ...usage };
    allocation.lastUpdated = Date.now();

    // Check for limit violations
    const violations = this._checkLimitViolations(allocation);
    if (violations.length > 0) {
      this.logger.warn(`Resource limit violations for scope ${scopeId}:`, violations);
      allocation.violations = violations;
    }

    this.logger.debug(`Updated resource usage for scope ${scopeId}`);
  }

  /**
   * Check if scope is within resource limits
   * @param {string} scopeId - Scope identifier
   * @returns {Object} Limit check result
   */
  checkLimits(scopeId) {
    const allocation = this.allocations.get(scopeId);
    if (!allocation) {
      return {
        valid: false,
        error: 'Scope not found'
      };
    }

    const violations = this._checkLimitViolations(allocation);
    
    return {
      valid: violations.length === 0,
      violations,
      usage: allocation.usage,
      limits: allocation.limits
    };
  }

  /**
   * Release resources for a completed scope
   * @param {string} scopeId - Scope identifier
   * @returns {Object} Cleanup result
   */
  releaseResources(scopeId) {
    try {
      const allocation = this.allocations.get(scopeId);
      if (!allocation) {
        this.logger.warn(`No allocation to release for scope ${scopeId}`);
        return { success: true, warning: 'No allocation found' };
      }

      // Mark as released
      allocation.status = 'RELEASED';
      allocation.released = Date.now();
      allocation.lifetime = allocation.released - allocation.allocated;

      // Perform cleanup
      const cleanupResult = this._performCleanup(allocation);

      // Remove from active allocations
      this.allocations.delete(scopeId);

      this.logger.info(`Released resources for scope ${scopeId} after ${allocation.lifetime}ms`);

      return {
        success: true,
        lifetime: allocation.lifetime,
        finalUsage: allocation.usage,
        cleanup: cleanupResult
      };

    } catch (error) {
      this.logger.error(`Error releasing resources for scope ${scopeId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get resource statistics for a scope
   * @param {string} scopeId - Scope identifier
   * @returns {Object|null} Resource statistics
   */
  getResourceStats(scopeId) {
    const allocation = this.allocations.get(scopeId);
    if (!allocation) {
      return null;
    }

    const now = Date.now();
    return {
      scopeId: allocation.scopeId,
      status: allocation.status,
      lifetime: now - allocation.allocated,
      usage: allocation.usage,
      limits: allocation.limits,
      utilizationPercent: {
        memory: (allocation.usage.memoryMB / allocation.limits.maxMemoryMB) * 100,
        cpu: (allocation.usage.cpuTimeMs / allocation.limits.maxCpuTimeMs) * 100
      },
      violations: allocation.violations || [],
      isolated: allocation.isolated
    };
  }

  /**
   * Get global resource statistics
   * @returns {Object} Global resource statistics
   */
  getGlobalStats() {
    const allocations = Array.from(this.allocations.values());
    const activeAllocations = allocations.filter(a => a.status === 'ACTIVE');

    const totalUsage = activeAllocations.reduce((acc, allocation) => ({
      memoryMB: acc.memoryMB + allocation.usage.memoryMB,
      cpuTimeMs: acc.cpuTimeMs + allocation.usage.cpuTimeMs,
      fileHandles: acc.fileHandles + allocation.usage.fileHandles,
      networkConnections: acc.networkConnections + allocation.usage.networkConnections
    }), { memoryMB: 0, cpuTimeMs: 0, fileHandles: 0, networkConnections: 0 });

    return {
      activeScopes: activeAllocations.length,
      totalAllocations: allocations.length,
      globalLimits: this.globalLimits,
      totalUsage,
      utilizationPercent: {
        scopes: (activeAllocations.length / this.globalLimits.maxConcurrentScopes) * 100,
        memory: (totalUsage.memoryMB / this.globalLimits.maxTotalMemoryMB) * 100,
        cpu: (totalUsage.cpuTimeMs / this.globalLimits.maxTotalCpuTimeMs) * 100
      },
      remainingCapacity: this._calculateRemainingCapacity()
    };
  }

  /**
   * Force cleanup of inactive or violated scopes
   * @returns {Object} Cleanup results
   */
  forceCleanup() {
    const allocations = Array.from(this.allocations.values());
    const toCleanup = allocations.filter(allocation => 
      allocation.status !== 'ACTIVE' || 
      (allocation.violations && allocation.violations.length > 0)
    );

    const results = [];
    for (const allocation of toCleanup) {
      const result = this.releaseResources(allocation.scopeId);
      results.push({
        scopeId: allocation.scopeId,
        ...result
      });
    }

    this.logger.info(`Force cleanup completed: ${results.length} scopes cleaned up`);
    
    return {
      cleanedUp: results.length,
      results
    };
  }

  /**
   * Create resource isolation for scope
   * @param {string} scopeId - Scope identifier
   * @param {Object} isolationConfig - Isolation configuration
   */
  createIsolation(scopeId, isolationConfig = {}) {
    const allocation = this.allocations.get(scopeId);
    if (!allocation) {
      throw new Error(`No allocation found for scope ${scopeId}`);
    }

    // Apply isolation settings
    allocation.isolation = {
      memoryIsolated: isolationConfig.memoryIsolation !== false,
      networkIsolated: isolationConfig.networkIsolation === true,
      fileSystemIsolated: isolationConfig.fileSystemIsolation === true,
      processIsolated: isolationConfig.processIsolation === true
    };

    allocation.isolated = true;
    this.logger.debug(`Created resource isolation for scope ${scopeId}`);
  }

  /**
   * Check global resource limits
   * @private
   */
  _checkGlobalLimits(requirements) {
    const stats = this.getGlobalStats();

    // Check concurrent scopes limit
    if (stats.activeScopes >= this.globalLimits.maxConcurrentScopes) {
      throw new Error(`Maximum concurrent scopes limit reached: ${this.globalLimits.maxConcurrentScopes}`);
    }

    // Check total memory limit
    const projectedMemory = stats.totalUsage.memoryMB + (requirements.maxMemoryMB || 100);
    if (projectedMemory > this.globalLimits.maxTotalMemoryMB) {
      throw new Error(`Total memory limit would be exceeded: ${projectedMemory}MB > ${this.globalLimits.maxTotalMemoryMB}MB`);
    }

    // Check total CPU time limit
    const projectedCpuTime = stats.totalUsage.cpuTimeMs + (requirements.maxCpuTimeMs || 300000);
    if (projectedCpuTime > this.globalLimits.maxTotalCpuTimeMs) {
      throw new Error(`Total CPU time limit would be exceeded: ${projectedCpuTime}ms > ${this.globalLimits.maxTotalCpuTimeMs}ms`);
    }
  }

  /**
   * Check for resource limit violations
   * @private
   */
  _checkLimitViolations(allocation) {
    const violations = [];

    if (allocation.usage.memoryMB > allocation.limits.maxMemoryMB) {
      violations.push({
        type: 'MEMORY',
        current: allocation.usage.memoryMB,
        limit: allocation.limits.maxMemoryMB,
        severity: 'HIGH'
      });
    }

    if (allocation.usage.cpuTimeMs > allocation.limits.maxCpuTimeMs) {
      violations.push({
        type: 'CPU_TIME',
        current: allocation.usage.cpuTimeMs,
        limit: allocation.limits.maxCpuTimeMs,
        severity: 'HIGH'
      });
    }

    if (allocation.usage.fileHandles > allocation.limits.maxFileHandles) {
      violations.push({
        type: 'FILE_HANDLES',
        current: allocation.usage.fileHandles,
        limit: allocation.limits.maxFileHandles,
        severity: 'MEDIUM'
      });
    }

    if (allocation.usage.networkConnections > allocation.limits.maxNetworkConnections) {
      violations.push({
        type: 'NETWORK_CONNECTIONS',
        current: allocation.usage.networkConnections,
        limit: allocation.limits.maxNetworkConnections,
        severity: 'MEDIUM'
      });
    }

    return violations;
  }

  /**
   * Perform scope cleanup
   * @private
   */
  _performCleanup(allocation) {
    const cleanupTasks = [];

    try {
      // Memory cleanup
      if (allocation.usage.memoryMB > 0) {
        // In real implementation, this would trigger garbage collection
        cleanupTasks.push({ task: 'memory', status: 'completed' });
      }

      // File handle cleanup
      if (allocation.usage.fileHandles > 0) {
        // In real implementation, this would close open file handles
        cleanupTasks.push({ task: 'fileHandles', status: 'completed' });
      }

      // Network connection cleanup
      if (allocation.usage.networkConnections > 0) {
        // In real implementation, this would close network connections
        cleanupTasks.push({ task: 'networkConnections', status: 'completed' });
      }

      return {
        success: true,
        tasksCompleted: cleanupTasks.length,
        tasks: cleanupTasks
      };

    } catch (error) {
      this.logger.error('Cleanup failed:', error);
      return {
        success: false,
        error: error.message,
        partialTasks: cleanupTasks
      };
    }
  }

  /**
   * Calculate remaining global capacity
   * @private
   */
  _calculateRemainingCapacity() {
    const allocations = Array.from(this.allocations.values());
    const activeAllocations = allocations.filter(a => a.status === 'ACTIVE');

    const totalUsage = activeAllocations.reduce((acc, allocation) => ({
      memoryMB: acc.memoryMB + allocation.usage.memoryMB,
      cpuTimeMs: acc.cpuTimeMs + allocation.usage.cpuTimeMs
    }), { memoryMB: 0, cpuTimeMs: 0 });
    
    return {
      scopes: this.globalLimits.maxConcurrentScopes - activeAllocations.length,
      memoryMB: this.globalLimits.maxTotalMemoryMB - totalUsage.memoryMB,
      cpuTimeMs: this.globalLimits.maxTotalCpuTimeMs - totalUsage.cpuTimeMs
    };
  }
}