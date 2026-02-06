# Getting Started with Simulacrum

This guide helps you choose the right AI provider for your needs and get Simulacrum running quickly.

## Quick Start: Free Tier (Recommended for Testing)

The fastest way to try Simulacrum is with Google AI Studio's free API.

### Google AI Studio Setup

1. **Get an API key** at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. In Foundry, go to **Module Settings** → **Simulacrum**
3. Set **API Base URL** to:
   ```
   https://generativelanguage.googleapis.com/v1beta/openai
   ```
4. Paste your API key in **API Key**
5. Open the Simulacrum sidebar and select `gemini-3-flash-preview` from the model dropdown

**Rate limits**: ~50-250 requests per day depending on model. Plenty for testing and light use.

### OpenRouter Free Setup

OpenRouter offers access to multiple free models through one API.

1. Create an account at [openrouter.ai](https://openrouter.ai)
2. Get your API key at [openrouter.ai/keys](https://openrouter.ai/keys)
3. Set **API Base URL** to:
   ```
   https://openrouter.ai/api/v1
   ```
4. Select `openrouter/auto` to automatically use free models with tool support

**Rate limits**: 50 requests/day (increases to 1000 with $10+ balance).

---

## Pay-Per-Use Providers

For regular use, pay-per-use APIs offer the best experience. Typical costs:
- Simple requests: ~$0.001-0.01
- Complex multi-step operations: ~$0.05-0.10

### Cost Comparison

Pricing changes frequently. Check each provider's current rates:
- **OpenAI**: [openai.com/api/pricing](https://openai.com/api/pricing)
- **Anthropic**: [anthropic.com/pricing](https://www.anthropic.com/pricing)
- **OpenRouter**: [openrouter.ai/models](https://openrouter.ai/models) (shows per-model pricing)

### OpenAI Setup

1. Get an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Set **API Base URL** to:
   ```
   https://api.openai.com/v1
   ```
3. Recommended models:
   - `gpt-5-nano` — Fastest and cheapest
   - `gpt-5-mini` — Good balance
   - `gpt-5.2` — Best quality

### OpenRouter Setup (Multi-Provider Access)

OpenRouter gives you access to OpenAI, Anthropic, Google, and many other providers through one API key.

1. Add credits at [openrouter.ai/credits](https://openrouter.ai/credits)
2. Browse [models with tool support](https://openrouter.ai/models?supported_parameters=tools)
3. Use **API Base URL**:
   ```
   https://openrouter.ai/api/v1
   ```

---

## Local Inference with Ollama

Run AI models on your own hardware for privacy and no per-request costs.

### Hardware Requirements

> **Reality check**: Local inference requires significant hardware investment. If your setup doesn't meet these specs, cloud APIs will provide a much better experience.

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Model size** | 14B parameters | 20B+ parameters |
| **GPU VRAM** | 16GB (with 4-bit quantization) | 24GB+ |
| **Example GPUs** | RTX 4080 (16GB) | RTX 3090/4090 (24GB) |
| **Hardware cost** | ~$800-1000 | ~$1300-2200 |

### Why Small Models Struggle

Simulacrum uses 8+ tools for document management, search, macros, and more. Small models (7B-14B):
- Lack the reasoning capacity for multi-step tool orchestration
- Produce frequent validation errors
- May take 10+ minutes for complex requests

If you're seeing these issues, the model is likely too small, not a bug in Simulacrum.

### Ollama Setup

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model with tool support. Check the [Ollama library](https://ollama.com/library) for models marked with "Tools" capability.
3. Set **API Base URL** to:
   ```
   http://localhost:11434/v1
   ```
4. Select your model from the Simulacrum dropdown

For remote Ollama servers, you may need to configure `OLLAMA_ORIGINS` for CORS access. See [Ollama's documentation](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-configure-ollama-server).

---

## Troubleshooting

### "Validation errors" or model never responds

**Cause**: The model doesn't support tool/function calling.

**Fix**: Use a model that supports tools. Verify at:
- [OpenRouter tool-capable models](https://openrouter.ai/models?supported_parameters=tools)
- Ollama model pages (look for "Tools" in capabilities)

### Very slow responses (10+ minutes)

**Cause**: Model is too small or insufficient VRAM causing CPU offloading.

**Fix**:
- Use a larger model (20B+ recommended)
- Upgrade GPU to 24GB+ VRAM
- Switch to a cloud API for better performance

### Rate limit warnings

**Cause**: Exceeded free tier limits or provider rate limits.

**Fix**:
- Wait for limit reset (usually daily)
- Add credits to increase limits (OpenRouter)
- Switch to a paid tier

### API connection errors

**Cause**: Incorrect Base URL or unreachable endpoint.

**Fix**:
- Verify the Base URL matches your provider exactly
- For local Ollama, ensure the server is running (`ollama serve`)
- Check firewall/network settings for remote servers
