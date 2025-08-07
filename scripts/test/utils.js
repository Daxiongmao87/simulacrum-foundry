// scripts/test/utils.js
// Utility functions for tests

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createMockTool(name, executeFn) {
  return {
    name,
    execute: executeFn,
    shouldConfirmExecute: async () => false
  };
}