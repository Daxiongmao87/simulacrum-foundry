/**
 * Workflow Standardization - Module Index
 * Main entry point for workflow standardization system
 */

import WorkflowStandardization from './workflow-standardization.js';
import WorkflowEngine from './workflow-engine.js';
import MVPDecomposer from './mvp-decomposer.js';
import ValidationController from './validation-controller.js';
import TemplateManager from './template-manager.js';
import DependencyTracker from './dependency-tracker.js';

import {
  IWorkflowStandardization,
  TaskSpec,
  WorkflowTemplate,
  WorkflowInstance,
  ValidationCheckpoint,
  ExecutionPlan,
  CompletionCriteria,
  CompletionReport,
  ValidationCriteria
} from './interfaces.js';

export {
  // Main orchestration class
  WorkflowStandardization,
  
  // Core components
  WorkflowEngine,
  MVPDecomposer,
  ValidationController,
  TemplateManager,
  DependencyTracker,
  
  // Interfaces and types
  IWorkflowStandardization,
  TaskSpec,
  WorkflowTemplate,
  WorkflowInstance,
  ValidationCheckpoint,
  ExecutionPlan,
  CompletionCriteria,
  CompletionReport,
  ValidationCriteria
};

export default WorkflowStandardization;