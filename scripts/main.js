console.log('Simulacrum | Main.js loading...');

import { SimulacrumSettings } from "./settings.js";
import { SimulacrumChatModal } from "./chat/simulacrum-chat.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { ChatModal } from "./fimlib/main.js";

// Import all tools
import { CreateDocumentTool } from "./tools/create-document.js";
import { ReadDocumentTool } from "./tools/read-document.js";
import { UpdateDocumentTool } from "./tools/update-document.js";
import { DeleteDocumentTool } from "./tools/delete-document.js";
import { ListDocumentsTool } from "./tools/list-documents.js";
import { SearchDocumentsTool } from "./tools/search-documents.js";
import { GetWorldInfoTool } from "./tools/get-world-info.js";
import { GetSceneInfoTool }m from "./tools/get-scene-info.js";
import { GetUserPreferencesTool } from "./tools/get-user-preferences.js";
import { AddDocumentContextTool } from "./tools/add-document-context.js";
import { ListContextTool } from "./tools/list-context.js";
import { ClearContextTool } from "./tools/clear-context.js";
import { SimulacrumAIService } from "./chat/ai-service.js";
import { ContextManager } from "./context-manager.js";
import { setupGlobalErrorHandling } from "./error-handling.js";
import "./tool-test.js"; // Load testing functions


let toolRegistry; // Global tool registry
let aiService; // Global AI service
let contextManager; // Global context manager

// Connection state tracking
let SimulacrumChatModalClass = null;

// Connection state tracking
let connectionState = 'checking'; // disabled, checking, inaccessible, accessible
let connectionCheckIntervalId = null;
let isSimulacrumConfigured = false;

/**
 * Checks the accessibility of the configured API endpoint.
 * Updates the connectionState and triggers a UI re-render.
 */
async function checkEndpointAccessibility() {
    console.log('Simulacrum | Checking API endpoint accessibility...');
    const apiEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
    
    if (!apiEndpoint || apiEndpoint.trim() === '') {
        connectionState = 'disabled';
        isSimulacrumConfigured = false;
        console.log('Simulacrum | API endpoint not configured.');
        ui.notifications.info('Simulacrum | API endpoint not configured. Please set it in module settings.');
    } else {
        isSimulacrumConfigured = true;
        connectionState = 'checking';
        // Force a re-render to show 'checking' state immediately
        ui.controls.render(); 

        try {
            // Use a timeout for the fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            const response = await fetch(apiEndpoint, {
                method: 'GET', // Using GET as HEAD might not be supported by all OpenAI-compatible endpoints
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                connectionState = 'accessible';
                console.log('Simulacrum | API endpoint is accessible.');
                // ui.notifications.info('Simulacrum | API endpoint is accessible.');
            } else {
                connectionState = 'inaccessible';
                console.warn(`Simulacrum | API endpoint returned status: ${response.status}`);
                ui.notifications.warn(`Simulacrum | API endpoint inaccessible (Status: ${response.status}). Check console for details.`);
            }
        } catch (error) {
            connectionState = 'inaccessible';
            console.error('Simulacrum | Error checking API endpoint accessibility:', error);
            if (error.name === 'AbortError') {
                ui.notifications.error('Simulacrum | API endpoint check timed out.');
            } else {
                ui.notifications.error(`Simulacrum | API endpoint inaccessible: ${error.message}. Check console for details.`);
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
    console.log('Simulacrum | Initializing Simulacrum Module');
    
    // Extend the ChatModal class with our own version that has the correct template path
    SimulacrumChatModalClass = class extends ChatModal {
        static get defaultOptions() {
            const options = super.defaultOptions;
            options.template = "modules/simulacrum/scripts/fimlib/templates/chat-modal.html";
            return options;
        }
    };

    // Register module settings
    SimulacrumSettings.register();

    // Chat modal class is now imported from separate file

    // Initialize and register all tools
    toolRegistry = new ToolRegistry();
    
    try {
        // Register all 12 core tools (9 original + 3 context tools)
        toolRegistry.registerTool(new CreateDocumentTool());
        toolRegistry.registerTool(new ReadDocumentTool());
        toolRegistry.registerTool(new UpdateDocumentTool());
        toolRegistry.registerTool(new DeleteDocumentTool());
        toolRegistry.registerTool(new ListDocumentsTool());
        toolRegistry.registerTool(new SearchDocumentsTool());
        toolRegistry.registerTool(new GetWorldInfoTool());
        toolRegistry.registerTool(new GetSceneInfoTool());
        toolRegistry.registerTool(new GetUserPreferencesTool());
        toolRegistry.registerTool(new AddDocumentContextTool());
        toolRegistry.registerTool(new ListContextTool());
        toolRegistry.registerTool(new ClearContextTool());
        
        console.log('Simulacrum | All 12 core tools registered successfully');
        
        // Initialize context manager
        contextManager = new ContextManager();
        
        // Initialize AI service
        aiService = new SimulacrumAIService(toolRegistry);

        // Make tool registry, AI service, and context manager globally accessible
        game.simulacrum = { toolRegistry, aiService, contextManager };
        
    } catch (error) {
        console.error('Simulacrum | Failed to register tools:', error);
        ui.notifications.error('Simulacrum | Tool registration failed. Check console for details.');
    }

    console.log('Simulacrum | Settings, ChatModal, and Tools registered.');
});

Hooks.once('ready', () => {
    console.log('Simulacrum | Simulacrum Module Ready');

    // Only instantiate chat UI if user has permission
    if (SimulacrumSettings.hasSimulacrumPermission(game.user)) {
        ui.simulacrum = new SimulacrumChatModal();
    } else {
        ui.notifications.warn("Simulacrum | You do not have permission to access Simulacrum.");
    }

    // Initial check for API endpoint accessibility
    checkEndpointAccessibility();

    // Set up periodic check for API endpoint accessibility (e.g., every 30 seconds)
    connectionCheckIntervalId = setInterval(checkEndpointAccessibility, 30000); // 30 seconds

    // Re-check accessibility when settings are closed (in case API endpoint changed)
    Hooks.on('closeSettingsConfig', () => {
        console.log('Simulacrum | Settings config closed, re-checking API endpoint.');
        checkEndpointAccessibility();
    });

    // Hook for adding robot context buttons to document sheets
    Hooks.on('renderDocumentSheet', (app, html, data) => {
        if (!SimulacrumSettings.hasSimulacrumPermission(game.user)) return;
        
        const button = $(`<a class="simulacrum-context" title="Add to Simulacrum Context">
            <i class="fas fa-hat-wizard"></i>
        </a>`);
        
        button.on('click', () => {
            ui.simulacrum.render(true);
        });
        
        html.find('.window-title').append(button);
    });
});


// Manually inject Simulacrum button as first item in scene controls tablist
Hooks.on('renderSceneControls', (app, html, data) => {
    console.log('Simulacrum | renderSceneControls hook fired');
    
    // Only add if user has permission
    if (!SimulacrumSettings.hasSimulacrumPermission(game.user)) {
        console.log('Simulacrum | User lacks permission for scene control');
        return;
    }
    
    // Check if we already added the button to avoid duplicates
    let simulacrumButton = html.find('.scene-control[data-control="simulacrum"]');
    if (simulacrumButton.length > 0) {
        console.log('Simulacrum | Button already exists, updating state');
        // Update existing button's state
        updateSimulacrumButtonState(simulacrumButton);
        return;
    }
    
    // Find the main controls tablist
    const tablist = html.find('ol.main-controls[role="tablist"]');
    
    if (tablist.length) {
        console.log('Simulacrum | Found main-controls tablist, injecting button');
        
        // Create the Simulacrum button matching the exact HTML structure
        simulacrumButton = $(`
            <li class="scene-control" 
                data-control="simulacrum" 
                data-canvas-layer="controls" 
                aria-label="Simulacrum AI Assistant" 
                role="tab" 
                aria-controls="tools-panel-simulacrum">
                <i class="fas fa-hat-wizard"></i>
            </li>
        `);
        
        // Add click handler for direct chat opening
        simulacrumButton.on('click', (event) => {
            console.log('Simulacrum | Direct button clicked');
            event.preventDefault();
            event.stopPropagation();
            
            // Only open if not disabled
            if (connectionState !== 'disabled') {
                ui.simulacrum.render(true);
            } else {
                ui.notifications.warn('Simulacrum | Cannot open. API endpoint not configured.');
            }
            
            return false;
        });
        
        // Append as the last item in the tablist
        tablist.append(simulacrumButton);
        
        console.log('Simulacrum | Button injected as scene control');

        // Update the newly injected button's state
        updateSimulacrumButtonState(simulacrumButton);

    } else {
        console.log('Simulacrum | Could not find main-controls tablist');
    }
});

/**
 * Updates the visual state and tooltip of the Simulacrum scene control button.
 * @param {jQuery} buttonElement - The jQuery object for the Simulacrum button.
 */
function updateSimulacrumButtonState(buttonElement) {
    let tooltip = 'Simulacrum AI Assistant';
    let classes = ['scene-control'];

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
                classes.push('simulacrum-mithril');
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

console.log('Simulacrum | Hooks setup complete');
