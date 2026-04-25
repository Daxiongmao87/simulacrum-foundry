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

  assert.equal(conversation.getSessionTokens(), 25);
  assert.equal(conversation.estimatePromptOverhead(systemPrompt), fullPromptTokens - 25);
}

function testCustomPromptBudgetDoesNotCountUnsentRollingSummary() {
  const conversation = createConversation(600);
  conversation.rollingSummary = 'a'.repeat(2000);
  conversation._recalculateTokens();

  const customPrompt = 'short custom prompt';
  const promptOverhead = conversation.estimatePromptOverhead(customPrompt, false);

  assert.equal(conversation.isWithinCompactionBudget(promptOverhead, true), false);
  assert.equal(conversation.isWithinCompactionBudget(promptOverhead, false), true);
}

function testThresholdIsClampedWhenPromptConsumesContext() {
  const conversation = createConversation(100);

  assert.equal(conversation._getCompactionThreshold(100), 0);
  assert.equal(conversation._getCompactionThreshold(150), 0);
  assert.equal(conversation.hasAvailableContext(100), false);
}

function testTruncateToCompactionBudgetDropsOldestMessages() {
  const conversation = createConversation(1000);
  for (let i = 0; i < 10; i++) {
    conversation.addMessage('user', `${i}: ${'x'.repeat(100)}`);
  }

  assert.equal(conversation.isWithinCompactionBudget(0), false);

  const changed = conversation.truncateToCompactionBudget(0);

  assert.equal(changed, true);
  assert.equal(conversation.isWithinCompactionBudget(0), true);
  assert.equal(conversation.getMessages()[0].content.startsWith('0:'), false);
}

function testContextWindowAllowsConservativeBudgetOverflow() {
  const conversation = createConversation(1000);
  conversation.addMessage('user', 'x'.repeat(800));

  assert.equal(conversation.isWithinCompactionBudget(0), false);
  assert.equal(conversation.isWithinContextWindow(0), true);

  const changed = conversation.truncateToContextWindow(0);

  assert.equal(changed, false);
  assert.equal(conversation.getMessages().length, 1);
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
testCustomPromptBudgetDoesNotCountUnsentRollingSummary();
testThresholdIsClampedWhenPromptConsumesContext();
testTruncateToCompactionBudgetDropsOldestMessages();
testContextWindowAllowsConservativeBudgetOverflow();
await testCompactionFailureReturnsExplicitStatus();

console.log('compaction budget tests passed');
