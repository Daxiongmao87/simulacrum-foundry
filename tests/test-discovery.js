#!/usr/bin/env node

import { glob } from 'glob';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testDiscovery() {
  console.log('Simulacrum | Testing auto-discovery with enable/disable toggles:\n');
  
  const testPattern = join(__dirname, 'integration', '**', '*.test.js');
  const testFiles = await glob(testPattern);
  
  console.log(`Simulacrum | Found ${testFiles.length} test files:\n`);
  
  for (const testFile of testFiles) {
    const testName = basename(testFile, '.test.js');
    try {
      const testModule = await import(testFile);
      const metadata = testModule.testMetadata || {};
      const isEnabled = metadata.enabled !== false;
      
      console.log(`Simulacrum |   ${testName}:`);
      console.log(`Simulacrum |     - Enabled: ${isEnabled}`);
      console.log(`Simulacrum |     - Category: ${metadata.category || 'none'}`);
      console.log(`Simulacrum |     - Priority: ${metadata.priority || 'normal'}`);
      console.log(`Simulacrum |     - Tags: ${metadata.tags ? metadata.tags.join(', ') : 'none'}`);
      console.log('Simulacrum | ');
    } catch (error) {
      console.log(`Simulacrum |   ${testName}: ERROR - ${error.message}\n`);
    }
  }
}

testDiscovery();