/**
 * Tool Integration Testing Functions
 * For validating tool registration and execution
 */

export class ToolTester {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }
  
  /**
   * Test all tools are registered correctly
   */
  testToolRegistration() {
    const expectedTools = [
      'createDocument',
      'readDocument', 
      'updateDocument',
      'deleteDocument',
      'listDocuments',
      'searchDocuments',
      'getWorldInfo',
      'getSceneInfo',
      'getUserPreferences'
    ];
    
    const results = {
      totalExpected: expectedTools.length,
      registered: 0,
      missing: [],
      errors: []
    };
    
    for (const toolName of expectedTools) {
      try {
        if (this.toolRegistry.hasTool(toolName)) {
          const tool = this.toolRegistry.getTool(toolName);
          if (tool && tool.name === toolName) {
            results.registered++;
          } else {
            results.errors.push(`Tool ${toolName} registration invalid`);
          }
        } else {
          results.missing.push(toolName);
        }
      } catch (error) {
        results.errors.push(`Tool ${toolName}: ${error.message}`);
      }
    }
    
    return results;
  }
  
  /**
   * Test tool parameter validation
   */
  async testParameterValidation() {
    const results = [];
    
    // Test CreateDocument with invalid params
    try {
      const createTool = this.toolRegistry.getTool('createDocument');
      const result = await createTool.execute({}); // Missing required params
      results.push({
        tool: 'createDocument',
        test: 'invalid_params',
        success: !result.success,
        message: result.error?.message || 'No error returned'
      });
    } catch (error) {
      results.push({
        tool: 'createDocument',
        test: 'invalid_params',
        success: true,
        message: error.message
      });
    }
    
    // Test ReadDocument with missing document
    try {
      const readTool = this.toolRegistry.getTool('readDocument');
      const result = await readTool.execute({
        documentType: 'Actor',
        documentId: 'nonexistent-id'
      });
      results.push({
        tool: 'readDocument',
        test: 'missing_document',
        success: !result.success,
        message: result.error?.message || 'No error returned'
      });
    } catch (error) {
      results.push({
        tool: 'readDocument',
        test: 'missing_document',  
        success: false,
        message: error.message
      });
    }
    
    return results;
  }
  
  /**
   * Test context tools (safe to execute)
   */
  async testContextTools() {
    const results = [];
    const contextTools = ['getWorldInfo', 'getSceneInfo', 'getUserPreferences'];
    
    for (const toolName of contextTools) {
      try {
        const tool = this.toolRegistry.getTool(toolName);
        const result = await tool.execute({});
        results.push({
          tool: toolName,
          success: result.success,
          hasData: result.success && Object.keys(result.result || {}).length > 0,
          message: result.error?.message || 'Success'
        });
      } catch (error) {
        results.push({
          tool: toolName,
          success: false,
          hasData: false,
          message: error.message
        });
      }
    }
    
    return results;
  }
}

// Global test function for console access
window.simulacrumTestTools = function() {
  if (!game.simulacrum?.toolRegistry) {
    console.error('Simulacrum tool registry not available');
    return;
  }
  
  const tester = new ToolTester(game.simulacrum.toolRegistry);
  
  console.log('=== Simulacrum Tool Integration Test ===');
  
  // Test registration
  const registrationResults = tester.testToolRegistration();
  console.log('Registration Results:', registrationResults);
  
  // Test context tools (async)
  tester.testContextTools().then(contextResults => {
    console.log('Context Tools Results:', contextResults);
  });
  
  // Test validation (async) 
  tester.testParameterValidation().then(validationResults => {
    console.log('Parameter Validation Results:', validationResults);
  });
};