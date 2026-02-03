#!/usr/bin/env node
/**
 * Integration test for Google Gemini OpenAI-compatible endpoint
 *
 * Usage:
 *   1. Copy .env.example to .env in this directory
 *   2. Add your GEMINI_API_KEY to .env
 *   3. Run: node tests/integration/test-gemini-openai.js
 *
 * Or pass the API key directly:
 *   GEMINI_API_KEY=your-key node tests/integration/test-gemini-openai.js
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file if it exists
function loadEnv() {
  const envPath = join(__dirname, '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  const env = {};
  const content = readFileSync(envPath, 'utf-8');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const fileEnv = loadEnv();
const API_KEY = process.env.GEMINI_API_KEY || fileEnv.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || fileEnv.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(status, message) {
  const icon = status === 'pass' ? `${GREEN}✓${RESET}` :
               status === 'fail' ? `${RED}✗${RESET}` :
               `${YELLOW}→${RESET}`;
  console.log(`${icon} ${message}`);
}

async function testListModels() {
  log('info', 'Testing /models endpoint...');

  const response = await fetch(`${BASE_URL}/models`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`/models failed: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('/models response missing data array');
  }

  // Check if configured model exists (with or without models/ prefix)
  const modelExists = data.data.some(m => m.id === MODEL || m.id === `models/${MODEL}`);
  if (!modelExists) {
    log('fail', `Model "${MODEL}" not found in available models`);
    log('info', `Available models: ${data.data.slice(0, 5).map(m => m.id).join(', ')}...`);
    throw new Error(`Model "${MODEL}" not available`);
  }

  log('pass', `/models returned ${data.data.length} models, "${MODEL}" found`);
  return data;
}

async function testChatCompletion() {
  log('info', 'Testing /chat/completions endpoint...');

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'user', content: 'Say "Hello, Simulacrum!" and nothing else.' }
      ],
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`/chat/completions failed: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0]?.message?.content) {
    throw new Error('/chat/completions response missing content');
  }

  const content = data.choices[0].message.content;
  log('pass', `/chat/completions returned: "${content.substring(0, 50)}..."`);
  return data;
}

async function testToolCalling() {
  log('info', 'Testing tool calling...');

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather in a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city name',
            },
          },
          required: ['location'],
        },
      },
    },
  ];

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo?' }
      ],
      tools,
      tool_choice: 'auto',
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tool calling failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  if (message?.tool_calls && message.tool_calls.length > 0) {
    const toolCall = message.tool_calls[0];
    log('pass', `Tool call received: ${toolCall.function.name}(${toolCall.function.arguments})`);
  } else if (message?.content) {
    log('pass', `Response (no tool call): "${message.content.substring(0, 50)}..."`);
  } else {
    throw new Error('Unexpected response format');
  }

  return data;
}

async function main() {
  console.log('\n=== Gemini OpenAI-Compatible Endpoint Tests ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Model: ${MODEL}`);
  console.log('');

  if (!API_KEY) {
    log('fail', 'GEMINI_API_KEY not set');
    console.log('\nSet it via:');
    console.log('  1. Create tests/integration/.env with GEMINI_API_KEY=your-key');
    console.log('  2. Or run: GEMINI_API_KEY=your-key node tests/integration/test-gemini-openai.js');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'List Models', fn: testListModels },
    { name: 'Chat Completion', fn: testChatCompletion },
    { name: 'Tool Calling', fn: testToolCalling },
  ];

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (error) {
      log('fail', `${test.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
