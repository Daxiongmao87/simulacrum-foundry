// scripts/test/README.md
# Simulacrum Test Suite

This directory contains automated tests for the Simulacrum FoundryVTT module. The tests are written in plain JavaScript and can be run with Node.js.

## Running the tests

```bash
node scripts/test/run-tests.js
```

The test runner will execute all files ending with `.test.js` in this directory.

## Test structure

- `tool-scheduler.test.js` – Tests the tool scheduler lifecycle and error handling.
- `tool-call-parser.test.js` – Tests parsing of AI responses into tool calls.
- `agentic-loop.test.js` – Tests a simple agentic loop scenario.
- `integration.test.js` – Placeholder for end‑to‑end integration tests.
- `edge-case.test.js` – Placeholder for edge‑case and boundary tests.
- `performance.test.js` – Placeholder for performance and load tests.

## Extending the tests

Add new test files following the naming convention `*.test.js` and export a `runTest` async function. The test runner will automatically import and execute it.