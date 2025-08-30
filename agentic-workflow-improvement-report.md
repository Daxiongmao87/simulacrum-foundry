# Simulacrum Agentic Workflow Analysis & Improvement Report

## Executive Summary

After analyzing Simulacrum's current system prompt and architecture against established agentic tools (Gemini CLI and Qwen Code), I've identified key areas for improvement to tighten the agentic workflow loop and increase effectiveness. The analysis reveals that while Simulacrum has solid architectural foundations, the system prompt lacks the precision, clarity, and workflow orchestration patterns that make established tools highly effective.

## Current Architecture Analysis

### Strengths
- **Solid Technical Architecture**: Well-structured tool registry, proper JSON response parsing, context management
  - References: `scripts/tools/tool-registry.js`, `scripts/core/json-response-parser.js`, `scripts/core/agentic-context.js`
- **Domain Expertise**: Deep FoundryVTT integration with system-agnostic design
  - References: `scripts/core/document-discovery-engine.js`, `scripts/core/generic-crud-tools.js`
- **Tool Ecosystem**: Comprehensive 13+ tools specifically designed for worldbuilding
  - References: `scripts/tools/` directory, `scripts/main.js:178-191`
- **Agentic Loop Controller**: Proper state management, token tracking, context compaction
  - References: `scripts/core/agentic-loop-controller.js`, `scripts/core/token-tracker.js`, `scripts/core/context-compaction.js`

### Critical Weaknesses
- **Verbose, Unfocused System Prompt**: 154 lines with excessive detail and unclear priorities
  - References: `lang/en.json:56-154` (current system prompt)
- **Weak Autonomous Decision-Making**: Relies heavily on user confirmation rather than autonomous execution
  - References: `lang/en.json:84,64` (contradictory autonomy statements)
- **JSON Response Format**: Forces rigid JSON structure that limits natural language communication
  - References: `lang/en.json:58,61,151` (JSON-only requirements)
- **Incomplete Tool Integration**: TodoWrite tool is mentioned but workflow patterns are unclear
  - References: `lang/en.json:139`, `scripts/tools/todo-write.js` (tool exists but workflow unclear)

## Comparative Analysis: Gemini CLI vs Qwen Code vs Simulacrum

### System Prompt Architecture

#### Gemini CLI (Excellence in Structure)
```
Length: ~265 lines
Structure: Hierarchical with clear sections
- Core Mandates (7 clear rules)
- Primary Workflows (2 distinct patterns)  
- Operational Guidelines (tone, security, tool usage)
- Context-aware additions (Git, sandbox status)
- Concrete examples (7 practical scenarios)
```
**References**: `research/gemini-cli/packages/core/src/core/prompts.ts:49-266`

#### Qwen Code (Excellence in Task Management)
```  
Length: ~447 lines
Structure: Enhanced version of Gemini CLI
- Adds explicit TodoWrite tool integration
- Task management workflows with examples
- Iterative planning approach ("Plan → Implement → Adapt")
- Clear tool usage patterns
```
**References**: `research/qwen-code/packages/core/src/core/prompts.ts:123-447`

#### Simulacrum (Current - Needs Improvement)
```
Length: 154 lines  
Structure: Verbose but less organized
- Mixed priorities and unclear hierarchy
- JSON response format forces (limiting)
- Excessive detail without clear workflow patterns
- Domain-specific but lacks general agentic principles
```
**References**: `lang/en.json:56-154` (current system prompt)

### Key Architectural Patterns

| Aspect | Gemini CLI | Qwen Code | Simulacrum | 
|--------|------------|-----------|------------|
| **Workflow Clarity** | ✅ Clear 5-step process<br/>`research/gemini-cli/.../prompts.ts:68-74` | ✅ Enhanced iterative process<br/>`research/qwen-code/.../prompts.ts:189-197` | ❌ Scattered instructions<br/>`lang/en.json:67-153` |
| **Autonomous Execution** | ✅ "Keep going until resolved"<br/>`research/gemini-cli/.../prompts.ts:265` | ✅ Strong autonomy emphasis<br/>`research/qwen-code/.../prompts.ts:446` | ❌ Asks for permission frequently<br/>`lang/en.json:84,64` |
| **Tool Integration** | ✅ Natural tool references<br/>`research/gemini-cli/.../prompts.ts:109-116` | ✅ TodoWrite integration<br/>`research/qwen-code/.../prompts.ts:139-185` | ⚠️ Basic tool listing<br/>`lang/en.json:144-145` |
| **Response Format** | ✅ Natural language focus<br/>`research/gemini-cli/.../prompts.ts:101-102` | ✅ Natural language focus<br/>`research/qwen-code/.../prompts.ts:229-230` | ❌ Forces JSON responses<br/>`lang/en.json:58,61,151` |
| **Conciseness** | ✅ "< 3 lines when possible"<br/>`research/gemini-cli/.../prompts.ts:98` | ✅ Concise communication<br/>`research/qwen-code/.../prompts.ts:226` | ❌ Verbose responses<br/>`lang/en.json:56-154` |
| **Context Management** | ✅ Git/sandbox awareness<br/>`research/gemini-cli/.../prompts.ts:144-165` | ✅ Git/sandbox awareness<br/>`research/qwen-code/.../prompts.ts:251-294` | ⚠️ Basic context<br/>`scripts/main.js:317-329` |

## Critical Improvement Recommendations

### 1. URGENT: Eliminate JSON Response Requirement

**Current Problem**: System prompt forces JSON responses, limiting natural communication.

```javascript
// REMOVE THIS LIMITATION:
"You MUST always respond with raw JSON only"
"Respond with valid JSON only"
```
**References**: `lang/en.json:58,61,151`

**Solution**: Allow natural language with tool calls, following Gemini CLI pattern:
```
Use tools for actions, text output *only* for communication
```
**References**: `research/gemini-cli/packages/core/src/core/prompts.ts:102`, `research/qwen-code/packages/core/src/core/prompts.ts:230`

### 2. Restructure System Prompt Architecture

**Recommended Structure** (targeting ~200-250 lines):

```
# Simulacrum System Prompt

You are Simulacrum, an AI campaign assistant for FoundryVTT specializing in worldbuilding and document creation.

## Core Mandates (7 clear rules)
- System-agnostic design principles  
- Autonomous execution patterns
- FoundryVTT conventions
- Security and safety
- Tool usage guidelines
- Response format (natural language)
- Workflow completion commitment

## Primary Workflows
### Worldbuilding Tasks
1. **Research** → search existing content first
2. **Plan** → use TodoWrite for complex tasks  
3. **Execute** → create/update documents autonomously
4. **Verify** → validate results
5. **Complete** → mark todos finished

### Document Operations  
- Creation patterns
- Update workflows
- Schema validation
- Asset integration

## Operational Guidelines
- Concise communication (< 3 lines when practical)
- Tool-first execution
- Error handling patterns
- Progress tracking

## Examples (5-7 concrete scenarios)
```
**References**: 
- Gemini CLI examples: `research/gemini-cli/packages/core/src/core/prompts.ts:167-262`
- Qwen Code examples: `research/qwen-code/packages/core/src/core/prompts.ts:296-443`

### 3. Enhance Autonomous Decision-Making

**Current Issue**: Too many confirmation requests

```javascript
// REMOVE THESE PATTERNS:
"DO NOT ASK FOR USER CONFIRMATION"  // contradicted by later asks
"**EXECUTE ALL PHASES AUTONOMOUSLY**" // but then asks anyway
```
**References**: `lang/en.json:84,64` (contradictory autonomy statements)

**Solution**: Clear autonomy principles:
```
## Autonomous Execution
- Execute tasks completely until the user's request is fully resolved
- Make reasonable decisions based on available context
- Use TodoWrite to track progress transparently  
- Only ask for clarification when genuinely ambiguous
- Keep going until the workflow is complete
```
**References**: 
- Gemini CLI autonomy: `research/gemini-cli/packages/core/src/core/prompts.ts:265` ("keep going until resolved")
- Qwen Code autonomy: `research/qwen-code/packages/core/src/core/prompts.ts:446` ("completely resolved")
- Current weak autonomy: `scripts/core/agentic-loop-controller.js:291-335` (terminates too early)

### 4. Strengthen TodoWrite Integration

**Current Issue**: TodoWrite mentioned but workflow unclear

**Enhancement**: Follow Qwen Code patterns:
```javascript
## Task Management with TodoWrite
- Use TodoWrite for ANY multi-step task (3+ steps)
- Create initial plan, mark items in_progress, complete immediately after finishing
- Update todos with new discoveries during execution
- Never batch completions - mark done immediately
- Examples:
  [Concrete examples of TodoWrite usage patterns]
```

**References**:
- Qwen Code TodoWrite integration: `research/qwen-code/packages/core/src/core/prompts.ts:139-185`
- Simulacrum TodoWrite tool: `scripts/tools/todo-write.js`
- Current usage: `lang/en.json:139` (mentioned but lacks workflow clarity)

### 5. Implement Concise Communication Standards

**Current Issue**: Responses tend to be verbose

**Solution**: Add explicit communication guidelines:
```
## Communication Standards  
- Aim for fewer than 3 lines of text output when practical
- Focus strictly on the user's query
- No conversational filler or confirmation requests
- Get straight to the action
- Tools for execution, text for essential communication only
```

**References**:
- Gemini CLI communication standards: `research/gemini-cli/packages/core/src/core/prompts.ts:96-103`
- Qwen Code communication patterns: `research/qwen-code/packages/core/src/core/prompts.ts:224-231`
- Current verbose patterns: `lang/en.json:58-153` (needs streamlining)

### 6. Add Context-Aware Enhancements

**Missing**: Dynamic context adaptation like Gemini CLI/Qwen Code

**Addition**: 
```javascript
// Add environment detection
${(function() {
  const worldType = game.world?.system || 'unknown';
  const isGM = game.user?.isGM || false;
  return `
## Current Context
- Game System: ${worldType}
- User Role: ${isGM ? 'GM' : 'Player'}  
- Document Types Available: [dynamically populated]
`;
})()}
```

**References**:
- Gemini CLI context awareness: `research/gemini-cli/packages/core/src/core/prompts.ts:144-165` (Git/sandbox detection)
- Qwen Code context patterns: `research/qwen-code/packages/core/src/core/prompts.ts:251-294` (environment detection)
- Simulacrum context potential: `scripts/main.js:317-329` (FoundryVTT-specific context available)

### 7. Streamline Domain-Specific Instructions

**Current Issue**: Too much FoundryVTT detail cluttering core workflow

**Solution**: Move complex domain instructions to a separate section:
```
## FoundryVTT Domain Expertise
[Condensed version of current detailed instructions]
```

**References**:
- Current detailed instructions: `lang/en.json:67-153` (needs condensing)
- Domain expertise integration: `scripts/core/document-discovery-engine.js` (system-agnostic patterns)
- Tool implementations: `scripts/tools/crud-tools.js` (actual FoundryVTT operations)

**References for Implementation**:
- Current system prompt generation: `scripts/settings.js:200-220` (where system prompt is built)
- AI service integration: `scripts/chat/ai-service.js:15-80` (tool schema generation)
- Response parsing: `scripts/core/json-response-parser.js` (current JSON-only parsing)

## Implementation Priority

### Phase 1 (Critical - Immediate)
1. Remove JSON response requirement
   - **Modify**: `lang/en.json:58,61,151` (remove JSON-only requirements)
   - **Update**: `scripts/core/json-response-parser.js` (allow natural language parsing)
2. Restructure system prompt with clear hierarchy
   - **Restructure**: `lang/en.json:56-154` (follow gemini-cli hierarchy pattern)
   - **Reference pattern**: `research/gemini-cli/packages/core/src/core/prompts.ts:49-266`
3. Add autonomous execution principles
   - **Add to**: `lang/en.json` (new autonomy section)
   - **Reference patterns**: `research/gemini-cli/packages/core/src/core/prompts.ts:265`, `research/qwen-code/packages/core/src/core/prompts.ts:446`
4. Implement concise communication standards
   - **Add to**: `lang/en.json` (new communication section)
   - **Reference patterns**: `research/gemini-cli/packages/core/src/core/prompts.ts:96-103`

### Phase 2 (High Priority)
1. Enhance TodoWrite workflow integration
   - **Enhance**: `lang/en.json:139` (expand TodoWrite patterns)
   - **Reference**: `research/qwen-code/packages/core/src/core/prompts.ts:139-185`
   - **Tool source**: `scripts/tools/todo-write.js`
2. Add context-aware enhancements
   - **Add to**: `lang/en.json` (dynamic context section)
   - **Reference patterns**: `research/gemini-cli/packages/core/src/core/prompts.ts:144-165`
   - **Implementation**: `scripts/main.js:317-329` (FoundryVTT context available)
3. Streamline domain-specific instructions
   - **Condense**: `lang/en.json:67-153` (move detailed FoundryVTT info to separate section)
   - **Core logic**: `scripts/core/document-discovery-engine.js`
4. Add practical examples
   - **Add to**: `lang/en.json` (examples section)
   - **Reference patterns**: `research/gemini-cli/packages/core/src/core/prompts.ts:167-262`

### Phase 3 (Enhancement)
1. A/B testing of prompt variations
   - **Testing framework**: `tests/` directory structure
   - **Reference**: `tests/run-tests.js` (existing testing infrastructure)
2. Performance metrics collection
   - **Token tracking**: `scripts/core/token-tracker.js`
   - **Performance monitoring**: `scripts/core/agentic-loop-controller.js:248-386`
3. User feedback integration
   - **UI integration**: `scripts/ui/chat-modal.js`
   - **Settings management**: `scripts/settings.js`
4. Continuous refinement
   - **Configuration**: `lang/en.json` (iterative prompt updates)
   - **Reference examples**: `research/gemini-cli/packages/core/src/core/prompts.ts`, `research/qwen-code/packages/core/src/core/prompts.ts`

## Expected Outcomes

### Immediate Benefits
- **Reduced Latency**: Eliminate JSON parsing overhead
- **Better UX**: Natural language responses instead of rigid JSON
- **Increased Autonomy**: Fewer confirmation requests, more direct execution
- **Clearer Workflows**: Step-by-step patterns users can follow

### Long-term Benefits  
- **Higher Task Completion**: Better workflow orchestration
- **Improved Reliability**: Clear error handling and recovery patterns
- **Enhanced User Satisfaction**: More conversational, helpful interactions
- **Better Scaling**: Clearer patterns for adding new capabilities

## Conclusion

Simulacrum has excellent technical foundations but needs significant system prompt improvements to match the effectiveness of established agentic tools. The primary issues are:

1. **Over-engineering the response format** (JSON requirement)
2. **Under-engineering the workflow patterns** (lack of clear sequences)
3. **Inconsistent autonomy** (says autonomous but asks for permission)

By implementing these recommendations, Simulacrum can achieve the same level of agentic effectiveness as Gemini CLI and Qwen Code while maintaining its specialized FoundryVTT focus.

The key insight from analyzing successful agentic tools is that **clarity and workflow orchestration matter more than comprehensive feature coverage**. A focused, well-structured prompt that enables clear autonomous workflows will significantly outperform a comprehensive but unclear one.

## Source Code References Summary

### Gemini CLI Architecture
- **Core system prompt**: `research/gemini-cli/packages/core/src/core/prompts.ts:22-296`
- **Subagent implementation**: `research/gemini-cli/packages/core/src/core/subagent.ts`
- **Tool registry**: `research/gemini-cli/packages/core/src/tools/tool-registry.ts`

### Qwen Code Architecture  
- **Enhanced system prompt**: `research/qwen-code/packages/core/src/core/prompts.ts:47-477`
- **Subagent patterns**: `research/qwen-code/packages/core/src/core/subagent.ts`
- **TodoWrite integration examples**: `research/qwen-code/packages/core/src/core/prompts.ts:139-185`

### Simulacrum Current State
- **System prompt**: `lang/en.json:56-154`
- **Main initialization**: `scripts/main.js`
- **Agentic loop controller**: `scripts/core/agentic-loop-controller.js`
- **Tool registry**: `scripts/tools/tool-registry.js`
- **AI service**: `scripts/chat/ai-service.js`
- **Response parser**: `scripts/core/json-response-parser.js`

## Iterative Implementation Plan with Unit Testing

### Iteration 1: Foundation - Remove JSON Constraint

#### Implementation Tasks
1. **Update Response Parser** (`scripts/core/json-response-parser.js`)
   - Add support for natural language responses with embedded tool calls
   - Maintain backward compatibility with current JSON responses
   - Extract tool calls from markdown-style tool call blocks

2. **Modify AI Service** (`scripts/chat/ai-service.js`)
   - Remove `forceJsonMode` parameter enforcement
   - Update tool schema generation to support natural language mode
   - Add response format detection

3. **Update System Prompt** (`lang/en.json:58,61,151`)
   - Remove all JSON-only requirements
   - Add natural language communication guidelines

#### Unit Tests to Implement
```bash
# Create new test files
tests/unit/v13/core/enhanced-response-parser.test.js
tests/unit/v13/chat/natural-language-ai-service.test.js
```

**Test Coverage Requirements**:
- Natural language response parsing (with/without tool calls)
- Backward compatibility with existing JSON responses
- Error handling for malformed responses
- Tool call extraction from markdown format

#### Verification Commands
```bash
npm test                           # Run all unit tests
npm run test:unit:v13             # Test v13 specific changes
node tests/run-tests.js --manual  # Manual testing with live FoundryVTT
```

### Iteration 2: Structure - Hierarchical System Prompt

#### Implementation Tasks
1. **Restructure System Prompt** (`lang/en.json:56-154`)
   - Implement hierarchical structure following Gemini CLI pattern
   - Create clear Core Mandates section (7 rules)
   - Add Primary Workflows section
   - Separate Operational Guidelines

2. **Add Dynamic Context Generation** (`scripts/settings.js:200-220`)
   - Implement context-aware prompt building like Gemini CLI
   - Add FoundryVTT-specific context (game system, user role, document types)
   - Integrate with existing world info gathering

#### Unit Tests to Implement
```bash
# Create new test files
tests/unit/v13/settings/enhanced-system-prompt.test.js
tests/unit/v13/core/context-aware-prompts.test.js
```

**Test Coverage Requirements**:
- System prompt structure validation
- Dynamic context injection
- Hierarchical section generation
- Game system detection and context building

#### Verification Commands
```bash
npm test                                    # Validate prompt structure
node tests/run-tests.js -v v13 -s dnd5e   # Test with D&D 5e context
node tests/run-tests.js -v v13 -s pf2e    # Test with Pathfinder context
```

### Iteration 3: Autonomy - Enhanced Decision Making

#### Implementation Tasks
1. **Enhance Agentic Loop Controller** (`scripts/core/agentic-loop-controller.js`)
   - Implement stronger autonomous execution patterns
   - Reduce confirmation request frequency
   - Add decision-making confidence scoring

2. **Update Tool Scheduler** (`scripts/core/tool-scheduler.js`)
   - Review current Gremlin mode override logic
   - Implement selective autonomy based on tool risk levels
   - Add transparent progress reporting

3. **Add Autonomy Guidelines** (`lang/en.json`)
   - Clear autonomous execution principles
   - Decision-making frameworks
   - When to ask vs. when to execute

#### Unit Tests to Implement
```bash
# Create new test files
tests/unit/v13/core/autonomous-decision-making.test.js
tests/unit/v13/core/enhanced-tool-scheduler.test.js
```

**Test Coverage Requirements**:
- Autonomous workflow execution scenarios
- Tool risk assessment and auto-approval logic
- Progress tracking and reporting
- Error recovery without user intervention

#### Verification Commands
```bash
npm test                                          # Test autonomous patterns
node tests/run-tests.js -i autonomous-workflow   # Integration test
```

### Iteration 4: Communication - Concise Patterns

#### Implementation Tasks
1. **Implement Communication Standards** (`lang/en.json`)
   - Add "< 3 lines when practical" guideline
   - Remove conversational filler patterns
   - Focus on action-oriented communication

2. **Update Chat Modal** (`scripts/ui/chat-modal.js`)
   - Implement progress indicators for tool execution
   - Add streaming response improvements
   - Enhance user experience with clearer feedback

#### Unit Tests to Implement
```bash
# Create new test files
tests/unit/v13/ui/concise-communication.test.js
tests/unit/v13/core/response-length-validation.test.js
```

**Test Coverage Requirements**:
- Response length validation
- Communication pattern enforcement
- Progress indicator functionality
- User experience improvements

### Iteration 5: TodoWrite Integration - Task Management

#### Implementation Tasks
1. **Enhance TodoWrite Workflow** (`lang/en.json`)
   - Add comprehensive TodoWrite usage patterns from Qwen Code
   - Include concrete examples and scenarios
   - Define clear workflow sequences

2. **Update TodoWrite Tool** (`scripts/tools/todo-write.js`)
   - Add workflow enforcement features
   - Implement automatic progress tracking
   - Enhance integration with agentic loop

#### Unit Tests to Implement
```bash
# Create new test files
tests/unit/v13/tools/enhanced-todo-write.test.js
tests/unit/v13/core/todo-workflow-integration.test.js
```

**Test Coverage Requirements**:
- TodoWrite workflow patterns
- Multi-step task tracking
- Progress state management
- Integration with agentic loop controller

### Iteration 6: Examples & Context - Practical Scenarios

#### Implementation Tasks
1. **Add Practical Examples** (`lang/en.json`)
   - Implement 5-7 concrete FoundryVTT scenarios
   - Follow Gemini CLI/Qwen Code example structure
   - Include worldbuilding-specific examples

2. **Implement Context-Aware Enhancements** (`scripts/settings.js`)
   - Add dynamic FoundryVTT context detection
   - Implement game system awareness
   - Add user role and permission context

#### Unit Tests to Implement
```bash
# Create new test files
tests/unit/v13/settings/context-aware-prompts.test.js
tests/unit/v13/core/foundry-context-detection.test.js
```

**Test Coverage Requirements**:
- Example scenario validation
- Context detection accuracy
- Dynamic prompt building
- Multi-system compatibility

### Continuous Testing Strategy

#### Regression Test Suite
```bash
# Create comprehensive regression tests
tests/regression/agentic-workflow-improvements.test.js
```

**Coverage Areas**:
- End-to-end workflow execution
- Response format compatibility
- Tool integration reliability
- Performance benchmarking

#### Integration Testing
```bash
# Enhanced integration tests
tests/integration/v13/improved-agentic-workflows.test.js
```

**Test Scenarios**:
- Complex worldbuilding tasks (create NPC with backstory, location, items)
- Multi-document creation workflows
- Error recovery and autonomous decision-making
- TodoWrite task management across extended workflows

#### Performance Metrics
```bash
# Add performance tracking
tests/performance/agentic-loop-performance.test.js
```

**Metrics to Track**:
- Average workflow completion time
- Tool execution success rates
- User satisfaction indicators (fewer confirmations needed)
- Token usage efficiency improvements

### Testing Commands per Iteration

```bash
# After each iteration
npm test                                    # Unit test validation
npm run test:unit:v13                      # FoundryVTT v13 specific tests
node tests/run-tests.js --manual           # Manual integration testing
npm run lint && npm run format             # Code quality

# Before merging each iteration
node tests/run-tests.js -r agentic-improvements  # Full regression suite
npm run quality:check                            # Final quality validation
```

### Success Metrics

#### Quantitative Metrics
- **Test Coverage**: Maintain >80% coverage while adding new features
- **Response Time**: Reduce average workflow completion time by 30%
- **Autonomy Rate**: Increase autonomous task completion from ~40% to >80%
- **Error Rate**: Reduce workflow failures by 50%

#### Qualitative Metrics  
- **User Experience**: More natural, conversational interactions
- **Task Completion**: Higher success rate for complex worldbuilding tasks
- **Developer Experience**: Clearer debugging and error reporting
- **Maintainability**: Better organized, more testable codebase

This iterative approach ensures each improvement is properly tested and validated before moving to the next enhancement, maintaining the high quality standards established in your existing codebase.