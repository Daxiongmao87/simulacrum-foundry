# Simulacrum: AI Campaign Assistant

## Project Overview

Simulacrum is a Foundry VTT module that provides an AI-powered assistant for campaign document management. The module allows users to create, modify, and query their campaign documents using natural language through integration with various AI providers including OpenAI, Ollama, and Google Gemini.

The project is built as a Node.js/JavaScript module with the following key features:
- Integration with Foundry VTT's sidebar system
- Support for multiple AI providers (OpenAI, Ollama, Gemini)
- Tool-based system for document manipulation (create, read, update, delete, search, list)
- Conversation history persistence
- Real-time chat interface within Foundry VTT

## Architecture

The module follows a modular architecture with these main components:

### Core
- `simulacrum-core.js`: Main module logic, initialization, and conversation management
- `ai-client.js`: Abstraction layer for AI provider interactions
- `chat-handler.js`: Handles user messages and AI responses
- `document-api.js`: Interface for Foundry VTT document operations
- `tool-registry.js`: Registry for AI tools and functions

### Tools
- `document-create.js`, `document-read.js`, `document-update.js`, `document-delete.js`, `document-list.js`, `document-search.js`, `document-schema.js`: Specialized tools for document operations

### UI
- `simulacrum-sidebar-tab.js`: Foundry VTT sidebar integration
- Handlebars templates for the chat interface
- CSS styling in `styles/simulacrum.css`

### Utilities
- Error handling, logging, validation, and content processing utilities
- Markdown rendering and content processing

## Building and Running

### Prerequisites
- Node.js (version 18+ recommended)
- Foundry VTT (minimum version 13.0.0, verified on 13.331)

### Installation
1. Clone the repository
2. Navigate to the project directory
3. Install dependencies: `npm install`

### Development Commands
- `npm test`: Run Jest tests
- `npm run test:watch`: Run tests in watch mode
- `npm run test:coverage`: Run tests with coverage
- `npm run lint`: Lint JavaScript files
- `npm run lint:check`: Check linting without fixing
- `npm run format`: Format code with Prettier
- `npm run format:check`: Check formatting without changing files
- `npm run package:module`: Package the module for distribution
- `npm run launch:foundry`: Launch Foundry VTT with the module
- `npm run deploy:module`: Deploy the module to a Foundry instance

### Development Setup
1. Install dependencies: `npm install`
2. Configure your AI provider settings in Foundry VTT's module configuration
3. Build the module: `npm run package:module`
4. Launch Foundry VTT: `npm run launch:foundry`

## Development Conventions

### Code Style
- Uses ESLint for code linting with Prettier for formatting
- Follows Foundry VTT's JavaScript conventions
- Uses modern ES6+ syntax with modules
- Includes JSDoc comments for public methods and classes

### Testing
- Jest for unit testing
- Tests located in the `tests/` directory
- Configuration in `jest.config.js`

### Git Hooks
- Husky configured to run linting and formatting before commits

### Internationalization
- Uses Foundry VTT's i18n system
- Language files located in `lang/` directory
- English translations in `lang/en.json`

## Key Features

### AI Provider Support
- OpenAI-compatible APIs (including Ollama)
- Google Gemini-compatible APIs
- Configurable API keys, base URLs, models, and temperature settings

### Document Operations
- Create, read, update, delete, list, and search Foundry VTT documents
- Schema-aware document operations
- Validation of document types and fields

### Chat Interface
- Sidebar integration with real-time chat
- Conversation history persistence
- Tool call visualization
- Markdown support for rich formatting

### System Integration
- Hooks into Foundry VTT's lifecycle events
- User-specific conversation history
- GM and player role support

## Configuration

The module can be configured through Foundry VTT's settings interface with options for:
- API provider selection
- API key and base URL
- AI model selection
- Context length and temperature settings
- Custom system prompts
- Legacy mode (for older AI models without tool calling support)

## Known Issues and Planned Features

See `remaining_tasks.md` for a list of current issues and planned features, including:
- Detachable chat window functionality
- Document linking through drag-and-drop
- Enhanced error handling
- Improved UI styling and animations
- File picker integration for artifact search
- Macro compendium integration