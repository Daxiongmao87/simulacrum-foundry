// scripts/test/tool-call-parser.test.js
import { ToolCallParser } from '../core/tool-call-parser.js';
import { createMockTool } from './utils.js';
import { assert } from './utils.js';

export async function runTest() {
  const registry = {
    getTool: (name) => {
      if (name === 'echo') return createMockTool('echo', async (args) => ({ success: true, result: args.message }));
      return null;
    }
  };

  const parser = new ToolCallParser(registry);

  // Test functionCalls array
  const aiResp1 = { functionCalls: [{ name: 'echo', args: { message: 'hi' } }] };
  const calls1 = parser.parseResponse(aiResp1);
  assert(calls1.length === 1 && calls1[0].name === 'echo', 'Parse functionCalls');

  // Test JSON block
  const aiResp2 = 'Here is a call: ```json\n{\n  "name": "echo",\n  "args": {"message": "json"}\n}\n```';
  const calls2 = parser.parseResponse(aiResp2);
  assert(calls2.length === 1 && calls2[0].args.message === 'json', 'Parse JSON block');

  // Test malformed JSON
  const aiResp3 = '```json\n{invalid}\n```';
  const calls3 = parser.parseResponse(aiResp3);
  assert(calls3.length === 0, 'Malformed JSON should be ignored');
}
