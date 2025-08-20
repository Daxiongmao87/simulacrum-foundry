/**
 * PortManager Class
 * 
 * Manages dynamic port allocation for concurrent Docker container testing.
 * Prevents port conflicts and manages instance limits for Docker infrastructure.
 */

export class PortManager {
  constructor(config) {
    this.portRange = config.docker.portRange;
    this.maxConcurrentInstances = config.docker.maxConcurrentInstances;
    
    // Track allocated ports and their containers
    this.allocatedPorts = new Map(); // port -> { containerId, timestamp }
    this.portQueue = []; // Queue of waiting port requests
    
    // Generate available port pool
    this.availablePorts = [];
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      this.availablePorts.push(port);
    }
    
    console.log(`[Test Runner] PortManager initialized: ${this.availablePorts.length} ports available (${this.portRange.start}-${this.portRange.end}), max ${this.maxConcurrentInstances} concurrent instances`);
  }

  /**
   * Allocate a port for a container
   * @param {string} containerId - Unique container identifier
   * @returns {Promise<number>} Allocated port number
   */
  async allocatePort(containerId) {
    // Check if we're at max concurrent instances
    if (this.allocatedPorts.size >= this.maxConcurrentInstances) {
      console.log(`[Test Runner] Max concurrent instances (${this.maxConcurrentInstances}) reached. Queuing ${containerId}...`);
      return await this.queuePortRequest(containerId);
    }

    // Find next available port
    const availablePort = this.findAvailablePort();
    if (!availablePort) {
      console.log(`[Test Runner] No available ports in range ${this.portRange.start}-${this.portRange.end}. Queuing ${containerId}...`);
      return await this.queuePortRequest(containerId);
    }

    // Allocate the port
    this.allocatedPorts.set(availablePort, {
      containerId,
      timestamp: Date.now()
    });

    console.log(`[Test Runner] Port ${availablePort} allocated to ${containerId} (${this.allocatedPorts.size}/${this.maxConcurrentInstances} instances)`);
    return availablePort;
  }

  /**
   * Release a port when container is done
   * @param {string} containerId - Container identifier
   * @param {number} port - Port to release
   */
  releasePort(containerId, port) {
    if (this.allocatedPorts.has(port)) {
      const allocation = this.allocatedPorts.get(port);
      if (allocation.containerId === containerId) {
        this.allocatedPorts.delete(port);
        console.log(`[Test Runner] Port ${port} released by ${containerId} (${this.allocatedPorts.size}/${this.maxConcurrentInstances} instances)`);
        
        // Process queued requests
        this.processPortQueue();
      } else {
        console.warn(`Port ${port} release attempted by ${containerId} but allocated to ${allocation.containerId}`);
      }
    } else {
      console.warn(`Port ${port} release attempted by ${containerId} but port not allocated`);
    }
  }

  /**
   * Get port allocation status
   * @returns {Object} Current allocation status
   */
  getStatus() {
    const allocatedPorts = Array.from(this.allocatedPorts.entries()).map(([port, allocation]) => ({
      port,
      containerId: allocation.containerId,
      allocatedFor: Date.now() - allocation.timestamp
    }));

    return {
      totalPorts: this.availablePorts.length,
      allocatedPorts,
      availablePorts: this.availablePorts.length - this.allocatedPorts.size,
      queuedRequests: this.portQueue.length,
      maxConcurrentInstances: this.maxConcurrentInstances,
      currentInstances: this.allocatedPorts.size
    };
  }

  /**
   * Find next available port in range
   * @returns {number|null} Available port or null if none available
   */
  findAvailablePort() {
    for (const port of this.availablePorts) {
      if (!this.allocatedPorts.has(port)) {
        return port;
      }
    }
    return null;
  }

  /**
   * Queue a port request when max instances reached
   * @param {string} containerId - Container identifier
   * @returns {Promise<number>} Port when available
   */
  async queuePortRequest(containerId) {
    return new Promise((resolve, reject) => {
      const request = {
        containerId,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.portQueue.push(request);
      console.log(`[Test Runner] ${containerId} queued for port allocation (position ${this.portQueue.length})`);

      // Set timeout to prevent infinite waiting
      setTimeout(() => {
        const index = this.portQueue.findIndex(req => req.containerId === containerId);
        if (index !== -1) {
          this.portQueue.splice(index, 1);
          reject(new Error(`Port allocation timeout for ${containerId} after 60 seconds`));
        }
      }, 60000); // 60 second timeout
    });
  }

  /**
   * Process queued port requests when ports become available
   */
  processPortQueue() {
    if (this.portQueue.length === 0) {
      return;
    }

    if (this.allocatedPorts.size >= this.maxConcurrentInstances) {
      return; // Still at max capacity
    }

    const availablePort = this.findAvailablePort();
    if (!availablePort) {
      return; // No ports available
    }

    // Process next request in queue
    const request = this.portQueue.shift();
    
    // Allocate port to queued request
    this.allocatedPorts.set(availablePort, {
      containerId: request.containerId,
      timestamp: Date.now()
    });

    console.log(`[Test Runner] Port ${availablePort} allocated to queued ${request.containerId} (${this.allocatedPorts.size}/${this.maxConcurrentInstances} instances)`);
    request.resolve(availablePort);
  }

  /**
   * Force cleanup of stale allocations (emergency cleanup)
   * @param {number} maxAgeMs - Maximum age of allocation in milliseconds
   */
  cleanupStaleAllocations(maxAgeMs = 300000) { // 5 minutes default
    const now = Date.now();
    const staleAllocations = [];

    for (const [port, allocation] of this.allocatedPorts) {
      if (now - allocation.timestamp > maxAgeMs) {
        staleAllocations.push({ port, allocation });
      }
    }

    for (const { port, allocation } of staleAllocations) {
      console.warn(`Force releasing stale port ${port} from ${allocation.containerId} (age: ${now - allocation.timestamp}ms)`);
      this.allocatedPorts.delete(port);
    }

    if (staleAllocations.length > 0) {
      this.processPortQueue();
    }

    return staleAllocations.length;
  }

  /**
   * Get all currently allocated ports
   * @returns {number[]} Array of allocated port numbers
   */
  getAllocatedPorts() {
    return Array.from(this.allocatedPorts.keys());
  }

  /**
   * Check if a specific port is available
   * @param {number} port - Port to check
   * @returns {boolean} True if port is available
   */
  isPortAvailable(port) {
    return this.availablePorts.includes(port) && !this.allocatedPorts.has(port);
  }
}