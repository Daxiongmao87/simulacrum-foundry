# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Simulacrum is a FoundryVTT v12 module that provides an AI-powered campaign assistant for Game Masters and Assistant GMs. It synthesizes patterns from four reference repositories to create an AI agent with dynamic document CRUD capabilities, tool execution, and professional chat interface.

## Architecture Synthesis

This project combines proven patterns from four repositories located in `research/`:

### Core Pattern Sources
1. **foundry-object-manager**: Document type discovery and CRUD operations
   - Key files: `world-manager.mjs`, `foundry-puppeteer-validator.mjs`
   - Provides: Dynamic document type normalization, system-agnostic collection discovery
   - Critical pattern: Lines 24-54 in `world-manager.mjs` show document type resolution

2. **gemini-cli**: Agentic loop and tool execution system
   - Key files: `packages/core/src/core/coreToolScheduler.ts`, `packages/core/src/tools/tools.ts`
   - Provides: Tool registry, confirmation system, approval modes, streaming execution
   - Critical pattern: Tool scheduler manages validation → scheduled → executing → complete lifecycle

3. **divination-foundry**: FoundryVTT module structure and AI integration
   - Key files: `scripts/main.js`, `scripts/settings.js`, `scripts/api.js`
   - Provides: Module initialization hooks, settings registration, permission system, AI API integration
   - Critical pattern: Permission system defaults to ASSISTANT level (lines 131, 163 in settings.js)

4. **fimlib-foundry**: Chat interface foundation
   - Key files: `components/chat-modal.js`, `templates/chat-modal.html`
   - Provides: ChatModal class extending FormApplication, message handling, markdown support
   - Critical pattern: Template override and namespace registration approach

## Key Requirements (from IDEA.md)

- **Users**: Game Master (required) + Assistant Game Master (configurable)
- **Core Function**: AI chat interface with CRUD tools for Foundry Documents
- **Flow**: Agentic loop with tool calls, send button transforms to cancel during execution
- **System Agnostic**: Must work across all FoundryVTT game systems via dynamic discovery
- **Configuration**: OpenAI API endpoint, model, context length, deletion permissions, tool permissions, YOLO mode

## Technical Implementation Strategy

### Recommended Approach
Start with divination-foundry as structural foundation, then integrate:

1. **Document Discovery Engine** from foundry-object-manager patterns:
   - `game.collections.get()` for direct document types
   - `window.CONFIG.*.typeLabels` for subtypes
   - Dynamic normalization: "weapon" → {collection: "Item", subtype: "weapon"}

2. **Tool System** from gemini-cli patterns:
   - Tool registry with schema definitions
   - Confirmation system with approval modes (allow/autoconfirm/deny)
   - Tool scheduler with abort signal support
   - YOLO mode bypasses all confirmations

3. **Chat Interface** extending fimlib-foundry:
   - Extend ChatModal class with custom template path
   - Add tool execution display and progress indicators
   - Implement cancel button functionality during AI processing

### Critical Integration Points

#### Permission System
- Default: GM only access
- Setting: `allowAssistantGM` enables ASSISTANT role access
- Pattern from divination: `user.role >= CONST.USER_ROLES[requiredPermission]`

#### Document Type Discovery
```javascript
// From foundry-object-manager world-manager.mjs lines 24-54
const normalizedType = type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
let collection = game.collections.get(normalizedType);
if (!collection) {
    // Check subtypes via CONFIG
    if (window.CONFIG?.Item?.typeLabels?.[type]) {
        collection = game.collections.get('Item');
        filterByType = type;
    }
}
```

#### Tool Execution Pattern
```javascript
// From gemini-cli CoreToolScheduler
for (const toolCall of toolCalls) {
    const tool = await this.toolRegistry.getTool(toolCall.function.name);
    const confirmationDetails = await tool.shouldConfirmExecute(params);
    if (confirmationDetails && !yoloMode) {
        const userDecision = await this.requestUserConfirmation(confirmationDetails);
    }
    const result = await tool.execute(params, abortSignal, this.outputHandler);
}
```

## Mandatory Rules

### Architecture Constraints
- **Never hardcode document types**: Always use dynamic discovery from active world/system
- **Direct Foundry API calls**: Use `Actor.create()`, `Item.update()`, etc. (not Puppeteer like foundry-object-manager)
- **FIMLib as submodule**: Follow divination-foundry's pattern for integration
- **Permission-gated**: Enforce GM/Assistant GM restrictions at all entry points

### Development Patterns
- **Extend existing classes**: Follow divination's ChatModal extension pattern
- **World-scoped settings**: All configuration must be world-level for consistency
- **Hook integration**: Use proper Foundry lifecycle hooks (init, ready, render*)
- **Error boundaries**: Comprehensive error handling with user-friendly notifications

### Code Organization
- Keep divination-foundry's proven file structure as foundation
- Add new functionality in separate modules (document-discovery.js, tool-registry.js, etc.)
- Maintain separation between AI service, document operations, and UI components

## Reference File Locations

When implementing specific functionality, refer to:
- Document discovery: `research/foundry-object-manager/world-manager.mjs` lines 18-86
- Tool patterns: `research/gemini-cli/packages/core/src/tools/tools.ts`
- Module structure: `research/divination-foundry/scripts/main.js`
- Chat interface: `research/fimlib-foundry/components/chat-modal.js`
- Settings system: `research/divination-foundry/scripts/settings.js`
- API integration: `research/divination-foundry/scripts/api.js`

## Validation Checklist

Before any major implementation:
1. Cross-reference patterns against all four research repositories
2. Verify system-agnostic compatibility (test with D&D 5e, PF2e concepts)
3. Confirm permission system restricts to GM/Assistant GM only
4. Validate tool confirmation system shows operation details
5. Test dynamic document type discovery across different systems