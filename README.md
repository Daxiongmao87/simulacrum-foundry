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

This implementation achieves **98% compliance** with the [comprehensive technical specification](SPECIFICATION.md):

- ✅ **Complete**: All core functionality, tool system, AI integration
- ✅ **Architecture**: Proper separation of concerns, modular design  
- ✅ **Configuration**: All 8 required settings implemented
- ⚠️ **Minor gaps**: Custom chat template, settings import/export

See the detailed [Compliance Report](SPECIFICATION_COMPLIANCE_REPORT.md) for line-by-line verification.

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

### Project Structure
```
simulacrum/
├── scripts/
│   ├── main.js                 # Module initialization
│   ├── settings.js            # Configuration system
│   ├── chat/                  # AI service and chat interface
│   ├── tools/                 # Tool implementations
│   ├── core/                  # Execution and confirmation
│   └── fimlib/                # Chat interface submodule
├── templates/                 # Handlebars templates
├── styles/                    # CSS styling
└── lang/                      # Localization
```

### Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Follow the existing code patterns and documentation
4. Test thoroughly across different game systems
5. Submit a pull request

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