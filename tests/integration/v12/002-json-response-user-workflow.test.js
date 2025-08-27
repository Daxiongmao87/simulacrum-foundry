/**
 * @file tests/integration/v12/002-json-response-user-workflow.test.js
 * @description Level 1 User Workflow Test for Issue #90: JSON Response Reliability
 * 
 * Test Metadata:
 * - enabled: true
 * - category: "user-experience"
 * - priority: "high"
 * - timeout: 120000
 * - description: "Tests that users receive reliable responses without JSON parsing errors (Issue #90)"
 * 
 * Test Scope - USER WORKFLOW:
 * - User opens Simulacrum chat interface
 * - User types and sends various messages
 * - User sees proper responses without errors
 * - User experiences good performance and reliability
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

// DEBUG mode detection
const DEBUG_MODE = process.env.DEBUG === 'true' || process.argv.includes('--debug');

/**
 * Smart console logging with DEBUG mode support for integration tests
 */
class UserWorkflowLogger {
  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  essential(message) {
    console.log(`[User Workflow Test] ${message}`);
  }

  debug(message) {
    if (this.debugMode) {
      console.log(`[User Workflow Test] [Debug] ${message}`);
    }
  }

  success(message) {
    console.log(`[User Workflow Test] ✅ ${message}`);
  }

  error(message) {
    console.error(`[User Workflow Test] ❌ ${message}`);
  }

  info(message) {
    console.log(`[User Workflow Test] 📋 ${message}`);
  }

  warning(message) {
    console.log(`[User Workflow Test] ⚠️ ${message}`);
  }

  data(label, data) {
    if (this.debugMode) {
      console.log(`[User Workflow Test] 📊 ${label}:`, JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Issue #90 User Workflow Integration Test
 * 
 * Tests the complete user experience of interacting with Simulacrum chat
 * to ensure JSON parsing issues don't affect users (Issue #90 validation)
 * 
 * @param {Object} session - Live FoundryVTT session from bootstrap
 * @param {Object} permutation - Test permutation info (version, system)
 * @param {Object} config - Test configuration from test.config.json
 * @returns {Object} Test result with success status and user experience metrics
 */
export const testMetadata = {
  name: 'json-response-user-workflow',
  enabled: true,
  category: 'user-experience',
  priority: 'high',
  timeout: 120000, // 2 minutes for user interactions
  description: 'Tests user experience with Simulacrum chat for JSON response reliability (Issue #90)',
  dependencies: ['simulacrum-init'],
  tags: ['ui', 'chat', 'json-parsing', 'issue-90', 'user-workflow'],
  userWorkflow: true, // This is a Level 1 user workflow test
  requirements: {
    minFoundryVersion: 'v12',
    requiredModules: [],
    requiredSystems: [],
    aiEndpoint: true // This test requires a working AI endpoint
  }
};

export default async function jsonResponseUserWorkflowTest(session, permutation, config) {
  const { page, gameState } = session;
  const logger = new UserWorkflowLogger(DEBUG_MODE);
  
  // User experience metrics
  const userMetrics = {
    interfaceOpenTime: 0,
    messagesAttempted: 0,
    messagesSuccessful: 0,
    totalResponseTime: 0,
    userVisibleErrors: 0,
    uiStatesWorked: true,
    conversationFlowed: true
  };
  
  logger.essential(`🧪 Testing user workflow for JSON response reliability on ${permutation.description}`);
  
  try {
    // PHASE 1: USER OPENS SIMULACRUM INTERFACE
    logger.essential('📍 Phase 1: User opening Simulacrum interface...');
    const interfaceStartTime = Date.now();
    
    // Find and click the Simulacrum scene control button (like a real user)
    const simulacrumButton = await page.$('.scene-control[data-control="simulacrum"]');
    if (!simulacrumButton) {
      throw new Error('User cannot find Simulacrum button in scene controls');
    }
    
    await simulacrumButton.click();
    
    // Wait for the chat modal to appear (user expectation)
    try {
      await page.waitForSelector('.chat-content', { timeout: 10000 });
      userMetrics.interfaceOpenTime = Date.now() - interfaceStartTime;
      logger.success(`Interface opened in ${userMetrics.interfaceOpenTime}ms`);
    } catch (error) {
      throw new Error(`User cannot open Simulacrum chat interface: ${error.message}`);
    }
    
    // Verify user can see the interface properly
    const interfaceReady = await page.evaluate(() => {
      const modal = document.querySelector('.chat-content');
      const input = document.querySelector('.chat-input');
      const sendButton = document.querySelector('.button.foundry-im.chat-send');
      
      return {
        modalVisible: modal && !modal.hidden,
        inputAvailable: input && !input.disabled,
        sendButtonAvailable: sendButton && !sendButton.disabled,
        modalWidth: modal ? modal.offsetWidth : 0,
        modalHeight: modal ? modal.offsetHeight : 0
      };
    });
    
    logger.data('Interface State', interfaceReady);
    
    if (!interfaceReady.modalVisible || !interfaceReady.inputAvailable) {
      userMetrics.uiStatesWorked = false;
      throw new Error('Simulacrum interface not ready for user interaction');
    }
    
    // PHASE 2: USER SENDS MULTIPLE MESSAGES (TEST DIFFERENT SCENARIOS)
    logger.essential('📍 Phase 2: User sending messages and receiving responses...');
    
    const userMessages = [
      {
        name: 'simple_acknowledgment',
        message: 'Hello! Please acknowledge this message.',
        description: 'Simple greeting - should get quick response'
      },
      {
        name: 'document_creation',
        message: 'Create a character named Test Warrior.',
        description: 'Document creation - may involve tool usage'
      },
      {
        name: 'information_query',
        message: 'What world information is available?',
        description: 'Information request - tests knowledge retrieval'
      }
    ];
    
    for (const testMessage of userMessages) {
      logger.essential(`📝 User typing: "${testMessage.message}"`);
      userMetrics.messagesAttempted++;
      
      const messageStartTime = Date.now();
      
      try {
        // Clear any existing input (like a careful user)
        await page.evaluate(() => {
          const input = document.querySelector('.chat-input');
          if (input) input.value = '';
        });
        
        // User types the message
        await page.type('.chat-input', testMessage.message);
        
        // User clicks send button
        await page.click('.button.foundry-im.chat-send');
        
        // User sees their message appear in chat
        await page.waitForSelector('.chat-message.message', { timeout: 5000 });
        
        // User waits for AI response (with realistic patience)
        logger.essential('⏳ User waiting for response...');
        
        try {
          await page.waitForSelector('.chat-message.message:last-child', { timeout: 45000 });
          const messageTime = Date.now() - messageStartTime;
          userMetrics.totalResponseTime += messageTime;
          userMetrics.messagesSuccessful++;
          
          logger.success(`Response received in ${messageTime}ms`);
          
          // Check what the user actually sees
          const userVisibleResponse = await page.evaluate(() => {
            const allMessages = document.querySelectorAll('.chat-message.message');
            const lastMessage = allMessages[allMessages.length - 1];
            
            return {
              messageExists: !!lastMessage,
              messageText: lastMessage ? lastMessage.textContent : '',
              hasErrorText: lastMessage ? lastMessage.textContent.includes('Error') : false,
              hasParsingError: lastMessage ? lastMessage.textContent.includes('parsing') : false,
              hasJsonError: lastMessage ? lastMessage.textContent.includes('JSON') : false,
              messageLength: lastMessage ? lastMessage.textContent.length : 0
            };
          });
          
          logger.data(`User Sees (${testMessage.name})`, userVisibleResponse);
          
          // Validate user experience
          if (!userVisibleResponse.messageExists) {
            throw new Error('User does not see any response message');
          }
          
          if (userVisibleResponse.hasErrorText || userVisibleResponse.hasParsingError || userVisibleResponse.hasJsonError) {
            userMetrics.userVisibleErrors++;
            logger.warning(`User sees error-related content: ${userVisibleResponse.messageText.substring(0, 100)}`);
          }
          
          if (userVisibleResponse.messageLength < 10) {
            throw new Error('User receives very short response - likely an error state');
          }
          
          logger.success(`Message "${testMessage.name}" completed successfully`);
          
          // Small delay between messages (realistic user behavior)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (responseError) {
          logger.error(`User did not receive response for "${testMessage.message}": ${responseError.message}`);
          userMetrics.conversationFlowed = false;
          
          // Check if user sees any error messages in UI
          const errorState = await page.evaluate(() => {
            const errorElements = document.querySelectorAll('.error-message');
            const chatArea = document.querySelector('.chat-messages-container');
            
            return {
              errorElementsVisible: errorElements.length,
              chatAreaContent: chatArea ? chatArea.textContent.substring(0, 200) : '',
              lastLogEntry: console.lastEntry || 'none'
            };
          });
          
          logger.data('Error State', errorState);
        }
        
      } catch (messageError) {
        logger.error(`User interaction failed for "${testMessage.message}": ${messageError.message}`);
        userMetrics.conversationFlowed = false;
      }
    }
    
    // PHASE 3: CAPTURE USER EXPERIENCE ARTIFACTS
    logger.essential('📍 Phase 3: Capturing user experience artifacts...');
    
    const screenshotPath = join(PROJECT_ROOT, 'tests', 'artifacts', `user-workflow-json-${permutation.id}-${Date.now()}.png`);
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    // PHASE 4: VALIDATE ISSUE #90 FROM USER PERSPECTIVE
    logger.essential('📍 Phase 4: Validating Issue #90 user experience criteria...');
    
    const avgResponseTime = userMetrics.messagesSuccessful > 0 ? 
      userMetrics.totalResponseTime / userMetrics.messagesSuccessful : 0;
    
    const successRate = userMetrics.messagesAttempted > 0 ? 
      (userMetrics.messagesSuccessful / userMetrics.messagesAttempted) * 100 : 0;
    
    const userExperienceQuality = {
      interfaceAccessible: userMetrics.interfaceOpenTime > 0 && userMetrics.interfaceOpenTime < 20000, // 20s for Docker environment
      responsesReceived: successRate >= 100, // All messages should get responses
      noVisibleErrors: userMetrics.userVisibleErrors === 0,
      reasonableResponseTime: avgResponseTime < 90000, // 90s for integration test environment
      conversationFlows: userMetrics.conversationFlowed,
      uiWorksCorrectly: userMetrics.uiStatesWorked
    };
    
    const overallUserSatisfaction = Object.values(userExperienceQuality).every(Boolean);
    
    // Log user experience metrics
    logger.info('📋 Issue #90 User Experience Validation:');
    logger.info(`Interface Accessible (<20s): ${userExperienceQuality.interfaceAccessible ? '✅' : '❌'}`);
    logger.info(`All Messages Got Responses: ${userExperienceQuality.responsesReceived ? '✅' : '❌'}`);
    logger.info(`No User-Visible Errors: ${userExperienceQuality.noVisibleErrors ? '✅' : '❌'}`);
    logger.info(`Response Time Acceptable (<90s avg): ${userExperienceQuality.reasonableResponseTime ? '✅' : '❌'} (${avgResponseTime.toFixed(0)}ms avg)`);
    logger.info(`Conversation Flows Naturally: ${userExperienceQuality.conversationFlows ? '✅' : '❌'}`);
    logger.info(`UI Works Correctly: ${userExperienceQuality.uiWorksCorrectly ? '✅' : '❌'}`);
    logger.info(`Overall User Satisfaction: ${overallUserSatisfaction ? '✅ PASS' : '❌ FAIL'}`);
    
    return {
      success: overallUserSatisfaction,
      permutation,
      message: overallUserSatisfaction ? 
        'User workflow for JSON responses works perfectly' : 
        'User experience issues detected with JSON response handling',
      userExperienceMetrics: {
        interfaceOpenTime: userMetrics.interfaceOpenTime,
        messagesAttempted: userMetrics.messagesAttempted,
        messagesSuccessful: userMetrics.messagesSuccessful,
        successRate: successRate,
        averageResponseTime: avgResponseTime,
        userVisibleErrors: userMetrics.userVisibleErrors,
        conversationFlowed: userMetrics.conversationFlowed,
        overallSatisfaction: overallUserSatisfaction,
        qualityMetrics: userExperienceQuality
      },
      artifacts: {
        screenshot: screenshotPath,
        userWorkflowComplete: true,
        issue90Validated: true
      }
    };
    
  } catch (error) {
    logger.error(`User workflow test failed: ${error.message}`);
    
    // Capture failure state for debugging
    const failureScreenshot = join(PROJECT_ROOT, 'tests', 'artifacts', `user-workflow-json-FAILED-${permutation.id}-${Date.now()}.png`);
    try {
      await page.screenshot({ 
        path: failureScreenshot,
        fullPage: true 
      });
    } catch (screenshotError) {
      logger.warning(`Could not capture failure screenshot: ${screenshotError.message}`);
    }
    
    return {
      success: false,
      permutation,
      message: `User workflow failed: ${error.message}`,
      userExperienceMetrics: userMetrics,
      artifacts: {
        failureScreenshot: failureScreenshot,
        userWorkflowComplete: false,
        issue90Validated: false
      }
    };
  }
}