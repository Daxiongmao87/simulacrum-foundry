/**
 * Communication Enhancement - Module Index
 * Main entry point for communication enhancement system
 */

import CommunicationEnhancement from './communication-enhancement.js';
import ResponseFormatter from './response-formatter.js';
import ProgressReporter from './progress-reporter.js';
import CollaborationEngine from './collaboration-engine.js';
import ContextAnalyzer from './context-analyzer.js';
import HandoffManager from './handoff-manager.js';

import {
  ICommunicationEnhancement,
  TaskResults,
  CommunicationContext,
  ProgressData,
  FormattedResponse,
  ProgressMilestone,
  ProgressReport,
  HandoffInstructions,
  HandoffProtocol
} from './interfaces.js';

export {
  // Main orchestration class
  CommunicationEnhancement,
  
  // Core components
  ResponseFormatter,
  ProgressReporter,
  CollaborationEngine,
  ContextAnalyzer,
  HandoffManager,
  
  // Interfaces and types
  ICommunicationEnhancement,
  TaskResults,
  CommunicationContext,
  ProgressData,
  FormattedResponse,
  ProgressMilestone,
  ProgressReport,
  HandoffInstructions,
  HandoffProtocol
};

export default CommunicationEnhancement;