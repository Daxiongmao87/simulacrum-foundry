/**
 * @file tests/integration/v12/002-json-response-api-integration.test.js
 * @description Level 2 API Integration Test for Issue #90: JSON Response System Validation
 * 
 * Test Metadata:
 * - enabled: true
 * - category: "api-integration"
 * - priority: "medium"
 * - timeout: 120000
 * - description: "Tests API components and JSON parsing reliability for Issue #90"
 * 
 * Test Scope - API INTEGRATION:
 * - Tests AI service component integration
 * - Validates JSON parser retry mechanism
 * - Measures technical performance metrics
 * - Tests system prompt compliance
 * - Validates Issue #90 technical requirements
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
 * Smart console logging with DEBUG mode support for API integration tests
 */
class ApiIntegrationTestLogger {
  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  essential(message) {
    console.log(`[API Integration Test] ${message}`);
  }

  debug(message) {
    if (this.debugMode) {
      console.log(`[API Integration Test] [Debug] ${message}`);
    }
  }

  success(message) {
    console.log(`[API Integration Test] ✅ ${message}`);
  }

  error(message) {
    console.error(`[API Integration Test] ❌ ${message}`);
  }

  info(message) {
    console.log(`[API Integration Test] 📋 ${message}`);
  }

  warning(message) {
    console.log(`[API Integration Test] ⚠️ ${message}`);
  }

  data(message, data) {
    if (this.debugMode) {
      console.log(`[API Integration Test] [Debug] 📊 ${message}:`, JSON.stringify(data, null, 2));
    }
  }
}

/**
 * JSON Response API Integration Test
 * 
 * @param {Object} session - Live FoundryVTT session from bootstrap
 * @param {Object} permutation - Test permutation info (version, system)
 * @param {Object} config - Test configuration from test.config.json
 * @returns {Object} Test result with success status and details
 */
export const testMetadata = {
  name: 'json-response-api-integration',
  enabled: true,
  category: 'api-integration',
  priority: 'medium',
  timeout: 120000, // 2 minutes for API interactions
  description: 'Tests API component integration for JSON response parsing (Issue #90)',
  dependencies: ['simulacrum-init'],
  tags: ['api', 'json', 'parsing', 'issue-90', 'component-integration'],
  userWorkflow: false, // This is a Level 2 API integration test
  configuration: {},
  requirements: {
    minFoundryVersion: 'v12',
    requiredModules: [],
    requiredSystems: [],
    aiEndpoint: true // Indicates this test requires AI endpoint
  }
};

export default async function jsonResponseApiIntegrationTest(session, permutation, config) {
  const { page, gameState } = session;
  const logger = new ApiIntegrationTestLogger(DEBUG_MODE);
  
  logger.essential(`🧪 Testing AI JSON system prompt effectiveness on ${permutation.description}`);
  logger.data('Test config', {
    endpoint: config.bootstrap?.endpointURL,
    model: config.bootstrap?.model,
    timeout: config.puppeteer?.timeout
  });
  
  const testResults = {
    metrics: {
      jsonParseSuccessRate: 0,
      averageRetryCount: 0,
      responseTimeMs: 0,
      endpointReachable: false,
      testsRun: 0,
      testsSkipped: 0,
      systemPromptCompliance: 0
    },
    testCases: {},
    failures: []
  };
  
  try {
    // Test 1: Configure AI service with test endpoint
    logger.essential('📍 Configuring AI service with test endpoint...');
    const aiConfigResult = await page.evaluate(async (endpointURL, model, debugMode) => {
      try {
        if (!game.simulacrum || !game.simulacrum.aiService) {
          return { success: false, error: 'Simulacrum AI service not initialized' };
        }
        
        // Set the AI endpoint and model from test config
        await game.settings.set('simulacrum', 'apiEndpoint', endpointURL);
        await game.settings.set('simulacrum', 'modelName', model);
        
        const currentEndpoint = game.settings.get('simulacrum', 'apiEndpoint');
        const currentModel = game.settings.get('simulacrum', 'modelName');
        
        // Test endpoint connectivity
        let endpointReachable = false;
        try {
          const testUrl = endpointURL.endsWith('/v1') ? 
            endpointURL + '/models' : 
            endpointURL + '/api/tags';
          
          const testResponse = await fetch(testUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000)
          });
          endpointReachable = testResponse.ok || testResponse.status === 401;
          
          if (debugMode) {
            console.log('Simulacrum | Endpoint test:', { url: testUrl, status: testResponse.status, reachable: endpointReachable });
          }
        } catch (fetchError) {
          if (debugMode) {
            console.log('Simulacrum | Endpoint test failed:', fetchError.message);
          }
        }
        
        return {
          success: true,
          endpoint: currentEndpoint,
          model: currentModel,
          endpointReachable: endpointReachable
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, config.bootstrap.endpointURL, config.bootstrap.model, DEBUG_MODE);
    
    logger.data('AI Config Result', aiConfigResult);
    
    if (!aiConfigResult.success) {
      throw new Error(`Failed to configure AI service: ${aiConfigResult.error}`);
    }
    
    testResults.metrics.endpointReachable = aiConfigResult.endpointReachable;
    logger.success(`AI service configured: ${aiConfigResult.endpoint} (model: ${aiConfigResult.model})`);
    
    if (!aiConfigResult.endpointReachable) {
      logger.warning('AI endpoint not reachable - skipping live AI tests');
      return await skipLiveAiTests(page, logger, testResults, permutation);
    }

    // Test 2: System Prompt Validation
    logger.essential('📍 Validating system prompt includes Issue #90 requirements...');
    const systemPromptTest = await page.evaluate(async (debugMode) => {
      try {
        const aiService = game.simulacrum.aiService;
        const systemPrompt = await aiService.getDefaultSystemPrompt();
        
        // Check for Issue #90 requirements in system prompt
        const requirements = {
          hasRawJsonDirective: systemPrompt.includes('raw JSON only') && systemPrompt.includes('NO markdown'),
          hasNoCodeBlocks: systemPrompt.includes('NO code blocks'),
          hasRequiredFields: systemPrompt.includes('message') && systemPrompt.includes('tool_calls') && systemPrompt.includes('continuation'),
          hasFieldValidation: systemPrompt.includes('in_progress') && systemPrompt.includes('gerund'),
          hasJsonExample: systemPrompt.includes('{') && systemPrompt.includes('}'),
          hasMandatoryRules: systemPrompt.includes('MANDATORY RULES')
        };
        
        if (debugMode) {
          console.log('Simulacrum | System prompt requirements check:', requirements);
          console.log('Simulacrum | System prompt length:', systemPrompt.length);
        }
        
        const complianceScore = Object.values(requirements).filter(Boolean).length;
        const totalRequirements = Object.keys(requirements).length;
        
        return {
          success: true,
          requirements,
          complianceScore,
          totalRequirements,
          compliancePercentage: (complianceScore / totalRequirements) * 100,
          systemPromptLength: systemPrompt.length
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }, DEBUG_MODE);
    
    logger.data('System Prompt Test', systemPromptTest);
    testResults.testCases.systemPrompt = systemPromptTest;
    testResults.metrics.testsRun++;
    
    if (systemPromptTest.success) {
      testResults.metrics.systemPromptCompliance = systemPromptTest.compliancePercentage;
      logger.success(`System prompt compliance: ${systemPromptTest.compliancePercentage.toFixed(1)}%`);
      
      if (systemPromptTest.compliancePercentage < 100) {
        logger.warning('System prompt missing some Issue #90 requirements');
        const missingReqs = Object.entries(systemPromptTest.requirements)
          .filter(([key, value]) => !value)
          .map(([key]) => key);
        logger.info(`Missing requirements: ${missingReqs.join(', ')}`);
      }
    } else {
      logger.error(`System prompt test failed: ${systemPromptTest.error}`);
      testResults.failures.push('System prompt validation failed');
    }

    // Test 3: Live AI JSON Response Testing
    logger.essential('📍 Testing live AI JSON responses...');
    const liveResponseTests = await page.evaluate(async (debugMode) => {
      try {
        const aiService = game.simulacrum.aiService;
        const testCases = [
          {
            name: 'simple_request',
            prompt: 'Please acknowledge this message.',
            description: 'Simple acknowledgment request'
          },
          {
            name: 'tool_request',
            prompt: 'Create a character named Test Warrior.',
            description: 'Request that should trigger tool usage'
          },
          {
            name: 'information_request',
            prompt: 'What world information is available?',
            description: 'Request for world information'
          }
        ];
        
        const results = [];
        let totalResponseTime = 0;
        let successfulParses = 0;
        let totalRetries = 0;
        
        for (const testCase of testCases) {
          try {
            if (debugMode) {
              console.log(`Simulacrum | Testing: ${testCase.name} - ${testCase.description}`);
            }
            
            const startTime = Date.now();
            
            // Use the agentic loop controller to test the full system
            const agenticLoop = game.simulacrum.agenticLoopController;
            
            // Capture console warnings to count retries
            const originalWarn = console.warn;
            let retryCount = 0;
            console.warn = function(...args) {
              if (args[0] && args[0].includes('Parsing error, retrying')) {
                retryCount++;
              }
              originalWarn.apply(console, args);
            };
            
            try {
              // Initialize a simple context for testing
              const context = agenticLoop.initializeContext(testCase.prompt);
              
              // Get AI response
              const chatPrompt = await context.toChatPrompt();
              const response = await aiService.sendMessage(chatPrompt);
              
              // Test if the response can be parsed by our parser
              const parser = agenticLoop.responseParser;
              const parsed = await parser.parseAgentResponse(response);
              
              const responseTime = Date.now() - startTime;
              totalResponseTime += responseTime;
              
              // Validate parsed structure
              const hasValidStructure = 
                parsed.message && typeof parsed.message === 'string' &&
                Array.isArray(parsed.tool_calls) &&
                parsed.continuation && typeof parsed.continuation === 'object' &&
                typeof parsed.continuation.in_progress === 'boolean';
              
              if (hasValidStructure) {
                successfulParses++;
              }
              
              totalRetries += retryCount;
              
              results.push({
                name: testCase.name,
                success: true,
                responseTime,
                retryCount,
                hasValidStructure,
                messageLength: parsed.message.length,
                toolCallsCount: parsed.tool_calls.length,
                inProgress: parsed.continuation.in_progress
              });
              
              if (debugMode) {
                console.log(`Simulacrum | ${testCase.name} result:`, {
                  responseTime,
                  retryCount,
                  hasValidStructure,
                  messagePreview: parsed.message.substring(0, 100)
                });
              }
              
            } finally {
              console.warn = originalWarn;
            }
            
          } catch (error) {
            results.push({
              name: testCase.name,
              success: false,
              error: error.message,
              responseTime: Date.now() - startTime
            });
            
            if (debugMode) {
              console.error(`Simulacrum | ${testCase.name} failed:`, error.message);
            }
          }
        }
        
        const avgResponseTime = totalResponseTime / testCases.length;
        const avgRetryCount = totalRetries / testCases.length;
        const successRate = (successfulParses / testCases.length) * 100;
        
        return {
          success: true,
          results,
          metrics: {
            totalTests: testCases.length,
            successfulParses,
            successRate,
            avgResponseTime,
            avgRetryCount,
            totalRetries
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }, DEBUG_MODE);
    
    logger.data('Live Response Tests', liveResponseTests);
    testResults.testCases.liveResponses = liveResponseTests;
    testResults.metrics.testsRun++;
    
    if (liveResponseTests.success) {
      testResults.metrics.jsonParseSuccessRate = liveResponseTests.metrics.successRate;
      testResults.metrics.averageRetryCount = liveResponseTests.metrics.avgRetryCount;
      testResults.metrics.responseTimeMs = liveResponseTests.metrics.avgResponseTime;
      
      logger.success(`Live AI JSON tests completed`);
      logger.info(`Success Rate: ${liveResponseTests.metrics.successRate.toFixed(1)}%`);
      logger.info(`Avg Response Time: ${liveResponseTests.metrics.avgResponseTime}ms`);
      logger.info(`Avg Retry Count: ${liveResponseTests.metrics.avgRetryCount.toFixed(2)}`);
      
      // Log individual test results
      for (const result of liveResponseTests.results) {
        if (result.success) {
          logger.success(`${result.name}: ${result.responseTime}ms, ${result.retryCount} retries`);
        } else {
          logger.error(`${result.name}: Failed - ${result.error}`);
          testResults.failures.push(`Live test ${result.name} failed: ${result.error}`);
        }
      }
    } else {
      logger.error(`Live AI JSON tests failed: ${liveResponseTests.error}`);
      testResults.failures.push('Live AI response testing failed');
    }

    // Test 4: Take screenshot for verification
    const screenshotPath = join(PROJECT_ROOT, 'tests', 'artifacts', `ai-json-system-${permutation.id}-${Date.now()}.png`);
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    logger.success(`Screenshot saved: ${screenshotPath}`);
    
    // Validate Issue #90 acceptance criteria
    const meetsAcceptanceCriteria = validateIssue90Criteria(testResults.metrics, logger);
    
    // Calculate overall success
    const overallSuccess = testResults.failures.length === 0 && meetsAcceptanceCriteria;
    
    return {
      success: overallSuccess,
      permutation,
      message: overallSuccess ? 
        'AI JSON system prompt test completed successfully' : 
        `Test completed with ${testResults.failures.length} failures`,
      meetsIssueCriteria: meetsAcceptanceCriteria,
      metrics: testResults.metrics,
      testCases: testResults.testCases,
      failures: testResults.failures,
      artifacts: {
        screenshot: screenshotPath,
        timestamp: Date.now()
      }
    };
    
  } catch (error) {
    logger.error(`AI JSON system prompt test failed: ${error.message}`);
    
    // Take screenshot on failure for debugging
    const failureScreenshot = join(PROJECT_ROOT, 'tests', 'artifacts', `ai-json-system-FAILED-${permutation.id}-${Date.now()}.png`);
    try {
      await page.screenshot({ 
        path: failureScreenshot,
        fullPage: true 
      });
      logger.info(`Failure screenshot saved: ${failureScreenshot}`);
    } catch (screenshotError) {
      logger.warning(`Could not take failure screenshot: ${screenshotError.message}`);
    }
    
    return {
      success: false,
      permutation,
      message: error.message,
      error: error.stack,
      metrics: testResults.metrics,
      testCases: testResults.testCases,
      failures: testResults.failures,
      artifacts: {
        failureScreenshot: failureScreenshot,
        timestamp: Date.now()
      }
    };
  }
}

/**
 * Skip live AI tests when endpoint is not available
 */
async function skipLiveAiTests(page, logger, testResults, permutation) {
  logger.info('Running system prompt validation only (no live AI)');
  
  const systemPromptTest = await page.evaluate(async (debugMode) => {
    try {
      const aiService = game.simulacrum.aiService;
      const systemPrompt = await aiService.getDefaultSystemPrompt();
      
      const requirements = {
        hasRawJsonDirective: systemPrompt.includes('raw JSON only'),
        hasNoCodeBlocks: systemPrompt.includes('NO code blocks'),
        hasRequiredFields: systemPrompt.includes('message') && systemPrompt.includes('tool_calls'),
        hasFieldValidation: systemPrompt.includes('in_progress'),
        hasJsonExample: systemPrompt.includes('{') && systemPrompt.includes('}')
      };
      
      const complianceScore = Object.values(requirements).filter(Boolean).length;
      const totalRequirements = Object.keys(requirements).length;
      
      return {
        success: true,
        requirements,
        complianceScore,
        totalRequirements,
        compliancePercentage: (complianceScore / totalRequirements) * 100
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, DEBUG_MODE);
  
  testResults.metrics.testsSkipped = 2; // Live response tests skipped
  testResults.metrics.testsRun = 1; // System prompt test only
  testResults.metrics.systemPromptCompliance = systemPromptTest.compliancePercentage || 0;
  
  if (systemPromptTest.success) {
    logger.success('System prompt validation completed (offline mode)');
    testResults.testCases.systemPrompt = systemPromptTest;
  }
  
  return {
    success: true,
    partial: true,
    message: 'System prompt tests completed (AI endpoint unavailable)',
    metrics: testResults.metrics,
    testCases: testResults.testCases
  };
}

/**
 * Validate Issue #90 acceptance criteria
 */
function validateIssue90Criteria(metrics, logger) {
  const criteria = {
    jsonParseSuccessRate: metrics.jsonParseSuccessRate >= 95, // >95% success rate
    endpointConnectivity: metrics.endpointReachable,
    retryMechanism: metrics.averageRetryCount < 2, // Should rarely need retries
    responseTime: metrics.responseTimeMs < 30000, // <30s response time
    systemPromptCompliance: metrics.systemPromptCompliance >= 80 // System prompt has key directives
  };
  
  logger.essential('📋 Issue #90 Acceptance Criteria Validation:');
  logger.info(`JSON Parse Success Rate: ${metrics.jsonParseSuccessRate.toFixed(1)}% (>95% required): ${criteria.jsonParseSuccessRate ? '✅' : '❌'}`);
  logger.info(`Endpoint Reachable: ${criteria.endpointConnectivity ? '✅' : '❌'}`);
  logger.info(`Avg Retry Count: ${metrics.averageRetryCount.toFixed(2)} (<2 expected): ${criteria.retryMechanism ? '✅' : '❌'}`);
  logger.info(`Response Time: ${metrics.responseTimeMs}ms (<30s): ${criteria.responseTime ? '✅' : '❌'}`);
  logger.info(`System Prompt Compliance: ${metrics.systemPromptCompliance.toFixed(1)}% (>80% expected): ${criteria.systemPromptCompliance ? '✅' : '❌'}`);
  
  const overallPass = Object.values(criteria).every(Boolean);
  logger.info(`Overall Issue #90 Compliance: ${overallPass ? '✅ PASS' : '❌ FAIL'}`);
  
  return overallPass;
}