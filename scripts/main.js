import { SimulacrumSettings } from './settings.js';
import { SimulacrumChatModal } from './chat/simulacrum-chat.js';
import { ToolRegistry } from './tools/tool-registry.js';
import { ChatModal } from './fimlib/main.js';
import { DocumentDiscoveryEngine } from './core/document-discovery-engine.js';
import { GenericCRUDTools } from './core/generic-crud-tools.js';
import { registerDynamicSchemaModifier } from './core/dynamic-schema-modifier.js';

// Import all tools
import {
  CreateDocumentTool,
  ReadDocumentTool,
  UpdateDocumentTool,
  DeleteDocumentTool,
} from './tools/crud-tools.js';
import { ListDocumentsTool } from './tools/list-documents.js';
import { SearchDocumentsTool } from './tools/search-documents.js';
import { GetWorldInfoTool } from './tools/get-world-info.js';
import { GetSceneInfoTool } from './tools/get-scene-info.js';
import { GetUserPreferencesTool } from './tools/get-user-preferences.js';
import { AddDocumentContextTool } from './tools/add-document-context.js';
import { ListContextTool } from './tools/list-context.js';
import { ClearContextTool } from './tools/clear-context.js';
import { ListImagesTool } from './tools/list-images.js';
import { SimulacrumAIService } from './chat/ai-service.js';
import { ContextManager } from './context-manager.js';
// import { setupGlobalErrorHandling } from "./error-handling.js"; // Currently unused
// import './tool-test.js'; // Load testing functions - file doesn't exist
import { AgenticLoopController } from './core/agentic-loop-controller.js';
import { SimulacrumToolScheduler } from './core/tool-scheduler.js';
import { TokenTracker, formatToolResultsForAI } from './core/token-tracker.js';
import {
  showProgress,
  showProgressWithOptions,
  updateProgressText,
  createProgressContainer,
} from './core/progress-animation.js';
import { ContextCompaction } from './core/context-compaction.js';
import { ContextWindowDetector } from './core/context-window-detector.js';
import { DynamicContextWindowSetting } from './ui/dynamic-context-window-setting.js';
import { ModelDetector } from './core/model-detector.js';
import { DynamicModelSelector } from './ui/dynamic-model-selector.js';

let toolRegistry; // Global tool registry
let aiService; // Global AI service
let contextManager; // Global context manager

// Connection state tracking
let SimulacrumChatModalClass = null;

// Connection state tracking
let connectionState = 'checking'; // disabled, checking, inaccessible, accessible
let isSimulacrumConfigured = false;

/**
 * Checks the accessibility of the configured API endpoint.
 * Updates the connectionState and triggers a UI re-render.
 */
async function checkEndpointAccessibility() {
  let apiEndpoint;
  try {
    apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
  } catch (error) {
    console.warn(
      'Simulacrum | Could not retrieve API endpoint setting:',
      error
    );
    connectionState = 'disabled';
    isSimulacrumConfigured = false;
    ui.controls.render();
    return;
  }

  if (!apiEndpoint || apiEndpoint.trim() === '') {
    connectionState = 'disabled';
    isSimulacrumConfigured = false;
  } else {
    isSimulacrumConfigured = true;
    connectionState = 'checking';
    // Force a re-render to show 'checking' state immediately
    ui.controls.render();

    try {
      // Use a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${apiEndpoint}/chat/completions`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok || response.status === 405) {
        // 405 Method Not Allowed is fine - means server is responding
        connectionState = 'accessible';
      } else {
        connectionState = 'inaccessible';
        console.warn(
          `Simulacrum | API endpoint returned status: ${response.status}`
        );
        ui.notifications.warn(
          `Simulacrum | API endpoint inaccessible (Status: ${response.status}). Check console for details.`
        );
      }
    } catch (error) {
      connectionState = 'inaccessible';
      console.error(
        'Simulacrum | Error checking API endpoint accessibility:',
        error
      );
      if (error.name === 'AbortError') {
        ui.notifications.error('Simulacrum | API endpoint check timed out.');
      } else {
        ui.notifications.error(
          `Simulacrum | API endpoint inaccessible: ${error.message}. Check console for details.`
        );
      }
    }
  }
  // Always trigger a re-render after state change
  ui.controls.render();
}

/**
 * Returns the correct ChatModal class for Simulacrum
 * @returns {Class} - The ChatModal class to use
 */
export function getChatModalClass() {
  return SimulacrumChatModalClass || ChatModal;
}

Hooks.once('init', () => {
  // Extend the ChatModal class with our own version that has the correct template path
  SimulacrumChatModalClass = class extends ChatModal {
    static get defaultOptions() {
      const options = super.defaultOptions;
      options.template =
        'modules/simulacrum/scripts/fimlib/templates/chat-modal.html';
      return options;
    }
  };

  // Register module settings
  SimulacrumSettings.register();

  // Chat modal class is now imported from separate file

  // Initialize and register all tools
  toolRegistry = new ToolRegistry();

  try {
    // Initialize context manager
    contextManager = new ContextManager();

    // Initialize document discovery engine
    const documentDiscoveryEngine = new DocumentDiscoveryEngine();

    // Initialize AI service first (needed for GenericCRUDTools validation error recovery)
    aiService = new SimulacrumAIService(toolRegistry);

    // Initialize generic CRUD tools with AI service
    const genericCrudTools = new GenericCRUDTools(
      documentDiscoveryEngine,
      aiService
    );

    // Register all core tools
    toolRegistry.registerTool(new CreateDocumentTool(genericCrudTools));
    toolRegistry.registerTool(new ReadDocumentTool(genericCrudTools));
    toolRegistry.registerTool(new UpdateDocumentTool(genericCrudTools));
    toolRegistry.registerTool(new DeleteDocumentTool(genericCrudTools));
    toolRegistry.registerTool(new ListDocumentsTool());
    toolRegistry.registerTool(new SearchDocumentsTool());
    toolRegistry.registerTool(new GetWorldInfoTool());
    toolRegistry.registerTool(new GetSceneInfoTool());
    toolRegistry.registerTool(new GetUserPreferencesTool());
    toolRegistry.registerTool(new AddDocumentContextTool());
    toolRegistry.registerTool(new ListContextTool());
    toolRegistry.registerTool(new ClearContextTool());
    toolRegistry.registerTool(new ListImagesTool());

    // Initialize Tool Scheduler
    const toolScheduler = new SimulacrumToolScheduler(toolRegistry);

    // Initialize Agentic Loop Controller
    const agenticLoopController = new AgenticLoopController(
      aiService,
      toolScheduler
    );

    // Initialize Dynamic Context Window Setting
    const dynamicContextWindowSetting = new DynamicContextWindowSetting();
    dynamicContextWindowSetting.initialize();

    // Initialize Dynamic Model Selector
    const dynamicModelSelector = new DynamicModelSelector();
    dynamicModelSelector.initialize();

    // Make tool registry, AI service, context manager, document discovery engine, generic CRUD tools, and agentic loop controller globally accessible
    game.simulacrum = {
      toolRegistry,
      aiService,
      contextManager,
      documentDiscoveryEngine,
      genericCrudTools,
      agenticLoopController,
      TokenTracker,
      formatToolResultsForAI,
      showProgress,
      showProgressWithOptions,
      updateProgressText,
      createProgressContainer,
      ContextCompaction,
      ContextWindowDetector,
      DynamicContextWindowSetting,
      dynamicContextWindowSetting,
      ModelDetector,
      DynamicModelSelector,
      dynamicModelSelector,
      // Initialization state for testing
      _initState: {
        initComplete: true,
        readyComplete: false,
        initTimestamp: Date.now(),
      },
    };
  } catch (error) {
    console.error('Simulacrum | Failed to register tools:', error);
    ui.notifications.error(
      'Simulacrum | Tool registration failed. Check console for details.'
    );
  }
});

Hooks.once('ready', async () => {
  // Update initialization state
  if (game.simulacrum && game.simulacrum._initState) {
    game.simulacrum._initState.readyComplete = true;
    game.simulacrum._initState.readyTimestamp = Date.now();
  }

  // Initialize dynamic schema modifier for image validation (now that game.collections is populated)
  registerDynamicSchemaModifier(game.simulacrum.documentDiscoveryEngine);

  // Fetch models now that game is ready
  await SimulacrumSettings.fetchModelsAndContextWindows();

  // Only instantiate chat UI if user has permission
  if (SimulacrumSettings.hasSimulacrumPermission(game.user)) {
    ui.simulacrum = new SimulacrumChatModal();
  } else {
    ui.notifications.warn(
      'Simulacrum | You do not have permission to access Simulacrum.'
    );
  }

  // Initial check for API endpoint accessibility
  checkEndpointAccessibility();

  // Set up periodic check for API endpoint accessibility (e.g., every 30 seconds)
  setInterval(checkEndpointAccessibility, 30000); // 30 seconds

  // Re-check accessibility when settings are closed (in case API endpoint changed)
  Hooks.on('closeSettingsConfig', () => {
    checkEndpointAccessibility();
  });

  // Hook for adding robot context buttons to document sheets
  Hooks.on('renderDocumentSheet', (app, html, _data) => {
    if (!SimulacrumSettings.hasSimulacrumPermission(game.user)) {
      return;
    }

    const button =
      $(`<a class="simulacrum-context" title="Add to Simulacrum Context">
            <i class="fas fa-hat-wizard"></i>
        </a>`);

    button.on('click', () => {
      ui.simulacrum.render(true);
    });

    html.find('.window-title').append(button);
  });
});

// Manually inject Simulacrum button as first item in scene controls tablist
Hooks.on('renderSceneControls', (app, html, _data) => {
  // Only add if user has permission
  try {
    const hasPermission = SimulacrumSettings.hasSimulacrumPermission(game.user);
    if (!hasPermission) {
      return;
    }
  } catch (e) {
    console.error(
      'Simulacrum | Error checking permission:',
      e.message,
      e.stack
    );
    throw e;
  }

  // Ensure html is a jQuery object
  if (!html || typeof html.find !== 'function') {
    html = $(html);
    // If still no find method, the html is likely invalid
    if (typeof html.find !== 'function') {
      return;
    }
  }

  let simulacrumButton = html.find('.scene-control[data-control="simulacrum"]');
  if (simulacrumButton.length > 0) {
    // Update existing button's state
    updateSimulacrumButtonState(simulacrumButton);
    return;
  }

  // Find the main controls tablist
  const tablist = html.find('ol.main-controls[role="tablist"]');

  if (tablist.length) {
    // Create the Simulacrum button matching the exact HTML structure
    simulacrumButton = $(`
            <li class="scene-control" 
                data-control="simulacrum" 
                data-canvas-layer="controls" 
                aria-label="Simulacrum AI Assistant" 
                role="tab" 
                aria-controls="tools-panel-simulacrum">
                <i class="fas fa-hand-sparkles"></i>
            </li>
        `);

    // Add click handler for direct chat opening
    simulacrumButton.on('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      // Only open if not disabled and ui.simulacrum exists
      if (connectionState !== 'disabled' && ui.simulacrum) {
        ui.simulacrum.render(true);
      } else if (!ui.simulacrum) {
        ui.notifications.warn(
          'Simulacrum | Chat interface not available. Check permissions.'
        );
      } else {
        ui.notifications.warn(
          'Simulacrum | Cannot open. API endpoint not configured.'
        );
      }

      return false;
    });

    // Append as the last item in the tablist
    tablist.append(simulacrumButton);

    // Update the newly injected button's state
    updateSimulacrumButtonState(simulacrumButton);
  }
});

/**
 * Updates the visual state and tooltip of the Simulacrum scene control button.
 * @param {jQuery} buttonElement - The jQuery object for the Simulacrum button.
 */
function updateSimulacrumButtonState(buttonElement) {
  let tooltip = 'Simulacrum AI Assistant';
  const classes = ['scene-control'];

  if (!isSimulacrumConfigured) {
    classes.push('simulacrum-disabled');
    tooltip = 'Simulacrum: Not Configured';
  } else {
    switch (connectionState) {
      case 'checking':
        classes.push('simulacrum-yellow');
        tooltip = 'Simulacrum: Checking Connection...';
        break;
      case 'inaccessible':
        classes.push('simulacrum-red');
        tooltip = 'Simulacrum: Endpoint Inaccessible';
        break;
      case 'accessible':
        classes.push('simulacrum-yellow');
        tooltip = 'Simulacrum: Endpoint Accessible';
        break;
      default:
        // Fallback for 'unknown' or other states
        classes.push('simulacrum-disabled');
        tooltip = 'Simulacrum: Status Unknown';
        break;
    }
  }

  buttonElement.attr('data-tooltip', tooltip);
  buttonElement.attr('class', classes.join(' ')); // Set all classes

  // Ensure the icon is correct (it should already be fa-hat-wizard from initial creation)
  buttonElement.find('i').removeClass().addClass('fas fa-hat-wizard');
}
