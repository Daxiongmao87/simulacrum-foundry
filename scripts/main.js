console.log('Simulacrum | Main.js loading...');

import { SimulacrumSettings } from "./settings.js";
import { SimulacrumChatModal } from "./chat/simulacrum-chat.js";
import { ToolRegistry } from "./tools/tool-registry.js";

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

let simulacrumChatModal; // Declare globally to be accessible in ready hook
let toolRegistry; // Global tool registry
let aiService; // Global AI service
let contextManager; // Global context manager

Hooks.once('init', () => {
    console.log('Simulacrum | Initializing Simulacrum Module');

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
        simulacrumChatModal = new SimulacrumChatModal();
        ui.simulacrum = simulacrumChatModal;
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
            ui.simulacrum.addDocumentContext(app.document);
            ui.notifications.info(`Added ${app.document.name} to Simulacrum context`);
        });
        
        html.find('.window-title').append(button);
    });
});

console.log('Simulacrum | Setting up hooks...');

// Add Simulacrum button to chat controls
Hooks.on('renderChatLog', (app, html, data) => {
    console.log('Simulacrum | renderChatLog hook fired!');
    
    // Create the button that matches chat control styling
    const simulacrumButton = $(`
        <label class="chat-control-icon simulacrum-chat-control" 
               data-tooltip="Open Simulacrum AI Assistant">
            <i class="fas fa-robot"></i>
        </label>
    `);
    
    // Add click event to open Simulacrum chat
    simulacrumButton.click(ev => {
        ev.preventDefault();
        console.log('Simulacrum | Chat button clicked');
        if (ui.simulacrum) {
            ui.simulacrum.render(true);
        } else {
            console.log('ui.simulacrum not found');
        }
    });
    
    // Add the button to chat controls
    const controlButtons = html.find('.control-buttons');
    controlButtons.prepend(simulacrumButton);
    console.log('Simulacrum | Chat button added');
});

// Add Simulacrum as a top-level scene control (like Token, Measurement, etc.)
Hooks.on('getSceneControlButtons', (controls) => {
    console.log('Simulacrum | getSceneControlButtons hook fired! Controls:', controls);
    
    // Add Simulacrum as its own control group
    controls.push({
        name: "simulacrum",
        title: "Simulacrum AI Assistant", 
        icon: "fas fa-robot",
        layer: "controls",
        tools: [{
            name: "chat",
            title: "Open Simulacrum AI Assistant",
            icon: "fas fa-robot",
            button: true,
            onClick: () => {
                console.log('Simulacrum | Scene control button clicked');
                if (ui.simulacrum) {
                    ui.simulacrum.render(true);
                } else {
                    console.log('ui.simulacrum not found');
                }
            }
        }]
    });
    
    console.log('Simulacrum | Scene control added to controls array', controls);
});

console.log('Simulacrum | Hooks setup complete');

