# System Prompt and Tool Architecture Analysis

## Critical Questions to Investigate

### 1. General Questions and Tool Access
**Question**: Why are "GENERAL QUESTIONS" marked as no tools needed? If I ask "what is the name of the king of this kingdom?" shouldn't it be able to use tools to search world documents?

**Investigation needed**: Review current system prompt logic for tool usage decisions.

### 2. Structured Output Schema
**Question**: Why are we not providing a schema for structured output to ensure correct output? Need to research Ollama and OpenAI API capabilities.

**Investigation needed**: 
- Research OpenAI API structured output features
- Research Ollama API structured output capabilities
- Determine if we should implement structured output schemas

### 3. Hardcoded Tool Calls in System Prompt
**Question**: Why are we HARDCODING TOOL CALLS IN THE SYSTEM PROMPT when we provide them in the ##AVAILABLE TOOLS section?

**Investigation needed**: Review system prompt for hardcoded tool references and determine if they should be dynamic.

### 4. Tool Purpose and Necessity
**Question**: Why do we have these tools and what do they actually do?
- LIST_CONTEXT tool - what's the point?
- CLEAR_CONTEXT tool - what's the point? 
- GET_WORLD_INFO tool - what does it do?
- GET_SCENE_INFO tool - what does it do?
- GET_USER_PREFERENCES tool - what does it do?

**Investigation needed**: Review each tool's implementation and determine actual utility for agentic AI.

### 5. Tool Parameter Requirements
**Question**: Why do we have these parameter requirements?
- Why is documentType REQUIRED for LIST_DOCUMENTS when it should be optional?
- Why does READ_DOCUMENT require documentType?
- Why does UPDATE_DOCUMENT require documentType?
- Why does DELETE_DOCUMENT require documentType?

**Investigation needed**: 
- Check if these requirements are enforced by FoundryVTT API
- Determine if we arbitrarily added these requirements
- Review actual FoundryVTT document API to understand what's truly required

### 6. Tool Descriptions
**Question**: Why are tool descriptions not comprehensive enough?

**Investigation needed**: Review all tool descriptions for completeness and clarity.

## Findings

### 1. General Questions and Tool Access ✅ CONFIRMED ISSUE
**Finding**: The system prompt in `lang/en.json` line 79 explicitly states "GENERAL QUESTIONS (No tools needed)" and categorizes "Rules clarifications, lore questions, campaign advice, roleplay suggestions" as requiring no tools.

**Problem**: This prevents the AI from using tools to answer world-specific questions like "what is the name of the king of this kingdom?" which SHOULD search world documents.

**Solution**: Modify the classification to distinguish between:
- Generic RPG questions (no tools needed)
- World-specific questions (tools needed: search_documents, read_document)

### 2. Structured Output Schema ✅ NEEDS IMPLEMENTATION

**OpenAI API Research**:
- Supports `response_format` parameter with `type: "json_schema"`
- Can enforce exact JSON structure with schema validation
- Available in GPT-4o and newer models
- Example: `response_format: { type: "json_schema", json_schema: { name: "tool_response", schema: {...} } }`

**Ollama API Research**:
- Supports structured output via `format` parameter
- Can accept JSON schema for response validation
- Example: `format: "json"` or with schema enforcement
- Compatible with many local models

**Current Implementation**: Only uses JSON format instructions in system prompt, no API-level schema enforcement.

**Recommendation**: Implement structured output schemas for both APIs to ensure consistent tool call formatting.

### 3. Hardcoded Tool Calls in System Prompt ✅ CONFIRMED ISSUE
**Finding**: Lines 110-123 in system prompt contain hardcoded `todo_write` tool call examples with specific parameter structures.

**Problem**: This violates the principle of dynamic tool definitions and makes the system brittle.

**Solution**: Remove hardcoded examples and rely on dynamic tool list generation (which already exists in ai-service.js:758-773).

### 4. Tool Purpose Analysis

#### LIST_CONTEXT Tool ❌ COMPLETELY REDUNDANT
**Purpose**: Shows documents stored in Simulacrum's context manager
**Problem**: The AI already gets full conversation history with every API call, so it can see what documents it has previously accessed
**Investigation**: The `contextManager.getContextSummary()` method exists but is NEVER actually used in AI calls
**Conclusion**: This tool is pointless - the AI already knows its context through conversation history

#### CLEAR_CONTEXT Tool ❌ COMPLETELY REDUNDANT  
**Purpose**: Clears documents from Simulacrum's context manager
**Problem**: Same as above - this separate context system serves no purpose when conversation history already provides this information
**Conclusion**: This tool should be removed entirely

#### GET_WORLD_INFO Tool ✅ USEFUL BUT REDUNDANT
**Purpose**: Returns world title, system info, active scene, players, collection counts
**Utility**: Some overlap with GET_SCENE_INFO. Could be useful for context but may be redundant.

#### GET_SCENE_INFO Tool ✅ USEFUL
**Purpose**: Detailed current scene information including tokens, lighting, notes
**Utility**: Valuable for scene-specific questions and actions.

#### GET_USER_PREFERENCES Tool ✅ LIMITED UTILITY
**Purpose**: Returns user settings and permissions
**Utility**: Mostly for permission checks, could be internal rather than AI-facing.

### 5. Tool Parameter Requirements ✅ CONFIRMED ISSUES

#### LIST_DOCUMENTS Tool ✅ CORRECT IMPLEMENTATION
**Finding**: documentType is already OPTIONAL (line 32: `required: []`). The implementation correctly handles both specific types and "all documents" mode.

#### READ_DOCUMENT Tool ✅ ISSUE CONFIRMED
**Finding**: documentType is marked as required (line 19: `required: ['documentType']`)
**Problem**: This is NOT required by FoundryVTT API - documents have unique IDs across all collections.
**Solution**: Make documentType optional and use DocumentDiscovery to find the correct collection.

#### UPDATE_DOCUMENT Tool ✅ ISSUE CONFIRMED
**Finding**: Same issue as READ_DOCUMENT - documentType required when it shouldn't be.

#### DELETE_DOCUMENT Tool ✅ ISSUE CONFIRMED  
**Finding**: Same issue as READ_DOCUMENT - documentType required when it shouldn't be.

### 6. Tool Descriptions ✅ NEEDS IMPROVEMENT
**Finding**: Many tool descriptions are too brief and don't explain their actual utility or parameters clearly.

## Summary of Issues and Status

### ✅ FIXED ISSUES
1. **General Questions Tool Restriction** - Removed arbitrary restriction preventing AI from using tools for world-specific questions
2. **Hardcoded Tool Examples** - Removed hardcoded `todo_write` examples from system prompt  
3. **DocumentType Requirements** - Made documentType optional in READ_DOCUMENT, UPDATE_DOCUMENT, and DELETE_DOCUMENT tools
4. **Tool Descriptions** - Enhanced descriptions to be more comprehensive and clear

### ✅ CONFIRMED ISSUES NEEDING REMOVAL
5. **LIST_CONTEXT Tool** - Completely redundant since AI gets conversation history with every call
6. **CLEAR_CONTEXT Tool** - Completely redundant since AI gets conversation history with every call
7. **ADD_DOCUMENT_CONTEXT Tool** - Also redundant for the same reason

### ⏳ NEEDS IMPLEMENTATION  
8. **Structured Output Schema** - Should implement OpenAI/Ollama structured output for better tool call formatting

### ✅ INVESTIGATION COMPLETE
- All major architectural issues identified
- Root cause: Redundant context management system that duplicates conversation history
- Recommendation: Remove the entire ContextManager system and related tools

## Final Recommendations

### IMMEDIATE ACTIONS NEEDED
1. **Remove redundant tools**: `list_context`, `clear_context`, `add_document_context`
2. **Remove ContextManager class** entirely - it serves no purpose
3. **Clean up any references** to contextManager in main.js and other files
4. **Implement structured output schemas** for OpenAI and Ollama APIs
5. **Update system prompt** to remove references to context management tools

### ARCHITECTURAL INSIGHT: THREE REDUNDANT CONTEXT SYSTEMS!

The codebase has **THREE separate context systems** that all do essentially the same thing:

1. **`conversationHistory`** in AIService - The actual chat messages (USED ✅)
2. **`contextManager`** in ContextManager class - Persistent document references stored in world settings (UNUSED ❌)
3. **`contextDocuments`** in SimulacrumChat - UI-only document references for chat interface (UI ONLY ❌)

**The Problem**: 
- `contextManager` stores document references in world settings but is NEVER used by AI calls
- `contextDocuments` is only for UI display in the chat interface
- Only `conversationHistory` is actually sent to the AI
- The AI gets full conversation history already, so additional "context" is redundant

**Why This Exists**: 
Appears to be an over-engineered attempt to "help" the AI remember important documents, but the AI already has perfect memory through conversation history.

**Conclusion**: The entire ContextManager system and related tools should be removed - they serve no functional purpose.