/**
 * @file validation-error-recovery.test.js
 * @description Tests for the AI retry mechanism when FoundryVTT document validation fails.
 */

import { FoundrySchemaExtractor } from '../core/foundry-schema-extractor.js';
import { ValidationErrorRecovery } from '../tools/validation-error-recovery.js';
import { GenericCRUDTools } from '../core/generic-crud-tools.js';
import { DocumentDiscoveryEngine } from '../core/document-discovery-engine.js';

/**
 * Mock AI service for testing
 */
class MockAIService {
  constructor() {
    this.lastPrompt = null;
  }
  
  async sendMessage(prompt) {
    this.lastPrompt = prompt;
    return { content: "Mock AI response with corrected data" };
  }
}

/**
 * Test suite for validation error recovery
 */
export async function runTest() {
  console.log('Simulacrum | Running ValidationErrorRecovery tests...');
  
  try {
    await testFoundrySchemaExtractor();
    await testValidationErrorRecovery();
    await testGenericCRUDToolsIntegration();
    
    console.log('✅ All ValidationErrorRecovery tests passed!');
    return { success: true, message: 'All validation error recovery tests completed successfully' };
  } catch (error) {
    console.error('❌ ValidationErrorRecovery test failed:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Test FoundrySchemaExtractor
 */
async function testFoundrySchemaExtractor() {
  console.log('Testing FoundrySchemaExtractor...');
  
  // Test basic schema extraction structure
  const extractor = FoundrySchemaExtractor;
  
  // Test that methods exist
  if (typeof extractor.getDocumentSchema !== 'function') {
    throw new Error('FoundrySchemaExtractor.getDocumentSchema method missing');
  }
  
  if (typeof extractor.convertFoundrySchemaToJSONSchema !== 'function') {
    throw new Error('FoundrySchemaExtractor.convertFoundrySchemaToJSONSchema method missing');
  }
  
  if (typeof extractor.mapFieldTypeToJSONSchemaType !== 'function') {
    throw new Error('FoundrySchemaExtractor.mapFieldTypeToJSONSchemaType method missing');
  }
  
  // Test type mapping
  const stringType = extractor.mapFieldTypeToJSONSchemaType('String');
  if (stringType !== 'string') {
    throw new Error(`Expected 'string', got '${stringType}'`);
  }
  
  const numberType = extractor.mapFieldTypeToJSONSchemaType(Number);
  if (numberType !== 'number') {
    throw new Error(`Expected 'number', got '${numberType}'`);
  }
  
  console.log('✓ FoundrySchemaExtractor tests passed');
}

/**
 * Test ValidationErrorRecovery
 */
async function testValidationErrorRecovery() {
  console.log('Testing ValidationErrorRecovery...');
  
  const mockAI = new MockAIService();
  const recovery = new ValidationErrorRecovery(mockAI);
  
  // Test basic methods exist
  if (typeof recovery.buildValidationErrorPrompt !== 'function') {
    throw new Error('buildValidationErrorPrompt method missing');
  }
  
  if (typeof recovery.formatSchemaForAI !== 'function') {
    throw new Error('formatSchemaForAI method missing');
  }
  
  if (typeof recovery.analyzeErrorPatterns !== 'function') {
    throw new Error('analyzeErrorPatterns method missing');
  }
  
  // Test error pattern analysis (doesn't require FoundryVTT)
  const errorMessage = "Validation failed: required field 'name' missing";
  const analysis = recovery.analyzeErrorPatterns(errorMessage, null);
  if (!analysis.includes('required')) {
    throw new Error('Error analysis did not detect required field pattern');
  }
  
  // Test schema formatting
  const mockSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', required: true },
      type: { type: 'string', enum: ['character', 'npc'] }
    }
  };
  
  const formattedSchema = recovery.formatSchemaForAI(mockSchema);
  if (!formattedSchema || !formattedSchema.includes('name')) {
    throw new Error('Schema formatting failed');
  }
  
  console.log('✓ ValidationErrorRecovery tests passed');
}

/**
 * Test GenericCRUDTools integration
 */
async function testGenericCRUDToolsIntegration() {
  console.log('Testing GenericCRUDTools integration...');
  
  // Test constructor and basic integration without requiring FoundryVTT globals
  const discoveryEngine = new DocumentDiscoveryEngine();
  const mockAI = new MockAIService();
  
  // Test constructor with AI service
  const crudToolsWithAI = new GenericCRUDTools(discoveryEngine, mockAI);
  
  // Test that validation error recovery is properly initialized
  if (!crudToolsWithAI.validationErrorRecovery) {
    throw new Error('ValidationErrorRecovery not initialized in GenericCRUDTools');
  }
  
  if (!crudToolsWithAI.aiService) {
    throw new Error('AI service not stored in GenericCRUDTools');
  }
  
  // Test constructor without AI service
  const crudToolsNoAI = new GenericCRUDTools(discoveryEngine);
  
  if (crudToolsNoAI.validationErrorRecovery !== null) {
    throw new Error('ValidationErrorRecovery should be null when no AI service provided');
  }
  
  if (crudToolsNoAI.aiService !== null) {
    throw new Error('AI service should be null when not provided');
  }
  
  // Test validation error detection
  const validationError = new Error('Validation failed: required field missing');
  if (!crudToolsWithAI.isValidationError(validationError)) {
    throw new Error('isValidationError did not detect validation error');
  }
  
  const regularError = new Error('Network timeout');
  if (crudToolsWithAI.isValidationError(regularError)) {
    throw new Error('isValidationError incorrectly identified regular error as validation error');
  }
  
  console.log('✓ GenericCRUDTools integration tests passed');
}

// Export for external test runners
if (typeof window !== 'undefined' && window.game) {
  window.testValidationErrorRecovery = runTest;
}