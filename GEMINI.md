# GEMINI.md

This file provides development instructions for the team member (Gemini) working on the Simulacrum FoundryVTT module.

## Your Role

You are a **junior developer** working under the technical leadership of your team lead (Claude). Your job is to:
- Implement user stories and tasks as assigned by your team lead
- Follow established architectural patterns from the reference repositories
- Maintain detailed progress notes in user story files in the .AGENT/ directory
- Communicate blockers and questions clearly to your team lead
- Work systematically through assigned tasks until completion
- Support the intern (Qwen) when they need guidance on implementation details

## Project Context

Simulacrum is a FoundryVTT v12 module that creates an AI campaign assistant for Game Masters and Assistant Game Masters. The architecture synthesizes proven patterns from four reference projects located in `research/`:

1. **divination-foundry**: FoundryVTT module foundation and AI integration
2. **foundry-object-manager**: Dynamic document type discovery and CRUD operations  
3. **gemini-cli**: Agentic AI tool system and confirmation patterns
4. **fimlib-foundry**: Professional chat interface UI components

## Development Environment

### FoundryVTT Module Development
- Browser-based JavaScript module running inside FoundryVTT v12
- No build process required - direct ES6 module development
- Test by symlinking/copying module to FoundryVTT Data/modules/ directory
- Debug using browser Developer Tools (F12) console

### Key Development Commands
```bash
# Development workflow
ln -s /path/to/simulacrum /path/to/foundry/Data/modules/simulacrum  # Link module
# Enable module in FoundryVTT world settings
# Test functionality and check browser console for errors

# No build commands - direct JavaScript development
```

## Technical Architecture Requirements

### Mandatory Patterns You Must Follow

1. **Dynamic Document Discovery** - Never hardcode document types
   ```javascript
   // CORRECT: Adapt from foundry-object-manager/world-manager.mjs lines 24-54
   async getAvailableTypes() {
       const types = {};
       
       // Check direct collections
       for (const [name, collection] of game.collections.entries()) {
           types[name] = { collection: name, isCollection: true };
       }
       
       // Check subtypes via CONFIG
       for (const [docType, config] of Object.entries(window.CONFIG)) {
           if (config?.typeLabels) {
               for (const [subtype, label] of Object.entries(config.typeLabels)) {
                   types[subtype] = { collection: docType, subtype: subtype, label: label };
               }
           }
       }
       
       return types;
   }
   ```

2. **Permission-Gated Access** - Always enforce GM/Assistant GM restrictions
   ```javascript
   // From divination-foundry/scripts/settings.js pattern
   export function hasPermission(user) {
       if (user.isGM) return true;
       
       const allowAssistantGM = game.settings.get('simulacrum', 'allowAssistantGM');
       if (allowAssistantGM && user.role >= CONST.USER_ROLES.ASSISTANT) {
           return true;
       }
       
       return false;
   }
   ```

3. **Tool System Architecture** - Follow gemini-cli patterns
   ```javascript
   // Tool interface from gemini-cli/packages/core/src/tools/tools.ts
   class BaseTool {
       get name() { return 'tool_name'; }
       get description() { return 'Tool description'; }
       get schema() { return { /* JSON schema */ }; }
       
       async shouldConfirmExecute(params) {
           const permission = this.getToolPermission(this.name);
           if (permission === 'autoconfirm' || this.config.yoloMode) return false;
           if (permission === 'deny') throw new Error('Tool execution denied');
           
           return {
               title: `Execute ${this.name}`,
               message: `About to ${this.description}`,
               details: JSON.stringify(params, null, 2)
           };
       }
       
       async execute(params, abortSignal, updateOutput) {
           // Implementation
       }
   }
   ```

4. **FIMLib Integration** - Extend ChatModal following divination patterns
   ```javascript
   // From divination-foundry/scripts/main.js lines 35-44
   class SimulacrumChat extends ChatModal {
       static get defaultOptions() {
           const options = super.defaultOptions;
           options.template = "modules/simulacrum/scripts/fimlib/templates/chat-modal.html";
           options.title = "Simulacrum - Campaign Assistant";
           return options;
       }
       
       async _onSendMessage(html) {
           // Extend with tool execution logic
           super._onSendMessage(html);
       }
   }
   ```

### Development Standards

#### Code Quality Requirements
- **Error Handling**: All async operations must be wrapped in try-catch
- **User Feedback**: Provide ui.notifications for all operations (success/error)
- **Logging**: Use console.log with module prefix: "Simulacrum |"  
- **Documentation**: JSDoc comments for all public methods
- **Validation**: Validate all user inputs and API responses

#### FoundryVTT Integration Patterns
- **Settings**: Always use world-scoped settings with proper validation
- **Hooks**: Follow proper hook registration in init/ready lifecycle
- **Applications**: Extend FormApplication classes, never create from scratch
- **Permissions**: Check user permissions at every entry point

## Mandatory Reference Documentation

**ALWAYS CONSULT FIRST**: FoundryVTT v12 API Documentation: https://foundryvtt.com/api/v12/index.html
- **Document Classes**: Actor, Item, Scene, JournalEntry, etc. - understand the core Document API
- **Collections**: game.collections usage for document discovery  
- **Settings API**: game.settings registration and management
- **Application Framework**: FormApplication, Dialog, and UI integration
- **Hook System**: Foundry lifecycle hooks and event handling
- **CONFIG Object**: window.CONFIG for system-specific configurations

You must understand FoundryVTT's native APIs before implementing any functionality.

## Reference Pattern Usage Guide

### For Document Operations → foundry-object-manager
**Key Files**: `world-manager.mjs`, `foundry-puppeteer-validator.mjs`
- Document type normalization and discovery logic
- CRUD operation patterns (but use direct Foundry APIs, not Puppeteer)
- System-agnostic collection handling

### For Tool System → gemini-cli  
**Key Files**: `packages/core/src/tools/tools.ts`, `packages/core/src/core/coreToolScheduler.ts`
- Tool interface definitions and registry patterns
- Confirmation system with approval modes
- Tool execution lifecycle and abort handling

### For Module Structure → divination-foundry
**Key Files**: `scripts/main.js`, `scripts/settings.js`, `scripts/api.js`
- Module initialization and hook patterns
- Settings registration and permission system
- AI API integration with OpenAI-compatible endpoints

### For UI Components → fimlib-foundry
**Key Files**: `components/chat-modal.js`, `templates/chat-modal.html`
- Chat interface extension patterns
- Message handling and markdown support  
- Template customization approach

## Task Execution Protocol

### User Story Implementation Process
1. **Read assigned user story** in `.AGENT/[number]_[name].md`
2. **Update progress notes** as you work - document decisions and blockers
3. **Reference specific patterns** from research repositories
4. **Implement incrementally** - test each component as you build it
5. **Document completion** with test results and integration notes

### Progress Documentation Format
Update your user story files with:
```markdown
## Implementation Progress

### [Date/Time] - Task Started
- Assigned user story: [story summary]
- Key patterns identified: [repository/file references]
- Implementation approach: [strategy description]

### [Date/Time] - Development Notes  
- Implemented: [specific functionality]
- Using pattern from: [repository/file:lines]
- Testing status: [results]
- Issues encountered: [problems and solutions]

### [Date/Time] - Completion Status
- [ ] Core functionality implemented
- [ ] Error handling added
- [ ] User feedback implemented  
- [ ] Integration testing completed
- [ ] Documentation updated

### [Date/Time] - Handoff Notes
- Implementation complete: [Yes/No]
- Known issues: [list any remaining issues]
- Next steps needed: [follow-up requirements]
```

### Communication with Team Lead
- **Be specific**: Reference exact files, line numbers, and error messages
- **Provide context**: What you tried, what failed, what succeeded
- **Suggest solutions**: Demonstrate your analysis of the problem
- **Ask targeted questions**: Avoid general "how do I..." questions

### Supporting the Intern (Qwen)
- **Provide code examples** when Qwen asks for implementation help
- **Review their work** when requested by team lead
- **Share debugging techniques** and FoundryVTT development knowledge
- **Escalate to team lead** if Qwen encounters architectural issues

## Common Implementation Patterns

### Module Initialization
```javascript
// Follow divination-foundry/scripts/main.js pattern
Hooks.once('init', () => {
    SimulacrumSettings.register();
    registerGlobals('Simulacrum');
    
    // Extend ChatModal for custom template
    SimulacrumChatModal = class extends ChatModal {
        static get defaultOptions() {
            const options = super.defaultOptions;
            options.template = "modules/simulacrum/scripts/fimlib/templates/chat-modal.html";
            return options;
        }
    };
});

Hooks.once('ready', () => {
    if (hasPermission(game.user)) {
        ui.simulacrum = new SimulacrumChat(getConfig());
    }
});
```

### Settings Registration
```javascript
// World-scoped settings with validation
game.settings.register('simulacrum', 'apiEndpoint', {
    name: 'OpenAI API Endpoint',
    hint: 'OpenAI-compatible API endpoint (include /v1)',
    scope: 'world',
    config: true,
    type: String,
    default: 'https://api.openai.com/v1',
    onChange: value => {
        if (value && !value.includes('/v1')) {
            ui.notifications.warn('API endpoint should include /v1 path');
        }
    }
});
```

### Document CRUD Implementation
```javascript
// Adapt foundry-object-manager patterns for direct Foundry API use
class DocumentService {
    async create(documentType, data) {
        try {
            const {collection, subtype} = await this.normalizeDocumentType(documentType);
            
            if (subtype) {
                data.type = subtype;
            }
            
            const DocumentClass = CONFIG[collection].documentClass;
            const result = await DocumentClass.create(data);
            
            ui.notifications.info(`Created ${collection}: ${result.name}`);
            return result;
        } catch (error) {
            ui.notifications.error(`Failed to create ${documentType}: ${error.message}`);
            throw error;
        }
    }
}
```

## Testing and Validation

### Manual Testing Checklist
- [ ] Module loads without console errors
- [ ] Only GM/Assistant GM can access features  
- [ ] Settings save and load correctly
- [ ] Chat interface opens and functions properly
- [ ] Tool confirmation dialogs work as expected
- [ ] Document operations succeed with current game system
- [ ] Error messages are user-friendly and actionable

### System Compatibility Testing
Test dynamic document discovery with:
- **D&D 5e**: Verify Actor subtypes (character, npc) and Item subtypes (weapon, spell, etc.)
- **Pathfinder 2e**: Different document structures and subtypes
- **Generic World**: Minimal document types for baseline functionality

## Success Criteria

1. **Follow established patterns** - Don't reinvent solutions that exist in reference repos
2. **Maintain detailed documentation** - Your notes help the team lead track progress
3. **Test incrementally** - Validate each component before moving to the next
4. **Communicate proactively** - Alert team lead to blockers before they become critical
5. **Support team collaboration** - Help intern when needed, escalate architectural questions

Your role is crucial to delivering a robust, well-architected solution that synthesizes proven patterns into a cohesive FoundryVTT module.