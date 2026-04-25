import assert from 'node:assert/strict';

globalThis.FormApplication = class {};

const { COMPACTION_STATUS, ConversationManager } =
  await import('../../scripts/core/conversation.js');

const tokenizer = {
  estimateMessageTokens(message) {
    return Math.ceil(String(message?.content || '').length / 4);
  },
};

function createConversation(maxTokens = 1000) {
  return new ConversationManager('test-user', 'test-world', maxTokens, tokenizer);
}

function testPromptOverheadDoesNotDoubleCountRollingSummary() {
  const conversation = createConversation();
  conversation.rollingSummary = 'a'.repeat(100);
  conversation._recalculateTokens();

  const basePrompt = 'base system prompt';
  const systemPrompt = `### PREVIOUS CONVERSATION SUMMARY\n${conversation.rollingSummary}\n\n${basePrompt}`;
  const fullPromptTokens = conversation.estimateTokens({ role: 'system', content: systemPrompt });
  const summaryTokens = conversation.estimateTokens({ role: 'system', content: conversation.rollingSummary });

  assert.equal(conversation.estimatePromptOverhead(systemPrompt), fullPromptTokens - summaryTokens);
}

function testCustomPromptOverheadExcludesRollingSummary() {
  const conversation = createConversation(600);
  conversation.rollingSummary = 'a'.repeat(200);
  conversation._recalculateTokens();

  const customPrompt = 'short custom prompt';
  const overheadWithSummary = conversation.estimatePromptOverhead(customPrompt, true);
  const overheadWithoutSummary = conversation.estimatePromptOverhead(customPrompt, false);

  // Without summary subtraction, overhead should be higher (or equal if summary not in prompt)
  assert.ok(overheadWithoutSummary >= overheadWithSummary);
}

function testThresholdIsClampedWhenPromptConsumesContext() {
  const conversation = createConversation(100);

  assert.equal(conversation._getCompactionThreshold(100), 0);
  assert.equal(conversation._getCompactionThreshold(150), 0);
}

async function testCompactionWithinBudgetReturnsWithinBudget() {
  const conversation = createConversation(1000);
  conversation.addMessage('user', 'short message');

  const mockClient = { async chat() { throw new Error('should not be called'); } };
  const status = await conversation.compactHistory(mockClient, 0);

  assert.equal(status, COMPACTION_STATUS.WITHIN_BUDGET);
}

async function testCompactionFailureReturnsExplicitStatus() {
  const conversation = createConversation(1000);
  for (let i = 0; i < 10; i++) {
    conversation.addMessage('user', `${i}: ${'x'.repeat(100)}`);
  }

  const failingClient = {
    async chat() {
      throw new Error('background compaction unavailable');
    },
  };

  const status = await conversation.compactHistory(failingClient, 0);

  assert.equal(status, COMPACTION_STATUS.FAILED);
}

testPromptOverheadDoesNotDoubleCountRollingSummary();
testCustomPromptOverheadExcludesRollingSummary();
testThresholdIsClampedWhenPromptConsumesContext();
await testCompactionWithinBudgetReturnsWithinBudget();
await testCompactionFailureReturnsExplicitStatus();

console.log('compaction budget tests passed');
