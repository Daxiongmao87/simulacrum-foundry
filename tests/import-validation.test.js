/**
 * @jest-environment jsdom
 */
// Comprehensive import validation test to catch missing/wrong/dead imports

import fs from 'fs';
import path from 'path';

describe('Import Validation', () => {
  let modulesToTest = [];

  beforeAll(() => {
    // Dynamically discover all JS files in scripts directory
    const scriptsDir = path.join(process.cwd(), 'scripts');
    
    function findJsFiles(dir, basePath = '') {
      const files = [];
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(basePath, item);
        
        if (fs.statSync(fullPath).isDirectory()) {
          files.push(...findJsFiles(fullPath, relativePath));
        } else if (item.endsWith('.js')) {
          files.push('../scripts/' + relativePath.replace(/\\/g, '/'));
        }
      }
      
      return files;
    }
    
    modulesToTest = findJsFiles(scriptsDir);
  });

  // Test each file individually to get specific error information
  modulesToTest.forEach((modulePath) => {
    const fileName = modulePath.split('/').pop();
    
    test(`should import ${fileName} without syntax errors`, async () => {
      try {
        // Attempt to import the module
        await import(modulePath);
      } catch (error) {
        // Provide detailed error information for debugging
        throw new Error(`Failed to import ${fileName}: ${error.message}\n${error.stack}`);
      }
    });
  });

  test('comprehensive import validation for all modules', async () => {
    const results = [];
    
    for (const modulePath of modulesToTest) {
      const fileName = modulePath.split('/').pop();
      
      try {
        await import(modulePath);
        results.push({ file: fileName, status: 'success' });
      } catch (error) {
        results.push({ 
          file: fileName, 
          status: 'error', 
          error: error.message,
          type: error.constructor.name 
        });
      }
    }

    const failures = results.filter(r => r.status === 'error');
    
    if (failures.length > 0) {
      const errorSummary = failures.map(f => 
        `${f.file}: ${f.type} - ${f.error}`
      ).join('\n');
      
      throw new Error(`${failures.length}/${modulesToTest.length} modules failed to import:\n${errorSummary}`);
    }
    
    expect(failures.length).toBe(0);
  });
});