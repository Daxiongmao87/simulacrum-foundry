# Simulacrum Architecture Overview

> Last updated: December 2024 (Phase 4 complete)

## System Architecture Diagram

```mermaid
flowchart TB
    subgraph UI["UI Layer"]
        SST["SimulacrumSidebarTab<br/>scripts/ui/simulacrum-sidebar-tab.js"]
        CH["ChatHandler<br/>scripts/core/chat-handler.js"]
        SSS["SidebarStateSyncer<br/>scripts/ui/sidebar-state-syncer.js"]
    end

    subgraph Core["Core Layer"]
        SC["SimulacrumCore<br/>scripts/core/simulacrum-core.js"]
        CE["ConversationEngine<br/>scripts/core/conversation-engine.js"]
        TLH["ToolLoopHandler<br/>scripts/core/tool-loop-handler.js"]
        CM["ConversationManager<br/>scripts/core/conversation.js"]
        TR["ToolRegistry<br/>scripts/core/tool-registry.js"]
        HM["HookManager<br/>scripts/core/hook-manager.js"]
    end

    subgraph AI["AI Client Layer"]
        AIC["AIClient<br/>scripts/core/ai-client.js"]
        SPB["SystemPromptBuilder<br/>scripts/core/system-prompt-builder.js"]
        
        subgraph Providers["scripts/core/providers/"]
            BP["AIProvider<br/>base-provider.js"]
            OP["OpenAIProvider<br/>openai-provider.js"]
            GP["GeminiProvider<br/>gemini-provider.js"]
            MP["MockAIProvider<br/>mock-provider.js"]
        end
    end

    subgraph Documents["Document Layer"]
        DA["DocumentAPI<br/>scripts/core/document-api.js"]
    end

    subgraph Tools["Tool Layer - scripts/tools/"]
        BT["BaseTool<br/>base-tool.js"]
        DC["DocumentCreateTool"]
        DR["DocumentReadTool"]
        DU["DocumentUpdateTool"]
        DD["DocumentDeleteTool"]
        DL["DocumentListTool"]
        DS["DocumentSearchTool"]
        DSC["DocumentSchemaTool"]
        EM["ExecuteMacroTool"]
        AS["ArtifactSearchTool"]
    end

    subgraph Utils["Utilities - scripts/utils/"]
        RH["RetryHelpers<br/>retry-helpers.js"]
        LOG["Logger<br/>logger.js"]
        VAL["Validation<br/>validation.js"]
        AIN["AI Normalization<br/>ai-normalization.js"]
    end

    %% UI Flow
    SST --> CH
    SST --> SSS
    CH --> CE
    CH --> CM

    %% Core Flow
    SC --> AIC
    SC --> CM
    SC --> TR
    SC --> SPB
    CE --> SC
    CE --> TLH
    CE --> RH
    TLH --> TR
    TLH --> RH
    TLH --> AIC
    TLH --> HM
    SC --> HM

    %% AI Flow
    AIC --> BP
    AIC --> GP
    OP --> BP
    GP --> BP
    MP --> BP
    AIC --> AIN

    %% Tool Flow
    TR --> BT
    TR --> Documents
    BT --> DA
    DC --> BT
    DR --> BT
    DU --> BT
    DD --> BT
    DL --> BT
    DS --> BT
    DSC --> BT
    EM --> BT
    AS --> BT

    %% Utility connections
    CE --> LOG
    TLH --> LOG
    AIC --> LOG
```

---

## Key Components

### Core Classes

| Class | File | Responsibilities |
|-------|------|------------------|
| `SimulacrumCore` | `scripts/core/simulacrum-core.js` | Main orchestrator, initialization, delegation to managers |
| `AIClient` | `scripts/core/ai-client.js` | AI provider abstraction, request handling |
| `ConversationEngine` | `scripts/core/conversation-engine.js` | Single turn orchestration, retry logic |
| `ToolLoopHandler` | `scripts/core/tool-loop-handler.js` | Tool execution loop, error handling |
| `ConversationManager` | `scripts/core/conversation.js` | Message history, token management, **state persistence** |
| `ToolRegistry` | `scripts/core/tool-registry.js` | Tool registration (**now includes defaults**), schema generation, execution |
| `HookManager` | `scripts/core/hook-manager.js` | Centralized hook constants and emit helpers |
| `DocumentAPI` | `scripts/core/document-api.js` | FoundryVTT document abstraction |
| `ChatHandler` | `scripts/core/chat-handler.js` | Chat flow orchestration |

### Extracted Modules (New)

| Module | File | Extracted From |
|--------|------|----------------|
| `GeminiProvider` | `scripts/core/providers/gemini-provider.js` | ai-client.js |
| `SystemPromptBuilder` | `scripts/core/system-prompt-builder.js` | SimulacrumCore |
| `AIProvider` | `scripts/core/providers/base-provider.js` | ai-client.js |
| `OpenAIProvider` | `scripts/core/providers/openai-provider.js` | ai-client.js |
| `MockAIProvider` | `scripts/core/providers/mock-provider.js` | ai-client.js |
| `RetryHelpers` | `scripts/utils/retry-helpers.js` | conversation-engine.js, tool-loop-handler.js |
| `SidebarStateSyncer` | `scripts/ui/sidebar-state-syncer.js` | simulacrum-sidebar-tab.js |

### Utility Functions

| Function | File | Purpose |
|----------|------|---------|
| `emitProcessStatus()` | hook-manager.js | Emit process status hooks |
| `emitProcessCancelled()` | hook-manager.js | Emit cancellation hooks |
| `isToolCallFailure()` | retry-helpers.js | Check for tool call failures |
| `buildRetryLabel()` | retry-helpers.js | Human-readable retry labels |
| `buildSystemPrompt()` | system-prompt-builder.js | Generate AI system prompt |
| `syncMessagesFromCore()` | sidebar-state-syncer.js | Sync conversation to UI |

---

## AI Provider Architecture

```mermaid
classDiagram
    class AIProvider {
        <<abstract>>
        +config
        +sendMessage(message, context)
        +generateResponse(messages)
        +isAvailable()
    }
    
    class OpenAIProvider {
        +baseURL
        +model
        +sendMessage()
        +generateResponse()
    }

    class GeminiProvider {
        +apiKey
        +model
        +chat()
        +mapTools()
    }
    
    class MockAIProvider {
        +sendMessage()
        +generateResponse()
    }
    
    class AIClient {
        +apiKey
        +baseURL
        +model
        +provider
        +chat(messages, tools, options)
        +chatWithSystem()
        +validateConnection()
    }
    
    AIProvider <|-- OpenAIProvider
    AIProvider <|-- GeminiProvider
    AIProvider <|-- MockAIProvider
    AIClient --> AIProvider : uses
```

---

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant SidebarTab
    participant ChatHandler
    participant ConversationEngine
    participant AIClient
    participant ToolLoopHandler
    participant ToolRegistry
    participant DocumentAPI

    User->>SidebarTab: Send message
    SidebarTab->>ChatHandler: processUserMessage()
    ChatHandler->>ConversationEngine: processTurn()
    ConversationEngine->>AIClient: chat() with tools
    AIClient-->>ConversationEngine: AI response
    
    alt Has tool calls
        ConversationEngine->>ToolLoopHandler: processToolCallLoop()
        loop For each tool call
            ToolLoopHandler->>ToolRegistry: executeTool()
            ToolRegistry->>DocumentAPI: perform operation
            DocumentAPI-->>ToolRegistry: result
            ToolRegistry-->>ToolLoopHandler: tool result
        end
        ToolLoopHandler->>AIClient: continue with results
    end
    
    ConversationEngine-->>ChatHandler: final response
    ChatHandler-->>SidebarTab: display response
    SidebarTab-->>User: Show message
```
