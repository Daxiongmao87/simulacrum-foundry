# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Simulacrum is a FoundryVTT v12 module that provides an AI-powered campaign assistant for Game Masters and Assistant GMs. It synthesizes patterns from four reference repositories to create an AI agent with dynamic document CRUD capabilities, tool execution, and professional chat interface.

## Development Commands

### Testing and Quality Assurance
- **Run all tests**: `npm test`
- **Run tests with coverage**: `npm run test:coverage`
- **Run single test file**: `npm test -- path/to/test.js`
- **Lint code**: `npm run lint`
- **Auto-fix linting issues**: `npm run lint:fix`
- **Format code**: `npm run format`

### Git Hooks
- **Pre-commit**: Runs linting and formatting automatically
- **Husky**: Manages git hooks (configured in `.husky/`)

## Key Architecture Insights

### Recent Major Enhancements

#### 1. Dynamic Image Validation System
- **Purpose**: Makes `img` field required for all FoundryVTT documents
- **Implementation**: `scripts/core/image-validator.js`
- **Key Pattern**: Modifies document schemas dynamically rather than hardcoding types
- **Integration**: Works with existing validation error recovery system

#### 2. AI-Powered Validation Error Recovery
- **Purpose**: Automatically retry failed document operations with AI corrections
- **Implementation**: `scripts/tools/validation-error-recovery.js`
- **Key Pattern**: Parses validation errors and generates corrective prompts for AI
- **Critical Feature**: Maintains consistent error format across all validation types

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

## CRITICAL LESSONS LEARNED - AVOID PAST FAILURES

### What Went Wrong During Chat Modal Implementation
During implementation of the chat interface, Claude Code made repeated critical errors that must be avoided:

#### Error Pattern 1: Ignoring Direct Instructions
- **User repeatedly said**: "Compare divination-foundry implementation vs ours and find differences"
- **Claude did**: Made theoretical assumptions and implemented fixes without comparing actual code
- **Lesson**: ALWAYS do exactly what the user asks first, before making any assumptions

#### Error Pattern 2: False Confidence Without Evidence
- **Problem**: Claimed fixes were complete 5+ times without testing or verification
- **Result**: Wasted hours on wrong solutions while real issue remained unfixed
- **Lesson**: Never claim something is "fixed" without concrete evidence it works

#### Error Pattern 3: Missing Architecture Fundamentals
- **Critical Miss**: FIMLib is used as a git submodule in divination-foundry, not embedded code
- **Wrong Approach**: Tried to fix embedded copy instead of using proper submodule architecture
- **Root Cause**: Template path resolution failed because embedded FIMLib had wrong module references
- **Lesson**: Understand the ENTIRE architecture before making changes

#### Error Pattern 4: Theoretical vs Empirical Approach
- **Wrong**: Analyzing code and making logical deductions about what should work
- **Right**: Directly comparing working vs broken implementations line by line
- **Lesson**: When something works in one place but not another, compare implementations exactly

### Mandatory Debugging Protocol

When facing UI/layout issues:
1. **STOP making assumptions**
2. **Find a working reference implementation**  
3. **Compare line-by-line differences between working vs broken**
4. **Identify exact architectural differences (submodules, dependencies, file paths)**
5. **Fix the architecture first, CSS/JS second**
6. **Test each change individually**
7. **Never claim "fixed" without user confirmation**

### Architecture Understanding Requirements
- **FIMLib Integration**: MUST use as git submodule, not embedded copy
- **Template Paths**: Must reference `modules/fimlib/...` not `modules/simulacrum/scripts/fimlib/...`
- **Dependency Chain**: Understand how submodules become available as separate modules in Foundry
- **Reference Implementation**: Always compare against working divination-foundry patterns

### Communication Protocol
- **User frustration indicates**: Claude is not following instructions or missing something fundamental
- **When user says "do X"**: Do X first, analyze later
- **Multiple failed attempts**: Step back and ask user to clarify what's being missed
- **Never assume**: Always verify architectural assumptions against working implementations

### Development Best Practices
- **Test-Driven Development**: Write tests for new functionality
- **Schema-First Validation**: Always modify schemas rather than bypassing validation
- **Consistent Error Handling**: Use the same error format across all validation types
- **Performance Considerations**: Cache validation results, use async operations
- **Documentation**: Update JSDoc comments for all public methods

## Testing Strategy

### Core Test Coverage
- **Unit Tests**: All utility functions and core classes (`scripts/core/`, `scripts/tools/`)
- **Integration Tests**: Document CRUD operations with mocked FoundryVTT environment
- **Validation Tests**: Schema modification and error recovery scenarios
- **Mock Framework**: Uses Jest with custom FoundryVTT mocks in `scripts/test/mocks.js`

### Critical Test Areas
1. **Dynamic Schema Modification**: Test img field requirement enforcement
2. **Validation Error Recovery**: Test AI retry mechanism with various error types  
3. **Document Discovery**: Test across different game systems
4. **Tool Permission System**: Test GM/Assistant GM access controls
5. **Context Management**: Test conversation context persistence

## Validation Checklist

Before any major implementation:
1. **MANDATORY**: Compare against working reference implementation first
2. Cross-reference patterns against all four research repositories  
3. Verify system-agnostic compatibility (test with D&D 5e, PF2e concepts)
4. Confirm permission system restricts to GM/Assistant GM only
5. Validate tool confirmation system shows operation details
6. Test dynamic document type discovery across different systems
7. **Run tests**: Execute `npm test` and ensure all tests pass
8. **Check coverage**: Ensure new code has appropriate test coverage
9. **MANDATORY**: Get user confirmation that fixes actually work before claiming completion

## Critical Implementation Patterns

#### Image Validation Pattern ✅ IMPLEMENTED
```javascript
// CORRECT: Runtime image validation with caching
const validation = await ImageValidator.validateImagePath(imagePath, {
  timeout: 30000,
  useCache: true
});
if (!validation.valid) {
  throw new ValidationError(`Image validation failed: ${validation.error}`);
}

// WRONG: Bypassing image validation
if (documentData.img) { /* assuming img is valid without checking */ }
```

#### Validation Error Recovery Pattern ✅ IMPLEMENTED
```javascript
// CORRECT: Context-aware error recovery
if (ValidationErrorRecovery.isValidationError(error)) {
  const prompt = await ValidationErrorRecovery.buildImageValidationPrompt(
    error, originalData, documentType
  );
  return await ValidationErrorRecovery.attemptRecovery(error, originalData, documentType);
}

// WRONG: Generic error handling without recovery
catch (error) { throw error; /* no recovery attempt */ }
```

#### Testing Pattern ✅ IMPLEMENTED
```javascript
// CORRECT: Comprehensive Jest testing with mocks
import { ImageValidator } from '../core/image-validator.js';
import '../test/mocks.js'; // FoundryVTT environment mocks

describe('ImageValidator', () => {
  beforeEach(() => {
    ImageValidator.clearCache();
  });
  
  test('validates with caching', async () => {
    const result = await ImageValidator.validateImagePath('valid/path.png');
    expect(result.valid).toBe(true);
  });
});

// WRONG: No testing for validation logic
// Missing test coverage for critical functionality
```