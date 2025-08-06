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

    // Add a hook for scene controls (placeholder for future buttons)
    Hooks.on('renderSceneControls', (controls) => {
        if (!SimulacrumSettings.hasSimulacrumPermission(game.user)) {
            return;
        }
        // Example: Add a button to scene controls if needed
        // controls.add({
        //     name: "simulacrum",
        //     title: "Simulacrum Chat",
        //     icon: "fas fa-robot",
        //     button: true,
        //     onClick: () => ui.simulacrum.render(true)
        // });
    });

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

