// Quick debug script to test the streaming logic
import { SimulacrumAIService } from './scripts/chat/ai-service.js';

// Mock the necessary objects
global.game = {
  settings: {
    get: (module, key) => {
      if (key === 'apiEndpoint') return 'http://localhost:11434';
      if (key === 'modelName') return 'test-model';
      if (key === 'systemPrompt') return '';
      if (key === 'contextLength') return 8192;
      if (key === 'apiKey') return '';
      return null;
    }
  },
  simulacrum: {
    logger: {
      debug: console.log,
      warn: console.warn,
      error: console.error
    },
    toolRegistry: {
      getAllTools: () => []
    }
  },
  i18n: {
    localize: (key) => {
      if (key === 'SIMULACRUM.SYSTEM_PROMPT_LINES.0') {
        return 'Test system prompt';
      }
      return key;
    }
  }
};

const mockToolRegistry = {
  getAllTools: () => [],
  tools: new Map()
};

const aiService = new SimulacrumAIService(mockToolRegistry);

const jsonResponse = JSON.stringify({
  message: "Streaming response",
  tool_calls: [],
  continuation: { in_progress: false, gerund: null }
});

console.log('Testing with jsonResponse:', jsonResponse);

// Test the streaming processing logic manually
const mockReader = {
  read: () => Promise.resolve({
    done: false,
    value: new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"${jsonResponse}"}}]}\n\n`)
  }).then(() => Promise.resolve({
    done: false,
    value: new TextEncoder().encode('data: [DONE]\n\n')
  })).then(() => Promise.resolve({
    done: true
  })),
  releaseLock: () => {}
};

// This is not a perfect test since read() should be called multiple times
// But it shows the structure we're working with
console.log('Mock reader structure:', mockReader);