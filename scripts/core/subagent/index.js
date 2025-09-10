/**
 * SubAgent Architecture - Main Export
 * Provides clean API access to the SubAgent system
 */

export { SubAgentArchitecture } from './subagent-architecture.js';
export { SubAgentExecutor } from './subagent-executor.js';
export { ContextStateManager } from './context-state-manager.js';
export { TerminationController } from './termination-controller.js';
export { ResourceManager } from './resource-manager.js';
export { CompatibilityBridge } from './compatibility-bridge.js';
export { ISubAgent, SubAgentScope } from './interfaces.js';

// Default export for convenience
export { SubAgentArchitecture as default } from './subagent-architecture.js';