import { AgenticContext } from '../../../scripts/core/agentic-context.js';

describe('AgenticContext Chat Formatting', () => {
  let context;

  beforeEach(() => {
    context = new AgenticContext();
  });

  test('should not include tool calls in chat prompt', async () => {
    // Add a user message
    context.addUserMessage('Create a magic sword');
    
    // Add an AI response with tool calls
    context.addAIResponse({
      message: 'I\'ll create a magic sword for you.',
      tool_calls: [
        {
          tool_name: 'create_document',
          parameters: { documentType: 'Item', name: 'Flame Blade' }
        }
      ],
      continuation: { in_progress: true, gerund: 'creating' }
    });
    
    // Add tool results
    context.addToolResults([
      {
        tool_name: 'create_document',
        result: { id: '123', name: 'Flame Blade' }
      }
    ]);
    
    // Get the chat prompt
    const chatPrompt = await context.toChatPrompt();
    
    // Verify it doesn't contain the confusing text
    expect(chatPrompt).not.toContain('AI previously called tools');
    expect(chatPrompt).not.toContain('tool_calls');
    
    // Verify it contains the expected content
    expect(chatPrompt).toContain('User: Create a magic sword');
    expect(chatPrompt).toContain('AI: I\'ll create a magic sword for you.');
    expect(chatPrompt).toContain('Tool Result (create_document):');
  });

  test('toMessagesArray should properly format messages for AI API', () => {
    // Add various message types
    context.addUserMessage('Hello AI');
    context.addAIResponse({
      message: 'Hello! How can I help?',
      continuation: { in_progress: false }
    });
    context.addUserMessage('Create an NPC');
    context.addAIResponse({
      message: 'Creating an NPC for you.',
      tool_calls: [{ tool_name: 'create_document' }],
      continuation: { in_progress: true, gerund: 'creating' }
    });
    context.addToolResults([
      {
        tool_name: 'create_document',
        result: { id: 'npc123', name: 'Gandalf' }
      }
    ]);
    
    // Convert to messages array
    const messages = context.toMessagesArray();
    
    // Verify structure
    expect(messages).toHaveLength(5);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello AI' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Hello! How can I help?' });
    expect(messages[2]).toEqual({ role: 'user', content: 'Create an NPC' });
    expect(messages[3]).toEqual({ role: 'assistant', content: 'Creating an NPC for you.' });
    expect(messages[4].role).toBe('system');
    expect(messages[4].content).toContain('Tool create_document result:');
  });

  test('conversation history should be preserved across interactions', () => {
    // Simulate multiple interactions
    context.addUserMessage('What is the weather?');
    context.addAIResponse({
      message: 'I cannot check real-world weather, but I can help with your campaign!',
      continuation: { in_progress: false }
    });
    
    context.addUserMessage('Create a tavern');
    context.addAIResponse({
      message: 'I\'ll create a tavern for your campaign.',
      tool_calls: [{ tool_name: 'create_document' }],
      continuation: { in_progress: true, gerund: 'creating' }
    });
    
    // Get messages array
    const messages = context.toMessagesArray();
    
    // Verify all interactions are preserved
    expect(messages).toHaveLength(4);
    expect(messages.filter(m => m.role === 'user')).toHaveLength(2);
    expect(messages.filter(m => m.role === 'assistant')).toHaveLength(2);
    
    // Verify order is maintained
    expect(messages[0].content).toContain('weather');
    expect(messages[1].content).toContain('cannot check real-world weather');
    expect(messages[2].content).toContain('Create a tavern');
    expect(messages[3].content).toContain('create a tavern');
  });
});