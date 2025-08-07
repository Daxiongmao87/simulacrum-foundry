// scripts/test/run-tests.js
import { readdirSync } from 'fs';
import { join } from 'path';

const testDir = process.cwd();
const files = readdirSync(testDir).filter(f => f.endsWith('.test.js'));

let passed = 0, failed = 0;

for (const file of files) {
  try {
    const testModule = await import(join(testDir, file));
    if (typeof testModule.runTest === 'function') {
      await testModule.runTest();
      console.log(`✓ ${file}`);
      passed++;
    } else {
      console.log(`⚠ ${file} has no runTest`);
    }
  } catch (e) {
    console.error(`✗ ${file}`);
    console.error(e);
    failed++;
  }
}

console.log(`\nTest results: ${passed} passed, ${failed} failed`);