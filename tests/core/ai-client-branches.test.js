// SPDX-License-Identifier: MIT
import { AIClient, SimulacrumError } from '../../scripts/core/ai-client.js';

describe('AIClient branch coverage', () => {
  beforeEach(() => {
    global.fetch.mockReset();
  });

  test('chat throws when no baseURL configured', async () => {
    const client = new AIClient({ model: 'm' });
    await expect(client.chat([])).rejects.toThrow('No baseURL configured for AI client');
  });

  test('OpenAI error path handles text-only error bodies', async () => {
    const client = new AIClient({ baseURL: 'https://api.openai.com/v1', apiKey: 'k', model: 'm' });
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.reject(new Error('bad json')), text: () => Promise.resolve('oops') });
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(new RegExp('500 - oops'));
  });

  test('Ollama error path handles text-only error bodies', async () => {
    const client = new AIClient({ baseURL: 'http://localhost:11434/v1', model: 'm' });
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.reject(new Error('bad json')), text: () => Promise.resolve('oops') });
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(new RegExp('500 - oops'));
  });

  test('validateConnection maps 401 and 500 errors for OpenAI', async () => {
    const client = new AIClient({ baseURL: 'https://api.openai.com/v1', apiKey: 'k', model: 'm' });
    // 401
    global.fetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({ message: 'nope' }) });
    await expect(client.validateConnection()).rejects.toThrow('AI API connection error: 401 - Connection error');
    // 500
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ message: 'server err' }) });
    await expect(client.validateConnection()).rejects.toThrow('AI API connection error: 500 - server err');
  });

  test('chat does not rely on Node globals when process is undefined', async () => {
    const savedProcess = global.process;
    // Remove process to simulate Foundry/browser context
    // eslint-disable-next-line no-global-assign
    try { global.process = undefined; } catch (_) {}
    const client = new AIClient({ baseURL: 'https://api.openai.com/v1', apiKey: 'k', model: 'm' });
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }) });
    const res = await client.chat([{ role: 'user', content: 'hi' }]);
    expect(res).toBeDefined();
    // Restore process
    try { global.process = savedProcess; } catch (_) {}
  });
});
