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
import { GetSceneInfoTool } from "./tools/get-scene-info.js";
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

// Global variable to store our extended ChatModal class
let SimulacrumChatModalClass = null;

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

    // Hook for adding robot context buttons to document sheets
    Hooks.on('renderDocumentSheet', (app, html, data) => {
        if (!SimulacrumSettings.hasSimulacrumPermission(game.user)) return;
        
        const button = $(`<a class="simulacrum-context" title="Add to Simulacrum Context">
            <i class="fas fa-robot"></i>
        </a>`);
        
        button.on('click', () => {
            ui.simulacrum.render(true);
        });
        
        html.find('.window-title').append(button);
    });
});

console.log('Simulacrum | Setting up hooks...');


// Manually inject Simulacrum button as first item in scene controls tablist
Hooks.on('renderSceneControls', (app, html, data) => {
    console.log('Simulacrum | renderSceneControls hook fired');
    
    // Only add if user has permission
    if (!SimulacrumSettings.hasSimulacrumPermission(game.user)) {
        console.log('Simulacrum | User lacks permission for scene control');
        return;
    }
    
    // Check if we already added the button to avoid duplicates
    if (html.find('.scene-control[data-control="simulacrum"]').length > 0) {
        console.log('Simulacrum | Button already exists, skipping');
        return;
    }
    
    // Find the main controls tablist
    const tablist = html.find('ol.main-controls[role="tablist"]');
    
    if (tablist.length) {
        console.log('Simulacrum | Found main-controls tablist, injecting button');
        
        // Create the Simulacrum button matching the exact HTML structure
        const simulacrumButton = $(`
            <li class="scene-control" 
                data-control="simulacrum" 
                data-canvas-layer="controls" 
                aria-label="Simulacrum AI Assistant" 
                role="tab" 
                aria-controls="tools-panel-simulacrum" 
                data-tooltip="Simulacrum AI Assistant">
                <i class="fas fa-robot"></i>
            </li>
        `);
        
        // Add click handler for direct chat opening
        simulacrumButton.on('click', (event) => {
            console.log('Simulacrum | Direct button clicked');
            event.preventDefault();
            event.stopPropagation();
            
            ui.simulacrum.render(true);
            
            return false;
        });
        
        // Append as the last item in the tablist
        tablist.append(simulacrumButton);
        
        console.log('Simulacrum | Button injected as first scene control');
    } else {
        console.log('Simulacrum | Could not find main-controls tablist');
    }
});

console.log('Simulacrum | Hooks setup complete');

