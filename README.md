# Simulacrum: AI Campaign Copilot

<p align="center">
  <a href="https://foundryvtt.com/packages/simulacrum"><img src="https://img.shields.io/badge/FoundryVTT-Install%20Package-e67e22?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFjSURBVDhPYxgFxAAmJqb/QBo5jBQAygQpRQb4NMI0wTUyMDD8h9JYMYpGmCYGJiamB1A5OI0kDQE0jQxAza+gNFwzugagRmagxgdQ6QdQjf+hGv8zMzM/gEojawRqegCl/zMxMT2AaQTRf5mYGB4wMjLeB2kA0f+Zn0JNAND/mR9C7YJphNFQDf+ZgZoeMDExPGBkYrgPchLIJJC9IAwEQP4TcCBI439mpvtQOxjugzTCNMJoEAbRQLX3mZiYQE4FagQFEchJYA0wTQgMchKS5vtY5SGGwjXCaKgmkPP+A8kHUI0PYHYxMTHch2nEhmEa/zM/hWq6z/AQ6lSYRhAN1YgLIzT+Z4Y67T/I5UB9D0Ca/sPcCKOhGmGy+DXCNLhBnXafgenZfZBGsJP+g5yKYi8DTDMjE9N/qBQ8bqAqYXpxarxPTDiD8qCMIBmkBlU1UhpGayQmjJE1wjSgJAgGBgCmJJx6XoJdXwAAAABJRU5ErkJggg==" alt="Install on FoundryVTT"></a>
  <a href="https://discord.gg/VSs8jZBgmP"><img src="https://img.shields.io/discord/1466476707522543742?style=for-the-badge&logo=discord&logoColor=white&label=Discord&color=5865F2" alt="Discord"></a>
  <a href="https://buymeacoffee.com/daxiongmao87"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-yellow?style=for-the-badge&logo=buymeacoffee" alt="Buy Me a Coffee"></a>
</p>

<p align="center">
  <a href="https://foundryvtt.com/"><img src="https://img.shields.io/endpoint?url=https://foundryshields.com/version?url=https://github.com/Daxiongmao87/simulacrum-foundry/releases/latest/download/module.json" alt="Foundry Version"></a>
  <a href="https://forge-vtt.com/bazaar#package=simulacrum"><img src="https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https://forge-vtt.com/api/bazaar/package/simulacrum&colorB=4aa94a" alt="Forge Installs"></a>
  <a href="https://github.com/Daxiongmao87/simulacrum-foundry/releases"><img src="https://img.shields.io/github/downloads/Daxiongmao87/simulacrum-foundry/total?logo=GitHub" alt="GitHub Downloads"></a>
  <a href="https://github.com/Daxiongmao87/simulacrum-foundry/releases/latest"><img src="https://img.shields.io/github/v/release/Daxiongmao87/simulacrum-foundry" alt="Latest Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Daxiongmao87/simulacrum-foundry" alt="License"></a>
</p>

An AI-powered Campaign Copilot for [Foundry Virtual Tabletop](https://foundryvtt.com/) that helps Game Masters manage their campaigns through natural language conversation.

<p align="center">
  <a href="https://www.youtube.com/watch?v=tu1EZ57aNW8"><strong>Video: Grunk Test</strong></a><br>
  <a href="https://www.youtube.com/watch?v=tu1EZ57aNW8"><img src="https://i.ytimg.com/an_webp/SavHeq80Ymk/mqdefault_6s.webp?du=3000&sqp=CO2-oMwG&rs=AOn4CLDwsWxvagwAX6DadQT171jAjTOZvQ" alt="Simulacrum AI Assistant" width="400"></a>
</p>

## What is Simulacrum?

Simulacrum is an intelligent agent that lives inside your Foundry VTT sidebar. Unlike simple text generators, Simulacrum is a **Campaign Copilot**—it can understand your requests, plan multi-step operations, and directly interact with your game world.

**Ask it to:**
- Create NPCs, items, journal entries, and other documents
- Search and read existing campaign content
- Update documents with new information
- Execute complex multi-step tasks
- Run custom macros and JavaScript automation

## Features

### Intelligent Document Management
Simulacrum understands Foundry VTT's document structure. Create an actor, and it knows about abilities, items, and system-specific fields. Ask for a magic sword, and it builds one with proper stats.

### Extensible Tool System
The AI uses a set of tools to interact with your world:
- **Document Tools**: Create, read, update, delete, search, and list documents
- **Compendium Tools**: Lock/unlock packs, manage document ownership
- **Asset Search**: Find images, audio, and other assets in your data
- **Schema Introspection**: Understands your game system's data structures
- **Macro Execution**: Run any macro in your world
- **JavaScript Execution**: Advanced automation capabilities

### Tool Permission Controls
Destructive operations (update, delete, macro/JS execution) require confirmation before executing. Configure per-tool permissions with Allow, Deny, Always Allow, or Blacklist options.

### Task Tracking
For complex operations, Simulacrum can create and manage tasks, tracking progress across multiple steps and reporting when complete.

### Multi-Provider Support
Connect to any OpenAI-compatible API endpoint:
- OpenAI (GPT-4o, etc.)
- Google Gemini (via [OpenAI-compatible endpoint](https://ai.google.dev/gemini-api/docs/openai))
- Anthropic Claude (via proxy or OpenRouter)
- OpenRouter, LLM7, and other aggregators
- Local models (Ollama, LM Studio, etc.)

### GM-Only Access
Simulacrum is restricted to Game Masters only—players cannot access the AI interface or execute commands.

## Installation

### From Foundry VTT
1. Open Foundry VTT and navigate to **Add-on Modules**
2. Click **Install Module**
3. Search for "Simulacrum"
4. Click **Install**

### Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/Daxiongmao87/simulacrum-foundry/releases)
2. Extract to your `Data/modules/` directory
3. Restart Foundry VTT

## Configuration

1. Enable the module in your world
2. Open **Module Settings** → **Simulacrum**
3. Configure your API Base URL and API Key
4. Access Simulacrum from the sidebar tab
5. Select a model from the dropdown in the sidebar header

### Required Settings
- **API Base URL**: Your provider's OpenAI-compatible endpoint (e.g., `https://api.openai.com/v1`)
- **API Key**: Your provider's API key

The model selector in the sidebar automatically fetches available models from your configured endpoint.

For detailed setup instructions, including free tier options and troubleshooting, see the **[Getting Started Guide](docs/GETTING-STARTED.md)**.

## Usage

Click the Simulacrum tab in the sidebar and start chatting. Examples:

> "Create a goblin warrior named Grunk with 15 HP and a rusty shortsword"

> "Find all journal entries about the Kingdom of Eldoria"

> "Update the Dragon's Lair scene to add a treasure hoard in the corner"

> "Create a task to build out the entire merchant guild, including 5 NPCs and their shop inventory"

## Extending Simulacrum

### Custom Macro Tools

You can create custom tools for Simulacrum by creating a standard Foundry VTT Macro. To expose a macro as a tool, add a `const tool` configuration object to your macro code:

```javascript
// Tool Configuration - This tells Simulacrum how to use this macro
const tool = {
    name: "my_custom_tool",
    description: "A description of what this tool does",
    parameters: {
        type: "object",
        properties: {
            parameterName: {
                type: "string",
                description: "Description of the parameter"
            }
        },
        required: ["parameterName"]
    },
    enabled: true
};

// Your macro logic here
// Access parameters via: this.args.parameterName
const result = `Processed: ${this.args.parameterName}`;

// Return a value to send output back to the AI
return result;
```

**Important notes:**
- A `response` parameter is automatically added to all macro-tools, allowing the AI to explain what it's doing to the user
- **Return a value** from your macro to provide output to the AI (strings or objects work)
- If you don't return anything, the AI sees "No output"
- Simulacrum automatically discovers any macro with this configuration and makes it available to the AI

### JavaScript Execution
For advanced users, Simulacrum can execute arbitrary JavaScript, enabling complex automation workflows.

## Requirements

- Foundry VTT v13.0.0 or higher
- An OpenAI-compatible API endpoint with **tool/function calling support**

> [!IMPORTANT]
> **Simulacrum requires models that support tool/function calling.** This is how the AI interacts with your Foundry world. Models without tool support will produce errors or fail to respond. See [Choosing a Model](#choosing-a-model) below.

### Choosing a Model

Simulacrum works with any OpenAI-compatible endpoint that supports tool calling. Below are some common options, but any compatible provider will work:

#### Free Tier (~$0)

Perfect for trying Simulacrum or light usage.

| Provider | Setup |
|----------|-------|
| **Google AI Studio** | Base URL: `https://generativelanguage.googleapis.com/v1beta/openai`<br>Get API key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)<br>Model: `gemini-3-flash-preview` or `gemini-3-pro-preview` |
| **OpenRouter Free** | Base URL: `https://openrouter.ai/api/v1`<br>Get API key: [openrouter.ai/keys](https://openrouter.ai/keys)<br>Model: `openrouter/auto` (auto-selects free models with tool support) |

*Free tiers have rate limits (typically 50-250 requests/day). Sufficient for testing and occasional use.*

#### Pay-Per-Use (~$0.01-0.10 per session)

Best balance of cost, speed, and capability.

| Provider | Setup |
|----------|-------|
| **OpenAI** | Base URL: `https://api.openai.com/v1`<br>Models: `gpt-5-nano` (cheapest), `gpt-5-mini`, `gpt-5.2` |
| **Anthropic** | Requires [OpenRouter](https://openrouter.ai) or compatible proxy<br>Models: `claude-haiku-4.5`, `claude-sonnet-4.5`, `claude-opus-4.5` |
| **OpenRouter** | Access to 100+ models from one API key<br>[Browse models with tool support](https://openrouter.ai/models?supported_parameters=tools) |

#### Local Inference (Hardware Investment)

Run models privately on your own hardware.

| Component | Recommendation |
|-----------|---------------|
| **Software** | [Ollama](https://ollama.com) — see their [model library](https://ollama.com/library) for tool-capable models |
| **Model Size** | 20B+ parameters recommended for complex tasks |
| **GPU VRAM** | 24GB+ for best experience (16GB minimum with quantization) |
| **Hardware Cost** | Used RTX 3090 (~$800-1300) or RTX 4090 (~$2200) |

> [!WARNING]
> **Small models (7B-14B) will struggle** with Simulacrum's multi-tool workflows. Expect slow responses and frequent errors. If your hardware is limited, cloud APIs provide a better experience.

### Verifying Tool Support

Not sure if your model supports tools? Check these resources:
- **OpenRouter**: [Models with tool support](https://openrouter.ai/models?supported_parameters=tools)
- **Ollama**: Model pages indicate "Tools" support in capabilities
- **Provider docs**: Search for "function calling" or "tool use" in your provider's documentation

## Support

- **Issues**: [GitHub Issues](https://github.com/Daxiongmao87/simulacrum-foundry/issues)
- **Source**: [GitHub Repository](https://github.com/Daxiongmao87/simulacrum-foundry)
- **Donate**: [Buy Me a Coffee](https://buymeacoffee.com/daxiongmao87)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

Created by [Daxiongmao87](https://github.com/Daxiongmao87)
