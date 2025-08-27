# Simulacrum FoundryVTT Testing Infrastructure

## Testing Paradigm

> **📚 For detailed testing strategy and philosophy, see [`tests/docs/testing-strategy.md`](docs/testing-strategy.md)**  
> **🚀 For quick commands and troubleshooting, see [`tests/docs/testing-quick-reference.md`](docs/testing-quick-reference.md)**

### **Quick Overview:**
- **Pre-Commit**: Unit tests + code quality (fast, < 30s)
- **CI/CD**: Integration tests (medium, 5-15min)  
- **Nightly**: Performance + security tests (slow, 30+min)

### **Test Categories:**
- **Functional**: Unit, Integration, E2E tests (what the system does)
- **Non-Functional**: Performance, Security, Quality tests (technical aspects)

---

## ACTUAL FUCKING WORKFLOW (So Claude Doesn't Get Confused Again)

## Overview

This directory contains the complete integration testing infrastructure for the Simulacrum FoundryVTT module. The testing system follows a clean architecture that separates **bootstrap infrastructure** from **integration testing logic**, enabling maintainable and scalable testing across multiple FoundryVTT versions and game systems.

## Architecture

### 🏗️ Bootstrap Infrastructure (`bootstrap/`)
**Purpose**: Core test infrastructure that orchestrates the entire testing environment  
**Scope**: Infrastructure-only, no application testing

- **Dynamic Discovery**: Automatically finds FoundryVTT zip files in version folders
- **License Automation**: Handles license submission and EULA acceptance
- **System Installation**: Installs required game systems automatically  
- **Session Management**: Creates authenticated GM sessions ready for testing
- **Resource Management**: Dynamic port allocation and cleanup
- **Version Compatibility**: Handles FoundryVTT v12/v13 differences via per-version adapters

#### **Stage-First Design (Version Adapters per Stage)**
The bootstrap infrastructure uses a stage-first architecture aligned to Foundry's lifecycle, with per-version adapters under each stage:

- **`bootstrap-runner.js`**: Main orchestrator that executes four canonical stages
- **Stages**: `application-initialization`, `system-installation`, `world-creation`, `session-activation`
- **Per-version adapters**: `bootstrap/stages/<stage>/v12|v13/index.js`
- **`common/`**: Shared utilities (Docker ops, port management, browser automation)

This architecture ensures:
- **Clean Separation**: Version-specific logic localized inside stage adapters
- **Stable CLI**: The same four stages across all versions; `-l` lists stages only
- **Easy Extension**: Add new versions by implementing stage adapters without changing the runner
- **Maintainable/Testable**: Smaller, focused stage modules

### 🧪 Integration Tests (`integration/`)
**Purpose**: Test specific functionality against live FoundryVTT sessions  
**Scope**: Application testing only, no infrastructure concerns

- **Clean API**: Receives live session, tests functionality, returns results
- **No Infrastructure**: No Docker, containers, or cleanup concerns
- **Structured Results**: Consistent return format with success/failure data
- **Test Artifacts**: Screenshots, logs, performance metrics

### 📋 Test Orchestration (`run-tests.js`)
**Purpose**: Coordinate complete testing workflow  
**Scope**: Infrastructure management and test execution coordination

- **Permutation Management**: Tests across all version × system combinations
- **Resource Coordination**: Manages Docker images, containers, ports
- **Concurrency Control**: Respects `maxConcurrentInstances` configuration  
- **Comprehensive Reporting**: Aggregates results with success rates and timing
- **Version-Aware Testing**: Dynamically discovers and runs tests across versions
 - **Stage Listing (`-l`)**: Lists the four canonical stages per version; version flag optional

## Quick Start

### Running Tests

```bash
# Run all integration tests across all permutations
node tests/run-tests.js

# List available bootstrap stages (version optional)
node tests/run-tests.js -l
node tests/run-tests.js -l -v v12,v13

# The orchestrator will:
# 1. Load configuration from tests/config/test.config.json
# 2. Generate permutations (versions × systems)
# 3. For each test file:
#    - Create FoundryVTT sessions for each permutation
#    - Execute test against live session
#    - Generate artifacts and collect results
#    - Clean up resources
# 4. Generate comprehensive test report
```

### Configuration

All testing behavior is controlled via `tests/config/test.config.json`:

```json
{
  "foundry-versions": ["v12", "v13"],
  "foundry-systems": ["dnd5e", "pf2e"],
  "foundryLicenseKey": "YOUR-LICENSE-KEY",
  "docker": {
    "portBeginning": 30050,
    "maxConcurrentInstances": 1
  },
  "integration-tests": [
    "hello-world-clean.test.js"
  ]
}
```

### Prerequisites

1. **FoundryVTT License**: Valid license key in configuration
2. **FoundryVTT Binaries**: Place zip files in `tests/fixtures/binary_versions/{version}/`
3. **Docker**: Docker installed and running
4. **Node.js**: Node.js 18+ with ES module support

## File Structure

```
tests/
├── README.md                           # This documentation
├── SPECIFICATION.md                    # Detailed architecture specification
├── run-tests.js                        # Main test orchestrator
├── config/
│   └── test.config.json                # Test configuration
├── fixtures/
│   └── binary_versions/
│       ├── v12/FoundryVTT-*.zip        # FoundryVTT v12 binaries
│       └── v13/FoundryVTT-*.zip        # FoundryVTT v13 binaries
├── bootstrap/                           # Core test infrastructure
│   ├── bootstrap-runner.js             # Main orchestrator (stage-first)
│   ├── stages/                         # Canonical stages with per-version adapters
│   │   ├── application-initialization/
│   │   │   ├── v12/index.js
│   │   │   └── v13/index.js
│   │   ├── system-installation/
│   │   │   ├── v12/index.js
│   │   │   └── v13/index.js
│   │   ├── world-creation/
│   │   │   ├── v12/index.js
│   │   │   └── v13/index.js
│   │   └── session-activation/
│   │       ├── v12/index.js
│   │       └── v13/index.js
│   └── common/                         # Shared utilities
│       ├── docker-utils.js             # Docker build/run/health-check
│       ├── browser-utils.js            # Browser automation utilities
│       ├── port-manager.js             # Port allocation
│       └── index.js                    # Re-exports for common utilities
├── fixtures/                           # Test data and FoundryVTT binaries
│   └── binary_versions/
│       ├── v12/FoundryVTT-*.zip        # FoundryVTT v12 binaries
│       └── v13/FoundryVTT-*.zip        # FoundryVTT v13 binaries
├── helpers/                            # Test utilities and mocks (legacy/general)
├── docker/                             # Docker configuration for live FoundryVTT sessions
│   ├── Dockerfile.foundry              # FoundryVTT container definition
│   └── entrypoint.sh                   # Container startup script
└── artifacts/                          # Test results, logs, screenshots
```

## Writing Integration Tests

### Integration Test Philosophy

Integration tests must simulate **real user workflows**, not internal API calls. They should test the complete user experience from UI interaction to final outcome.

### Three Levels of Testing

**🎯 Level 1: End-to-End User Flow Tests (TRUE Integration)**
- Simulate complete user interactions through the UI
- Test how users actually interact with the system
- Validate UI states, loading indicators, error handling
- **Use this for**: Major user workflows, UI validation, complete feature testing

**🔧 Level 2: Component Integration Tests**
- Test component interactions via direct API calls
- Focus on data flow between components
- More controlled environment for specific scenarios
- **Use this for**: API validation, performance metrics, edge case testing

**⚙️ Level 3: Unit Tests**
- Test individual components in isolation with mocks
- **Use this for**: Component logic, error handling, data validation

### True Integration Test Structure (Level 1 - PREFERRED)

```javascript
// tests/integration/simulacrum-user-workflow.test.js

/**
 * Simulacrum User Workflow Integration Test
 * Tests complete user interaction flow through the Simulacrum interface
 * @param {Object} session - Live FoundryVTT session from bootstrap
 * @param {Object} permutation - Test permutation (version, system)  
 * @param {Object} config - Test configuration
 * @returns {Object} Test result with success status and details
 */
export default async function simulacrumUserWorkflowTest(session, permutation, config) {
  const { page, gameState } = session;
  
  try {
    // 1. SIMULATE USER OPENING SIMULACRUM (like a real user would)
    await page.click('[data-tool="simulacrum"]'); // Click scene control button
    await page.waitForSelector('.simulacrum-chat-modal', { timeout: 5000 });
    
    // 2. SIMULATE USER TYPING A MESSAGE
    const testMessage = 'Create a character named Test Warrior';
    await page.type('.simulacrum-chat-input', testMessage);
    await page.click('.simulacrum-send-button');
    
    // 3. VERIFY LOADING STATES (real user experience)
    await page.waitForSelector('.simulacrum-thinking-indicator', { timeout: 2000 });
    
    // 4. WAIT FOR RESPONSE (with realistic timeout)
    await page.waitForSelector('.simulacrum-chat-message.ai-response', { timeout: 30000 });
    
    // 5. VALIDATE USER-VISIBLE RESULTS
    const response = await page.$eval('.simulacrum-chat-message.ai-response', 
      el => el.textContent
    );
    
    const isValidResponse = response.length > 10 && !response.includes('Error');
    
    // 6. TEST ERROR HANDLING (user perspective)
    if (!isValidResponse) {
      const errorElement = await page.$('.simulacrum-error-message');
      if (errorElement) {
        const errorText = await page.$eval('.simulacrum-error-message', el => el.textContent);
        return {
          success: false,
          permutation,
          message: `User-visible error: ${errorText}`
        };
      }
    }
    
    // 7. CAPTURE USER EXPERIENCE ARTIFACTS
    const screenshot = await page.screenshot({ 
      path: `tests/artifacts/user-workflow-${permutation.id}-${Date.now()}.png`,
      fullPage: true
    });
    
    return {
      success: isValidResponse,
      permutation,
      message: "Complete user workflow test passed",
      artifacts: { screenshot },
      metrics: {
        userExperience: 'positive',
        responseReceived: true,
        uiStatesWorked: true
      }
    };
    
  } catch (error) {
    // Even error handling should consider user experience
    const failureScreenshot = await page.screenshot({ 
      path: `tests/artifacts/user-workflow-FAILED-${permutation.id}-${Date.now()}.png`,
      fullPage: true
    });
    
    return {
      success: false,
      permutation,
      message: `User workflow failed: ${error.message}`,
      artifacts: { failureScreenshot }
    };
  }
}
```

### Component Integration Test Structure (Level 2)

```javascript
// tests/integration/simulacrum-api-integration.test.js

/**
 * Simulacrum API Integration Test
 * Tests component interactions and data flow (NOT user workflow)
 * @param {Object} session - Live FoundryVTT session from bootstrap
 * @param {Object} permutation - Test permutation (version, system)  
 * @param {Object} config - Test configuration
 * @returns {Object} Test result with success status and details
 */
export default async function simulacrumApiIntegrationTest(session, permutation, config) {
  const { page, gameState } = session;
  
  try {
    // Test component interactions via page.evaluate (direct API access)
    const result = await page.evaluate(() => {
      // Direct access to game objects (NOT how users interact)
      const aiService = game.simulacrum.aiService;
      const agenticLoop = game.simulacrum.agenticLoopController;
      
      // Test API interactions directly
      return { success: true, data: "component integration results" };
    });
    
    return {
      success: result.success,
      permutation,
      message: "API integration test completed"
    };
    
  } catch (error) {
    return {
      success: false,
      permutation,
      message: error.message
    };
  }
}
```

### Integration Test Patterns

#### ✅ DO: Simulate Real User Actions
```javascript
// GOOD: Simulate how users actually interact
await page.click('[data-tool="simulacrum"]');
await page.type('.chat-input', 'Hello world');
await page.click('.send-button');
await page.waitForSelector('.response-message');
```

#### ❌ DON'T: Call Internal APIs Directly
```javascript
// BAD: This bypasses the user interface entirely
const result = await page.evaluate(() => {
  return game.simulacrum.aiService.sendMessage('Hello world');
});
```

#### ✅ DO: Test Complete User Workflows
```javascript
// GOOD: Test the entire user experience
1. User opens Simulacrum interface
2. User types and sends message  
3. User sees loading indicator
4. User receives response
5. User can continue conversation
```

#### ❌ DON'T: Test Only Technical Components
```javascript
// BAD: Users don't interact with parsers directly
const parser = agenticLoop.responseParser;
const parsed = await parser.parseAgentResponse(rawJson);
```

### Required Integration Test Elements

All TRUE integration tests (Level 1) must include:

1. **UI Interaction**: Click, type, navigate like a real user
2. **State Validation**: Verify loading states, error states, success states
3. **User-Visible Outcomes**: Test what users actually see
4. **Error Handling**: How errors appear to users
5. **Performance**: Real-world response times including UI rendering
6. **Artifacts**: Screenshots of actual user interface states

### Naming Conventions

- `*-user-workflow.test.js` - End-to-end user flow tests (Level 1)
- `*-api-integration.test.js` - Component integration tests (Level 2)  
- `*-component.test.js` - Unit tests (Level 3)

### Common User Workflows to Test

- **Opening and using Simulacrum chat interface**
- **Creating documents through AI assistance**  
- **Tool confirmation and execution workflows**
- **Error recovery and retry scenarios**
- **Multi-step conversations with context**
- **Settings and configuration changes**
```

### Test Requirements

1. **Export Default Function**: Test must be the default export
2. **Consistent Parameters**: `(session, permutation, config)`
3. **Structured Return**: Object with `success`, `permutation`, `message`
4. **No Infrastructure**: Don't manage Docker, containers, or bootstrap
5. **Error Handling**: Catch errors and return failure result

### Adding New Tests

1. Create test file in `tests/integration/`
2. Follow the structure above
3. Add filename to `integration-tests` array in `test.config.json`
4. Run tests with `node tests/run-tests.js`

## Advanced Usage

### Manual Bootstrap Testing

For debugging bootstrap issues:

```bash
# Container-only: build/run container(s), print info, wait for ESC, cleanup
node tests/run-tests.js --container-only -v v13

# Full manual session: complete bootstrap to a live session and wait for ESC
node tests/run-tests.js --manual -v v13
```

### Custom Test Execution

Import and use components directly:

```javascript
import { TestOrchestrator } from './tests/run-tests.js';
import { BootstrapRunner } from './tests/helpers/bootstrap/bootstrap-runner.js';

const orchestrator = new TestOrchestrator();
await orchestrator.initialize();

// Run specific test
const results = await orchestrator.runSingleIntegrationTest(
  'tests/integration/my-test.test.js',
  [{ id: 'v13-dnd5e', version: 'v13', system: 'dnd5e' }]
);
```

### Concurrency Scaling

Increase `maxConcurrentInstances` in config to run tests in parallel:

```json
{
  "docker": {
    "maxConcurrentInstances": 3  // Run up to 3 tests simultaneously
  }
}
```

The system automatically manages:
- Port allocation (unique port per instance)
- Container isolation (unique names per instance)  
- Resource cleanup (proper cleanup on completion)

## Troubleshooting

### Common Issues

**"No Foundry versions available"**
- Check FoundryVTT zip files are in `tests/fixtures/binary_versions/{version}/`
- Verify zip files are named correctly (any `.zip` file works)

**"License key not found"**  
- Set `foundryLicenseKey` in `tests/config/test.config.json`
- Ensure license key is valid and not expired

**"Docker build failed"**
- Check Docker is running
- Verify FoundryVTT zip files exist in fixtures
- Ensure sufficient disk space

**"Port allocation failed"**
- Check that `docker.portBeginning` is free
- Reduce or increase `docker.maxConcurrentInstances` based on capacity
- Ensure no other processes are using the planned port range `[portBeginning, portBeginning + maxConcurrentInstances - 1]`

### Debug Mode

Run with debug logging:

```bash
# Enable debug output
DEBUG=true node tests/run-tests.js

# Or use manual bootstrap for step-by-step debugging
node tests/helpers/bootstrap/manual-bootstrap-test.js v13-dnd5e --debug
```

### Cleanup

If tests leave containers running:

The runner performs automatic cleanup of containers and images at the end of runs.

If you still need to clean manually:
```bash
docker ps -a --filter "name=test-" --format "{{.Names}}" | xargs -r docker rm -f
docker image ls "simulacrum-foundry-test-*" --format "{{.Repository}}" | xargs -r docker rmi -f
```

## Migration from Legacy Tests

The old architecture mixed bootstrap and testing logic. New tests should:

1. **Remove bootstrap logic** - No Docker, container, or session management
2. **Receive live session** - Use session parameter instead of creating one
3. **Return structured results** - Use consistent return format
4. **Focus on testing** - Test functionality, not infrastructure

See `tests/integration/hello-world-clean.test.js` for a complete example of the new architecture.

## Performance and Scaling

### Resource Usage

- **Memory**: ~500MB per concurrent FoundryVTT instance
- **CPU**: Moderate during bootstrap, low during testing
- **Disk**: ~2GB per FoundryVTT version (Docker images)
- **Network**: Minimal (local Docker containers)

### Optimization Tips

1. **Limit Concurrency**: Start with `maxConcurrentInstances: 1`, scale gradually
2. **Version Selection**: Test fewer versions during development
3. **System Selection**: Focus on primary systems (dnd5e) for rapid iteration
4. **Cleanup Verification**: Ensure proper cleanup to prevent resource leaks

## Contributing

When adding new testing infrastructure:

1. **Follow Architecture**: Maintain separation between bootstrap and testing
2. **Dynamic Discovery**: No hardcoded paths, versions, or configurations
3. **Resource Management**: Always clean up Docker resources
4. **Error Handling**: Robust error handling with informative messages
5. **Documentation**: Update this README for new functionality

### **Bootstrap Infrastructure Development**
The bootstrap infrastructure follows an iterative development approach:

#### **Phase 1: Foundation** ✅
- Create version-specific directories (v12/, v13/)
- Create common utilities directory (common/)
- Extract Docker operations into docker-utils.js
- **Verification**: Docker operations work for both v12 and v13

#### **Phase 2: FoundryVTT Setup** 🚧
- Extract FoundryVTT startup logic into version-specific setup-foundry.js
- **Verification**: FoundryVTT containers start successfully for both versions
- Extract license key submission logic
- **Verification**: License key submission works for both versions

#### **Phase 3: EULA and Initial Setup** 📋
- Extract EULA acceptance logic into version-specific modules
- **Verification**: EULA acceptance works for both versions
- Extract initial setup page navigation logic
- **Verification**: Setup page navigation works for both versions

#### **Phase 4: System Installation** 🎲
- Extract system installation logic into version-specific install-system.js
- **Verification**: System installation works for both versions
- Extract module installation logic into version-specific install-module.js
- **Verification**: Module installation works for both versions

#### **Phase 5: Integration** 🔗
- Refactor bootstrap-runner.js to orchestrate version-specific modules
- **Verification**: Full bootstrap process works for both v12 and v13
- Update imports and ensure backward compatibility
- **Verification**: No regression in existing functionality

**Each phase must be completed and verified before moving to the next.**

For detailed architecture information, see `tests/SPECIFICATION.md`.