import { DocumentCreateTool } from '../scripts/tools/document-create.js';

// MOCK GLOBAL FOUNDRY ENVIRONMENT
global.game = {
  documentTypes: { TestDoc: ['TestDoc'] },
  collections: {
    get: type => (type === 'TestDoc' ? { size: 0 } : undefined),
  },
};

// Mock Schema
const mockSchema = {
  fields: { name: {}, system: { fields: { description: {} } } },
  has: key => key === 'system',
  getField: key => (key === 'system' ? { fields: { description: {} } } : undefined),
};

// Mock Document Class
const MockDocumentClass = {
  documentName: 'TestDoc',
  schema: mockSchema,
};

global.CONFIG = {
  TestDoc: { documentClass: MockDocumentClass },
};

// Validate that DocumentAPI (which we import indirectly) will see our mock
// Note: DocumentAPI code imports 'logger' and others. We might need to mock them if they crash.
// But mostly it interacts with CONFIG.

async function runTest() {
  console.log('Starting Migration Verification...');

  const tool = new DocumentCreateTool();

  // Input: Flat data
  const inputParams = {
    documentType: 'TestDoc',
    name: 'Test Item',
    data: {
      description: 'This should be migrated',
      otherField: 'Keep me',
    },
  };

  // Mock validity check in tool
  tool.isValidDocumentType = () => true;
  tool.validateParameters = () => true;
  tool.validateImageUrls = () => true;

  // We need to prevent the actual "import DocumentAPI" from running logic that breaks,
  // OR we rely on DocumentAPI reading our global CONFIG.

  // Wait, DocumentCreateTool.execute line 95 imports DocumentAPI.
  // It then calls DocumentAPI.createDocument which will likely fail because we didn't mock DocumentAPI.createDocument.
  // BUT the migration happens BEFORE createDocument (lines 88-101 in my edit).
  // AND the migration calls DocumentAPI.getDocumentSchema.

  // So we need DocumentAPI.getDocumentSchema to work.
  // And we need catch block to NOT swallow the verification success?
  // No, we modify inputParams.data IN PLACE.
  // So validation is: check inputParams.data AFTER execute() throws (or returns).

  try {
    await tool.execute(inputParams);
  } catch (e) {
    // We expect it to fail at createDocument or import if mocks are incomplete,
    // but the migration should have happened.
    console.log('Execution finished/failed (expected). Checking data mutation...');
  }

  // Check results
  const system = inputParams.data.system;
  if (system && system.description === 'This should be migrated') {
    console.log('PASS: description was migrated to system.description');
  } else {
    console.error('FAIL: description was NOT migrated', inputParams.data);
    process.exit(1);
  }

  if (inputParams.data.description === undefined) {
    console.log('PASS: description was removed from root');
  } else {
    console.error('FAIL: description remains at root');
    process.exit(1);
  }
}

runTest().catch(console.error);
