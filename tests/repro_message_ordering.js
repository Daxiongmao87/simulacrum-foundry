import { smartSliceMessages } from '../scripts/utils/message-utils.js';

// Valid sequence that gets broken by naive slicing
const messages = [
    { role: 'user', content: 'Message 1' },
    { role: 'assistant', content: 'Use tool', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'test_tool' } }] },
    { role: 'tool', content: 'Result 1', tool_call_id: 'call_1' },
    { role: 'user', content: 'Message 2' }
];

// Smart slice (last 2 messages) - simulates contextLength = 2
const contextLength = 2;
const sliced = smartSliceMessages(messages, contextLength);

console.log('Original Messages:', messages.length);
console.log('Sliced Messages:', sliced.length);
console.log('Sliced Content:', JSON.stringify(sliced, null, 2));

// Check validity
const firstMsg = sliced[0];
if (firstMsg.role === 'tool') {
    console.error('FAIL: First message is an orphaned TOOL result!');
    process.exit(1);
} else {
    console.log('PASS: First message is valid.');
}
