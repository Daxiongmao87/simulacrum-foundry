# Integration Testing Patterns and Best Practices

## Overview

This document defines the proper patterns for writing integration tests in the Simulacrum FoundryVTT module. It establishes clear guidelines to ensure tests validate real user experiences rather than internal API functionality.

## Core Principle: User-First Testing

**Integration tests must simulate real user workflows, not internal system behavior.**

### ❌ Wrong Approach (Internal API Testing)
```javascript
// BAD: Testing internal APIs directly
const result = await page.evaluate(() => {
  const aiService = game.simulacrum.aiService;
  return aiService.sendMessage('Hello world');
});
```

### ✅ Correct Approach (User Workflow Testing)
```javascript
// GOOD: Testing what users actually do
await page.click('[data-tool="simulacrum"]');
await page.type('.chat-input', 'Hello world');
await page.click('.send-button');
await page.waitForSelector('.response-message');
```

## Three-Level Testing Framework

### Level 1: End-to-End User Flow Tests (PRIMARY)
**File naming**: `*-user-workflow.test.js`

**Purpose**: Test complete user interactions through the UI
- Simulate real user actions (click, type, navigate)
- Validate UI states and user-visible feedback
- Test error handling from user perspective
- Measure real-world performance including UI rendering

**When to use**: Major feature workflows, UI validation, user experience testing

### Level 2: Component Integration Tests (SECONDARY)
**File naming**: `*-api-integration.test.js`

**Purpose**: Test component interactions and data flow
- Validate API contracts between components
- Test edge cases and error scenarios
- Measure technical performance metrics
- Test configurations that are hard to trigger via UI

**When to use**: API validation, performance testing, edge case scenarios

### Level 3: Unit Tests (FOUNDATION)
**File naming**: `*-component.test.js`

**Purpose**: Test individual components in isolation
- Test component logic with mocked dependencies
- Fast feedback for developers
- Validate input/output contracts

## Level 1: User Workflow Test Pattern

### Essential Elements

Every Level 1 integration test MUST include:

1. **Real UI Interaction**
2. **State Validation**
3. **User-Visible Outcomes**
4. **Error Handling**
5. **Performance Measurement**
6. **Visual Artifacts**

### Template Structure

```javascript
/**
 * @file tests/integration/v12/simulacrum-user-workflow.test.js
 * @description Tests complete user workflow for Simulacrum chat interface
 */

export const testMetadata = {
  name: 'simulacrum-user-workflow',
  enabled: true,
  category: 'user-experience',
  priority: 'high',
  timeout: 60000,
  description: 'Tests complete user workflow through Simulacrum interface',
  dependencies: ['simulacrum-init'],
  tags: ['ui', 'chat', 'user-workflow'],
  userWorkflow: true // Important: marks as Level 1 test
};

export default async function simulacrumUserWorkflowTest(session, permutation, config) {
  const { page, gameState } = session;
  
  // Test metrics
  const startTime = Date.now();
  let uiInteractionTime = 0;
  let responseTime = 0;
  
  try {
    // PHASE 1: USER OPENS INTERFACE
    console.log(`[User Workflow] Phase 1: Opening Simulacrum interface`);
    const openStartTime = Date.now();
    
    await page.click('[data-tool="simulacrum"]');
    await page.waitForSelector('.simulacrum-chat-modal', { timeout: 10000 });
    
    uiInteractionTime = Date.now() - openStartTime;
    
    // PHASE 2: USER SENDS MESSAGE
    console.log(`[User Workflow] Phase 2: User typing and sending message`);
    const testMessage = 'Create a character named Test Warrior';
    
    await page.type('.simulacrum-chat-input', testMessage);
    await page.click('.simulacrum-send-button');
    
    // PHASE 3: USER SEES LOADING STATE
    console.log(`[User Workflow] Phase 3: Validating loading states`);
    const loadingVisible = await page.waitForSelector(
      '.simulacrum-thinking-indicator', 
      { timeout: 5000 }
    ).catch(() => null);
    
    if (!loadingVisible) {
      console.warn(`[User Workflow] Warning: Loading indicator not shown to user`);
    }
    
    // PHASE 4: USER RECEIVES RESPONSE
    console.log(`[User Workflow] Phase 4: Waiting for user-visible response`);
    const responseStartTime = Date.now();
    
    await page.waitForSelector('.simulacrum-chat-message.ai-response', { 
      timeout: 45000 
    });
    
    responseTime = Date.now() - responseStartTime;
    
    // PHASE 5: VALIDATE USER EXPERIENCE
    console.log(`[User Workflow] Phase 5: Validating user experience`);
    
    const response = await page.$eval(
      '.simulacrum-chat-message.ai-response', 
      el => el.textContent
    );
    
    const userExperience = {
      responseReceived: response && response.length > 10,
      noVisibleErrors: !response.includes('Error') && !response.includes('failed'),
      appropriateLength: response.length > 20 && response.length < 5000,
      loadingStateShown: !!loadingVisible
    };
    
    // PHASE 6: TEST ERROR SCENARIOS (if applicable)
    const errorElements = await page.$$('.simulacrum-error-message');
    if (errorElements.length > 0) {
      const errorText = await errorElements[0].evaluate(el => el.textContent);
      console.log(`[User Workflow] User-visible error found: ${errorText}`);
    }
    
    // PHASE 7: CAPTURE VISUAL ARTIFACTS
    const screenshot = await page.screenshot({
      path: `tests/artifacts/user-workflow-success-${permutation.id}-${Date.now()}.png`,
      fullPage: true
    });
    
    // CALCULATE USER EXPERIENCE METRICS
    const totalTime = Date.now() - startTime;
    const userSatisfaction = Object.values(userExperience).every(Boolean);
    
    return {
      success: userSatisfaction,
      permutation,
      message: userSatisfaction ? 
        'Complete user workflow successful' : 
        'User experience issues detected',
      userWorkflowMetrics: {
        uiInteractionTime,
        responseTime,
        totalTime,
        userSatisfaction,
        experience: userExperience
      },
      artifacts: { 
        screenshot,
        userWorkflowTrace: true
      }
    };
    
  } catch (error) {
    // FAILURE: Capture what user would see
    const failureScreenshot = await page.screenshot({
      path: `tests/artifacts/user-workflow-FAILED-${permutation.id}-${Date.now()}.png`,
      fullPage: true
    });
    
    return {
      success: false,
      permutation,
      message: `User workflow failed: ${error.message}`,
      userWorkflowMetrics: {
        uiInteractionTime,
        responseTime: Date.now() - startTime,
        userSatisfaction: false,
        failureReason: error.message
      },
      artifacts: { 
        failureScreenshot,
        userWorkflowTrace: true
      }
    };
  }
}
```

## Level 2: API Integration Test Pattern

### Template Structure

```javascript
/**
 * @file tests/integration/v12/simulacrum-api-integration.test.js
 * @description Tests Simulacrum component interactions and API contracts
 */

export const testMetadata = {
  name: 'simulacrum-api-integration',
  enabled: true,
  category: 'api-validation',
  priority: 'medium',
  timeout: 30000,
  description: 'Tests Simulacrum API integration and component interactions',
  dependencies: ['simulacrum-init'],
  tags: ['api', 'integration', 'performance'],
  userWorkflow: false // Important: marks as Level 2 test
};

export default async function simulacrumApiIntegrationTest(session, permutation, config) {
  const { page, gameState } = session;
  
  try {
    // Test API interactions within browser context
    const result = await page.evaluate(async () => {
      try {
        // Access components directly (NOT how users interact)
        const aiService = game.simulacrum.aiService;
        const agenticLoop = game.simulacrum.agenticLoopController;
        const parser = game.simulacrum.agenticLoopController.responseParser;
        
        // Test component integration
        const testData = {
          aiServiceAvailable: !!aiService,
          agenticLoopAvailable: !!agenticLoop,
          parserAvailable: !!parser,
          contextWindowSetting: game.settings.get('simulacrum', 'contextLength')
        };
        
        return {
          success: true,
          data: testData
        };
        
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    
    return {
      success: result.success,
      permutation,
      message: result.success ? 
        'API integration test passed' : 
        `API integration failed: ${result.error}`,
      apiMetrics: result.data || {}
    };
    
  } catch (error) {
    return {
      success: false,
      permutation,
      message: `API integration test failed: ${error.message}`
    };
  }
}
```

## Required Test Metadata

All integration tests must include metadata:

```javascript
export const testMetadata = {
  name: 'test-name',                    // Unique test identifier
  enabled: true,                       // Whether test should run
  category: 'user-experience',         // Test category
  priority: 'high',                    // Priority level
  timeout: 60000,                      // Test timeout in ms
  description: 'Test description',     // Human-readable description
  dependencies: ['simulacrum-init'],   // Required setup dependencies
  tags: ['ui', 'chat'],               // Tags for filtering
  userWorkflow: true,                  // TRUE for Level 1, FALSE for Level 2
  requirements: {                      // Optional requirements
    minFoundryVersion: 'v12',
    requiredModules: [],
    aiEndpoint: false
  }
};
```

## User Workflow Validation Checklist

For Level 1 tests, validate these user experience aspects:

### ✅ User Interface Interactions
- [ ] User can open/access the feature
- [ ] User can input data (typing, clicking, selecting)
- [ ] User receives visual feedback for actions
- [ ] User can navigate through the workflow

### ✅ Loading and Progress States
- [ ] Loading indicators appear when expected
- [ ] Progress shows for long-running operations
- [ ] User is informed of current system state
- [ ] Timeouts are reasonable for user expectations

### ✅ Response and Feedback
- [ ] User receives appropriate responses
- [ ] Success states are clearly communicated
- [ ] Results are displayed in user-friendly format
- [ ] User can continue workflow or exit cleanly

### ✅ Error Handling
- [ ] Errors are displayed to users (not just console)
- [ ] Error messages are helpful and actionable
- [ ] Users can recover from error states
- [ ] System remains stable after errors

### ✅ Performance from User Perspective
- [ ] UI remains responsive during operations
- [ ] Response times are acceptable (<30s for most operations)
- [ ] No UI freezing or blocking
- [ ] Reasonable memory/CPU usage

## Common Anti-Patterns to Avoid

### ❌ Testing Implementation Details
```javascript
// BAD: Testing how components work internally
const parser = agenticLoop.responseParser;
const parsed = await parser.parseAgentResponse(rawJson);
```

### ❌ Bypassing User Interface
```javascript
// BAD: Direct API calls instead of UI interaction
await page.evaluate(() => {
  return game.simulacrum.processUserRequest('Hello world');
});
```

### ❌ Ignoring User Experience
```javascript
// BAD: Only testing technical success, ignoring UX
const result = await techOperation();
expect(result.success).toBe(true); // User never sees this
```

### ❌ Missing Error Handling
```javascript
// BAD: Not testing how users experience errors
try {
  await operation();
} catch (error) {
  // Test passes, but user would see broken UI
}
```

## Integration with Commit Hooks

The commit-msg hook will validate integration tests for:
- Proper naming conventions
- Required metadata presence
- User workflow patterns vs API patterns
- Appropriate test categorization

## Migration Guide

### Converting Existing Tests

1. **Identify test type**: Is this testing user workflow or API integration?
2. **Update file naming**: Use proper naming convention
3. **Add metadata**: Include required testMetadata export
4. **Refactor test logic**: 
   - Level 1: Add UI interactions, remove direct API calls
   - Level 2: Keep API calls but add proper categorization
5. **Update assertions**: Focus on user-visible outcomes

### Example Migration

**Before (Mixed approach):**
```javascript
// Old approach mixed UI and API
export default async function oldTest(session) {
  const { page } = session;
  
  // Some UI interaction
  await page.click('.button');
  
  // But then direct API testing
  const result = await page.evaluate(() => {
    return game.simulacrum.aiService.sendMessage('test');
  });
  
  expect(result.success).toBe(true);
}
```

**After (Clear Level 1 separation):**
```javascript
// New Level 1: Pure user workflow
export const testMetadata = {
  name: 'user-workflow-test',
  userWorkflow: true,
  // ... other metadata
};

export default async function userWorkflowTest(session) {
  const { page } = session;
  
  // Complete user workflow
  await page.click('.open-chat');
  await page.type('.input', 'test message');
  await page.click('.send');
  await page.waitForSelector('.response');
  
  // Validate user-visible outcome
  const response = await page.$eval('.response', el => el.textContent);
  return {
    success: response.length > 0,
    message: 'User workflow completed'
  };
}
```

## Conclusion

Following these patterns ensures that integration tests validate real user experiences rather than internal technical implementations. This approach catches UI bugs, usability issues, and integration problems that users would actually encounter.

The three-level framework provides clarity:
- **Level 1**: What users experience
- **Level 2**: How components interact  
- **Level 3**: How individual components work

By prioritizing Level 1 tests, we ensure the system works well for actual users, not just technically.