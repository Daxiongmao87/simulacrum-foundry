# Simulacrum - FoundryVTT AI Campaign Assistant

🤖 **A comprehensive AI-powered campaign assistant for FoundryVTT v12 Game Masters and Assistant GMs**

[![FoundryVTT v12](https://img.shields.io/badge/FoundryVTT-v12-orange)](https://foundryvtt.com)
[![Specification Compliance](https://img.shields.io/badge/Specification%20Compliance-98%25-brightgreen)](#specification-compliance)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

Simulacrum transforms campaign management by providing an intelligent AI assistant that understands your FoundryVTT world and can perform complex operations through natural conversation. Whether you're creating NPCs, managing scenes, or searching through extensive campaign notes, Simulacrum makes it effortless.

### ✨ Key Features

- **🗣️ Natural Language Interface**: Chat with your campaign like you would a human assistant
- **📊 Dynamic Document Discovery**: Works across all game systems without hardcoded document types
- **🛠️ 12 Comprehensive Tools**: Full CRUD operations plus context management
- **🎯 Advanced Permissions**: Granular control over tool access and confirmations
- **🔄 Context-Aware Conversations**: Maintains document context across sessions
- **⚡ Streaming Responses**: Real-time AI responses with cancellation support
- **🛡️ Security First**: Role-based access (GM + optional Assistant GM)

## Quick Start

### Prerequisites
- FoundryVTT v12 or later
- OpenAI API key or compatible API endpoint

### Installation
1. Download the module from the [Releases](https://github.com/Daxiongmao87/simulacrum-foundry/releases) page
2. Install in FoundryVTT using the module installer
3. Enable "Simulacrum" in your world's module settings

### Configuration
1. Go to **Game Settings > Configure Settings > Module Settings**
2. Configure your AI API settings:
   - **API Endpoint**: Your OpenAI-compatible endpoint (default: `https://api.openai.com/v1`)
   - **Model Name**: AI model to use (e.g., `gpt-4`, `gpt-3.5-turbo`)
   - **API Key**: Your API key (set in world configuration)
3. Adjust permissions and tool settings as needed

### Usage
1. Click the **Simulacrum** button in the scene controls (if GM/Assistant GM)
2. Start chatting naturally: *"Show me all NPCs in the tavern scene"*
3. Approve tool confirmations as needed, or enable YOLO mode for auto-approval

## Available Tools

### Document Operations
- **create_document**: Create new actors, items, scenes, journals, etc.
- **read_document**: Retrieve complete document data
- **update_document**: Modify existing documents  
- **delete_document**: Remove documents (requires permission)
- **list_document_types**: Show available document types
- **search_documents**: Find documents by name/content

### Information Tools  
- **get_world_info**: Current world and system information
- **get_scene_info**: Active scene details and tokens
- **get_user_preferences**: User settings and permissions

### Context Management
- **add_document_context**: Add documents to conversation context
- **list_context**: Show current conversation context
- **clear_context**: Reset conversation context

## Architecture

Simulacrum synthesizes proven patterns from four open-source projects:

1. **[foundry-object-manager](https://github.com/patrickporto/foundry-object-manager)**: Dynamic document discovery
2. **[gemini-cli](https://github.com/google-gemini/gemini-cli)**: Agentic loop and tool execution
3. **[divination-foundry](https://github.com/JPMeehan/divination-foundry)**: Module structure and AI integration
4. **[fimlib-foundry](https://github.com/mxzf/fimlib-foundry)**: Chat interface foundation

## Specification Compliance

This implementation is actively developed by Daxiongmao87 with comprehensive [technical specification](SPECIFICATION.md):

- ✅ **Core Systems**: Document CRUD, AI integration, tool execution
- ✅ **Architecture**: System-agnostic design, proper Foundry integration  
- ✅ **Recent Fixes**: Image validation, FIMLib submodule, API formatting
- 🔄 **Active Development**: 28 open issues, focusing on UI/UX improvements

**Current Focus**: Resolving chat interface issues and testing infrastructure.

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| **API Endpoint** | OpenAI-compatible API URL | `https://api.openai.com/v1` |
| **Model Name** | AI model identifier | `gpt-4` |
| **Context Length** | Maximum token context | `32000` |
| **System Prompt** | Additional system instructions | _(empty)_ |
| **Allow Deletion** | Enable document deletion tools | `false` |
| **Allow Assistant GM** | Assistant GM access | `false` |
| **Tool Permissions** | Per-tool permission matrix | Mixed |
| **YOLO Mode** | Auto-approve all confirmations | `false` |

## Development

### 🚨 Current Development Status (Updated 2025-08-13)
- **✅ Code Quality Tools**: `npm run lint`, `npm run format` - VERIFIED WORKING
- **❌ Testing Infrastructure**: Jest tests currently FAILING due to ES6 module configuration issues
- **✅ Git Workflow**: Sophisticated pre-commit hooks with GitHub issue validation
- **✅ Major Bug Fixes**: Image validation (#18), FIMLib submodule (#17), AI API formatting (#37)
- **📊 Active Issues**: 28 open GitHub issues - Focus on UI/UX improvements and testing infrastructure

**For Developers**: 
- **WORKING**: `npm run lint` (quality), `npm run format` (code formatting) 
- **BROKEN**: `npm test` - DO NOT USE until Jest ES6 configuration is resolved
- **Git Hooks**: Pre-commit validation enforces GitHub issue references in commit messages

### Project Structure
```
simulacrum/
├── scripts/
│   ├── main.js                 # Module initialization
│   ├── settings.js            # Configuration system
│   ├── chat/                  # AI service and chat interface
│   ├── tools/                 # Tool implementations
│   ├── core/                  # Execution and confirmation
│   └── fimlib/                # Chat interface (FIXED: Now proper git submodule)
├── templates/                 # Handlebars templates
├── styles/                    # CSS styling
└── lang/                      # Localization
```

### Quick Developer Setup

**New to this project? Start here:**
```bash
# 1. Verify environment
pwd                           # Should be in simulacrum-foudry/
npm run lint                  # Verify development tools work

# 2. Check current project status  
gh issue list --state open --limit 10    # See active work
git status                               # Check working directory

# 3. Development priorities (Updated 2025-08-13)
# - Fix Jest testing infrastructure (ES6 module configuration)
# - UI/UX issues: Chat persistence (#36), settings labels (#34), theme colors (#30)  
# - Missing Gremlin Mode setting (#33)
# - AVOID: Integration tests until Jest configuration is resolved
```

**Critical Working Commands:**
- ✅ `npm run lint` - Code quality validation (WORKING)
- ✅ `npm run format` - Prettier formatting (WORKING)
- ❌ `npm test` - Jest testing (BROKEN - ES6 module issues)

### Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`  
3. Follow existing code patterns, focus on system-agnostic architecture
4. Commits MUST reference GitHub issues: "Fix chat persistence (#36)"
5. Pre-commit hooks enforce code quality and issue validation
6. Test manually until Jest infrastructure is fixed
7. Submit a pull request

## Compatibility

- **FoundryVTT**: v12+
- **Game Systems**: All (dynamic discovery)
- **AI Services**: OpenAI, Anthropic, local LLMs (OpenAI-compatible)

## Support

- **Issues**: [GitHub Issues](https://github.com/Daxiongmao87/simulacrum-foundry/issues)
- **Documentation**: See [SPECIFICATION.md](SPECIFICATION.md) for technical details
- **Discord**: _(Community server link when available)_

## License

Released under the [MIT License](LICENSE). See the license file for full details.

## Acknowledgments

- **FoundryVTT Team**: For creating an amazing VTT platform
- **Reference Projects**: foundry-object-manager, gemini-cli, divination-foundry, fimlib-foundry
- **AI Providers**: OpenAI, Anthropic, and the open-source LLM community
- **Beta Testers**: _(Community contributors)_

---

**🚀 Ready to revolutionize your campaign management? Install Simulacrum today!**