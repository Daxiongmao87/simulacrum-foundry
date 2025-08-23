# Simulacrum FoundryVTT Testing Infrastructure

## Testing Paradigm

> **📚 For detailed testing strategy and philosophy, see [`docs/testing-strategy.md`](../docs/testing-strategy.md)**  
> **🚀 For quick commands and troubleshooting, see [`docs/testing-quick-reference.md`](../docs/testing-quick-reference.md)**

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
- **Version Compatibility**: Handles FoundryVTT v12/v13 differences in UI automation

#### **Modular Design for Version Compatibility**
The bootstrap infrastructure uses a modular approach to handle UI differences between FoundryVTT versions:

- **`bootstrap-runner.js`**: Main orchestrator that delegates to version-specific modules
- **`v12/` & `v13/`**: Version-specific UI automation (button selectors, page flows, etc.)
- **`common/`**: Shared utilities (e.g., Docker operations, port management, browser automation)

This architecture ensures:
- **Clean Separation**: Version logic isolated from core orchestration
- **Easy Extension**: New versions can be added without touching existing code
- **Maintainable**: Each version's UI quirks are contained in dedicated modules
- **Testable**: Version modules can be tested independently

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
- **Version-Aware Testing**: Dynamically discovers and runs version-specific tests

## Quick Start

### Running Tests

```bash
# Run all integration tests across all permutations
node tests/run-tests.js

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
│   ├── bootstrap-runner.js             # Main orchestrator (version-agnostic)
│   ├── v12/                            # v12-specific UI automation
│   │   ├── setup-foundry.js            # v12 setup logic
│   │   ├── install-system.js           # v12 system installation
│   │   └── install-module.js           # v12 module installation
│   ├── v13/                            # v13-specific UI automation
│   │   ├── setup-foundry.js            # v13 setup logic
│   │   ├── install-system.js           # v13 system installation
│   │   └── install-module.js           # v13 module installation
│   └── common/                         # Shared utilities (single source of truth)
│       ├── docker-utils.js             # Docker build/run/health-check
│       ├── browser-utils.js            # Browser automation utilities
│       ├── port-manager.js             # Port allocation (portBeginning + maxConcurrentInstances)
│       └── index.js                    # Re-exports for common utilities
├── helpers/                             # Test utilities and mocks (legacy/general)
│   └── container-manager.js            # Legacy container lifecycle (avoid for bootstrap)
├── integration/                         # Integration test scripts
│   ├── hello-world-clean.test.js       # Example clean integration test
│   ├── hello-world.test.js             # Legacy test (old architecture)
│   └── integration-test-template.js    # Legacy template
├── docker/
│   ├── Dockerfile.foundry              # FoundryVTT container definition
│   └── entrypoint.sh                   # Container startup script
└── poc/
    └── foundry-bootstrap-poc.js         # Working POC that inspired the architecture
```

## Writing Integration Tests

### Test Structure

Integration tests are simple functions that receive a live FoundryVTT session:

```javascript
// tests/integration/my-test.test.js

/**
 * My Integration Test
 * @param {Object} session - Live FoundryVTT session from bootstrap
 * @param {Object} permutation - Test permutation (version, system)  
 * @param {Object} config - Test configuration
 * @returns {Object} Test result with success status and details
 */
export default async function myIntegrationTest(session, permutation, config) {
  const { page, gameState } = session;
  
  try {
    // Test your functionality using the live FoundryVTT session
    const result = await page.evaluate(() => {
      // Interact with FoundryVTT: game.*, ui.*, etc.
      return { success: true, data: "test results" };
    });
    
    // Generate test artifacts
    const screenshot = await page.screenshot({ 
      path: `test-results/my-test-${permutation.id}-${Date.now()}.png` 
    });
    
    return {
      success: result.success,
      permutation,
      message: "Test completed successfully",
      artifacts: { screenshot }
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

```bash
# Emergency cleanup
node tests/cleanup-test-containers.js
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