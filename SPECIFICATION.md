# Simulacrum - FoundryVTT AI Campaign Assistant
## Technical Specification v1.0

### Overview
Simulacrum is a FoundryVTT v12 module that provides Game Masters and Assistant Game Masters with an AI-powered campaign assistant. It combines document CRUD operations, agentic AI interactions, and a professional chat interface to streamline campaign management within FoundryVTT.

### Architecture Synopsis
Simulacrum synthesizes four open-source projects to create a comprehensive AI assistant:

1. **foundry-object-manager**: Dynamic document type discovery and CRUD operations
2. **gemini-cli**: Agentic loop, tool execution, and confirmation system
3. **divination-foundry**: Foundry module structure and AI integration patterns  
4. **fimlib-foundry**: Chat interface foundation and UI components

---

## Core Requirements

### Target Users
- **Primary**: Game Master (World Owner)
- **Secondary**: Assistant Game Master (configurable permission)

### Core Functionality
1. **AI Chat Interface**: Natural language interaction with campaign assistant
2. **Document CRUD Operations**: Create, read, update, delete Foundry documents
3. **Dynamic Tool System**: System-agnostic document type discovery
4. **Agentic Loop**: Multi-step AI task execution with user oversight
5. **Professional UI**: Integrated chat window with Foundry's design language

---

## Technical Architecture

### Module Structure
```
simulacrum/
├── module.json                    # Foundry v12 module manifest
├── scripts/
│   ├── main.js                   # Module initialization and hooks
│   ├── settings.js               # Configuration management
│   ├── chat/
│   │   ├── simulacrum-chat.js    # Extended chat interface
│   │   └── ai-service.js         # AI API integration
│   ├── tools/
│   │   ├── tool-registry.js      # Tool management system
│   │   ├── document-tools.js     # CRUD operation tools
│   │   └── discovery-tools.js    # Document type discovery
│   ├── core/
│   │   ├── tool-scheduler.js     # Tool execution engine
│   │   └── confirmation.js       # User confirmation system
│   └── fimlib/                   # Git submodule
├── templates/
│   ├── simulacrum-chat.html      # Chat interface template
│   └── tool-confirmation.html    # Confirmation dialog template
└── styles/
    └── simulacrum.css            # Module styling
```

### Core Components

#### 1. Document Discovery and CRUD Engine
**Source**: foundry-object-manager patterns

```javascript
class DocumentDiscoveryService {
  /**
   * Dynamically discover all document types in active world/system
   * Maps user-friendly names to Foundry document classes
   */
  async getAvailableTypes() {
    // Check direct collections (Actor, Item, Scene, etc.)
    // Check subtypes via window.CONFIG.*.typeLabels
    // Build comprehensive type mapping
  }
  
  async normalizeDocumentType(userType) {
    // Convert "weapon" -> {collection: "Item", subtype: "weapon"}
    // Convert "character" -> {collection: "Actor", subtype: "character"}
  }
}

class DocumentCRUDService {
  async create(documentType, data, options = {}) {
    // Validate document structure
    // Execute Foundry API calls (Actor.create, Item.create, etc.)
    // Return operation results
  }
  
  async search(documentType, namePattern = null) {
    // Query appropriate collection
    // Filter by subtype if needed
    // Apply name pattern matching
  }
  
  async update(documentType, id, updateData) {
    // Find document by ID
    // Execute update operation
  }
  
  async delete(documentType, id) {
    // Find document by ID  
    // Execute delete operation (if permissions allow)
  }
}
```

#### 2. AI Service Integration
**Source**: divination-foundry patterns

```javascript
class AIService {
  constructor(config) {
    this.apiEndpoint = config.apiEndpoint;
    this.modelName = config.modelName;
    this.contextLength = config.contextLength;
    this.systemPrompt = config.systemPrompt;
  }
  
  async processMessage(userMessage, conversationHistory, availableTools) {
    // Construct API request with system prompt
    // Include tool definitions in request
    // Handle streaming response
    // Parse tool calls from response
    return {
      content: aiResponse,
      toolCalls: extractedToolCalls,
      needsContinuation: shouldContinue
    };
  }
}
```

#### 3. Tool System
**Source**: gemini-cli patterns

```javascript
class FoundryToolRegistry {
  constructor(documentService, config) {
    this.documentService = documentService;
    this.config = config;
    this.tools = new Map();
    this.registerDefaultTools();
  }
  
  registerDefaultTools() {
    this.register(new ListDocumentTypesTool());
    this.register(new CreateDocumentTool());
    this.register(new SearchDocumentsTool());
    this.register(new UpdateDocumentTool());
    this.register(new ReadDocumentTool());
    if (this.config.allowDeletion) {
      this.register(new DeleteDocumentTool());
    }
  }
}

class CreateDocumentTool extends BaseTool {
  get name() { return "create_document"; }
  get description() { return "Create a new Foundry document"; }
  get schema() {
    return {
      type: "object",
      properties: {
        documentType: { type: "string", description: "Type of document to create" },
        data: { type: "object", description: "Document data" }
      }
    };
  }
  
  async shouldConfirmExecute(params) {
    const permission = this.config.getToolPermission(this.name);
    if (permission === 'autoconfirm' || this.config.yoloMode) return false;
    if (permission === 'deny') throw new Error('Tool execution denied');
    
    return {
      title: `Create ${params.documentType}`,
      message: `Creating ${params.documentType}: ${params.data.name}`,
      details: JSON.stringify(params.data, null, 2)
    };
  }
  
  async execute(params, signal, updateOutput) {
    updateOutput(`Creating ${params.documentType}...`);
    const result = await this.documentService.create(
      params.documentType, 
      params.data
    );
    return {
      success: true,
      documentId: result.id,
      documentName: result.name
    };
  }
}
```

#### 4. Tool Execution Engine
**Source**: gemini-cli CoreToolScheduler

```javascript
class SimulacrumToolScheduler {
  constructor(options) {
    this.toolRegistry = options.toolRegistry;
    this.config = options.config;
    this.outputHandler = options.outputHandler;
    this.onComplete = options.onComplete;
  }
  
  async scheduleToolCalls(toolCalls, abortSignal) {
    for (const toolCall of toolCalls) {
      if (abortSignal.aborted) break;
      
      const tool = await this.toolRegistry.getTool(toolCall.function.name);
      const params = JSON.parse(toolCall.function.arguments);
      
      // Check if confirmation needed
      const confirmationDetails = await tool.shouldConfirmExecute(params);
      if (confirmationDetails) {
        const userDecision = await this.requestUserConfirmation(confirmationDetails);
        if (userDecision === 'cancel') continue;
        if (userDecision === 'modify') {
          params = await this.requestUserModification(params);
        }
      }
      
      // Execute tool
      try {
        const result = await tool.execute(params, abortSignal, this.outputHandler);
        this.displayToolResult(toolCall.function.name, result);
      } catch (error) {
        this.displayToolError(toolCall.function.name, error);
      }
    }
    
    this.onComplete();
  }
}
```

#### 5. Chat Interface Extension
**Source**: fimlib-foundry ChatModal

```javascript
class SimulacrumChat extends ChatModal {
  constructor(options) {
    super({
      ...options,
      template: "modules/simulacrum/templates/simulacrum-chat.html",
      title: "Simulacrum - Campaign Assistant"
    });
    
    this.aiService = new AIService(options.config);
    this.toolScheduler = new SimulacrumToolScheduler(options.schedulerOptions);
    this.abortController = null;
  }
  
  async _onSendMessage(html) {
    const input = html.find('textarea.chat-input');
    const message = input.val().trim();
    
    if (!message) return;
    
    // Show user message
    this.addMessage({
      content: message,
      sender: { name: game.user.name, isCurrentUser: true }
    });
    
    // Switch to cancel mode
    this.switchToCancelMode();
    
    try {
      // Get AI response with tool calls
      this.abortController = new AbortController();
      const response = await this.aiService.processMessage(
        message, 
        this.conversationHistory,
        await this.toolScheduler.getAvailableTools()
      );
      
      // Show AI response
      if (response.content) {
        this.addMessage({
          content: response.content,
          sender: { name: "Simulacrum", isCurrentUser: false }
        });
      }
      
      // Execute tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        await this.toolScheduler.scheduleToolCalls(
          response.toolCalls, 
          this.abortController.signal
        );
      }
      
      // Handle continuation
      if (response.needsContinuation) {
        // AI wants to continue working
        this.showContinuationPrompt();
      }
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.displayError(error);
      }
    } finally {
      this.switchToSendMode();
      this.abortController = null;
    }
    
    input.val('');
  }
  
  switchToCancelMode() {
    const button = this.element.find('.send-button');
    button.text('Cancel').removeClass('send').addClass('cancel');
  }
  
  switchToSendMode() {
    const button = this.element.find('.send-button');  
    button.text('Send').removeClass('cancel').addClass('send');
  }
  
  _onCancelExecution() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
```

---

## Configuration System

### Required Settings
**Source**: IDEA.md requirements + divination-foundry patterns

```javascript
// Module settings registration
class SimulacrumSettings {
  static register() {
    game.settings.register('simulacrum', 'apiEndpoint', {
      name: 'OpenAI API Endpoint',
      hint: 'OpenAI-compatible API endpoint (include /v1)',
      scope: 'world',
      config: true,
      type: String,
      default: 'https://api.openai.com/v1'
    });
    
    game.settings.register('simulacrum', 'modelName', {
      name: 'Model Name',
      hint: 'AI model to use for conversations',
      scope: 'world', 
      config: true,
      type: String,
      default: 'gpt-4'
    });
    
    game.settings.register('simulacrum', 'contextLength', {
      name: 'Context Length',
      hint: 'Maximum context window size',
      scope: 'world',
      config: true, 
      type: Number,
      default: 32000
    });
    
    game.settings.register('simulacrum', 'allowDeletion', {
      name: 'Allow Deletion',
      hint: 'Enable document deletion tools',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });
    
    game.settings.register('simulacrum', 'allowAssistantGM', {
      name: 'Allow Assistant GM Usage',
      hint: 'Allow Assistant GM users to access Simulacrum',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });
    
    game.settings.register('simulacrum', 'systemPrompt', {
      name: 'System Prompt',
      hint: 'Additional system prompt (appended to core prompt)',
      scope: 'world',
      config: true,
      type: String,
      default: ''
    });
    
    game.settings.register('simulacrum', 'toolPermissions', {
      name: 'Tool Permissions',
      hint: 'Per-tool permission settings',
      scope: 'world',
      config: true,
      type: Object,
      default: {
        'list_document_types': 'allow',
        'search_documents': 'allow', 
        'read_document': 'allow',
        'create_document': 'allow',
        'update_document': 'allow',
        'delete_document': 'deny'
      }
    });
    
    game.settings.register('simulacrum', 'yoloMode', {
      name: 'YOLO Mode',
      hint: 'Automatically accept all tool confirmations',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });
  }
}
```

### Permission System
```javascript
class PermissionService {
  static canUseSimulacrum(user) {
    if (user.role === CONST.USER_ROLES.GAMEMASTER) return true;
    if (user.role === CONST.USER_ROLES.ASSISTANT) {
      return game.settings.get('simulacrum', 'allowAssistantGM');
    }
    return false;
  }
  
  static getToolPermission(toolName) {
    const permissions = game.settings.get('simulacrum', 'toolPermissions');
    return permissions[toolName] || 'allow';
  }
}
```

---

## User Interface Specifications

### Chat Interface
**Source**: fimlib-foundry + enhancements

- **Base**: FIMLib ChatModal with Foundry Application styling
- **Messages**: Support markdown rendering for AI responses
- **Tool Displays**: Show tool executions with collapsible details
- **Status Indicators**: Processing, waiting, error states
- **Cancel Button**: Transform send button during AI processing

### Tool Confirmation Dialogs
**Source**: gemini-cli confirmation system

- **Confirmation Types**: Info, warning, error based on tool impact
- **User Options**: 
  - "Yes, once" - Execute this time only
  - "Yes, always" - Auto-approve this tool type
  - "Cancel" - Skip this tool
  - "Modify" - Edit parameters before execution
- **Details View**: Expandable JSON view of tool parameters
- **Preview**: Show expected changes where possible

### Settings Interface
**Source**: divination-foundry settings patterns

- **Standard Foundry Settings**: Integrated with module settings UI
- **Tool Permissions Grid**: Visual matrix for tool permissions
- **API Test**: Connection testing functionality
- **Import/Export**: Configuration backup and restore

---

## Integration Points

### Foundry VTT Hooks
```javascript
// Module initialization
Hooks.once('init', () => {
  SimulacrumSettings.register();
  registerGlobals('Simulacrum');
});

Hooks.once('ready', () => {
  if (PermissionService.canUseSimulacrum(game.user)) {
    ui.simulacrum = new SimulacrumChat(getSimulacrumConfig());
  }
});

// Add to scene controls
Hooks.on('getSceneControlButtons', (controls) => {
  if (PermissionService.canUseSimulacrum(game.user)) {
    controls.find(c => c.name === 'token').tools.push({
      name: 'simulacrum',
      title: 'Simulacrum Assistant', 
      icon: 'fas fa-robot',
      onClick: () => ui.simulacrum.render(true)
    });
  }
});
```

### Document Context Integration
```javascript
// Add context buttons to document sheets
Hooks.on('renderActorSheet', (sheet, html) => {
  if (PermissionService.canUseSimulacrum(game.user)) {
    const button = $(`<button class="simulacrum-context">
      <i class="fas fa-robot"></i> Add to Simulacrum Context
    </button>`);
    
    button.on('click', () => {
      ui.simulacrum.addDocumentContext(sheet.document);
      ui.simulacrum.render(true);
    });
    
    html.find('.window-title').append(button);
  }
});
```

---

## Core Tool Definitions

### Document CRUD Tools
**Source**: foundry-object-manager operations

1. **list_document_types**
   - Description: List all available document types in current system
   - Parameters: None
   - Returns: Array of document types with descriptions

2. **search_documents**  
   - Description: Search for documents by type and name pattern
   - Parameters: documentType, namePattern (optional)
   - Returns: Array of matching documents

3. **read_document**
   - Description: Retrieve full document data by ID
   - Parameters: documentType, documentId
   - Returns: Complete document object

4. **create_document**
   - Description: Create a new document
   - Parameters: documentType, documentData
   - Returns: Created document ID and summary
   - **Requires Confirmation**: Yes (unless yolo mode)

5. **update_document**
   - Description: Update existing document
   - Parameters: documentType, documentId, updateData
   - Returns: Update confirmation and summary  
   - **Requires Confirmation**: Yes (unless yolo mode)

6. **delete_document**
   - Description: Delete a document
   - Parameters: documentType, documentId
   - Returns: Deletion confirmation
   - **Requires Confirmation**: Yes (always, unless yolo mode)
   - **Requires Setting**: allowDeletion must be true

### Context Management Tools

7. **add_document_context**
   - Description: Add document to conversation context
   - Parameters: documentType, documentId
   - Returns: Context addition confirmation

8. **list_context**
   - Description: Show current conversation context
   - Parameters: None
   - Returns: Array of context items

9. **clear_context**
   - Description: Clear conversation context
   - Parameters: None
   - Returns: Context clear confirmation

---

## Success Metrics

### Functional Requirements
- [ ] GM/Assistant GM can open Simulacrum chat interface
- [ ] AI responds to natural language queries about campaign
- [ ] Dynamic discovery of document types works across game systems
- [ ] CRUD operations execute correctly on all document types
- [ ] Tool confirmations display proper details and options
- [ ] YOLO mode bypasses all confirmations appropriately
- [ ] Permission system restricts access correctly
- [ ] Configuration options work as specified

### Technical Requirements  
- [ ] Module loads without errors in Foundry v12
- [ ] FIMLib submodule integrates correctly
- [ ] No conflicts with other modules
- [ ] Proper error handling and user feedback
- [ ] Memory usage remains reasonable during long conversations
- [ ] Tool execution can be cancelled mid-operation
- [ ] Context management works across sessions

### User Experience Requirements
- [ ] Interface feels native to Foundry VTT
- [ ] Response times are acceptable (< 30s per AI response)
- [ ] Tool confirmations are clear and informative
- [ ] Error messages are helpful and actionable
- [ ] Settings are easy to configure
- [ ] Documentation is comprehensive and clear

---

## Implementation Priorities

### Phase 1: Core Foundation
1. Module structure and basic Foundry integration
2. FIMLib submodule integration
3. Basic settings system
4. Permission checks

### Phase 2: Document System
1. Document discovery service
2. Basic CRUD tools (list, search, read)
3. Tool registry and basic execution

### Phase 3: AI Integration  
1. AI service with OpenAI compatibility
2. Tool call parsing and execution
3. Basic chat interface with tool display

### Phase 4: Advanced Features
1. Tool confirmation system
2. YOLO mode implementation  
3. Context management
4. Advanced tool features (update, delete)

### Phase 5: Polish and Testing
1. Error handling and edge cases
2. Performance optimization
3. Documentation and examples
4. Cross-system compatibility testing

---

This specification provides a comprehensive roadmap for implementing Simulacrum by synthesizing the proven patterns from all four reference repositories while meeting every requirement specified in IDEA.md.