# FoundryVTT Integration Testing Infrastructure Specification

## Overview

The FoundryVTT integration testing infrastructure provides automated end-to-end testing across multiple FoundryVTT versions and game systems. The architecture separates **bootstrap infrastructure** (getting to a live FoundryVTT session) from **integration test logic** (testing specific functionality).

## Architecture Components

### 1. Bootstrap Infrastructure
**Purpose**: Get from Docker image to authenticated live FoundryVTT game session  
**Scope**: Infrastructure-only, no application testing  
**Location**: `tests/helpers/bootstrap/`

**Responsibilities**:
- Build Docker images (if not exists)
- Deploy containers with proper port allocation
- Handle FoundryVTT license submission
- Accept EULA agreements
- Install required game systems
- Create and launch test worlds
- Authenticate as GameMaster
- Verify game session is ready for testing

**Dynamic Binary Discovery**:
- NO hardcoded zip file names (FoundryVTT-Node-13.347.zip, etc.)
- Dynamically discover zip files in version folders: `tests/fixtures/binary_versions/{version}/`
- Handle version changes, naming convention changes automatically
- Simply find the .zip file in the given version folder, regardless of specific naming

**Dynamic Port Allocation**:
- NO hardcoded ports (30000, 30001, etc.)
- Dynamically allocate ports from configured range based on concurrent instances
- Port manager allocates/deallocates ports automatically per container
- Supports scaling from sequential (1 instance) to parallel (N instances) execution

**Output**: Live FoundryVTT session accessible via browser automation (Puppeteer page object)

### 2. Integration Test Scripts
**Purpose**: Test specific application functionality against live FoundryVTT sessions  
**Scope**: Application testing only  
**Location**: `tests/integration/`

**Responsibilities**:
- Receive live FoundryVTT session from bootstrap
- Execute specific test scenarios
- Validate expected behaviors
- Generate test results and artifacts
- Return success/failure status

**Input**: Live FoundryVTT session (Puppeteer page object)  
**Output**: Test results, screenshots, logs

### 3. Test Orchestration
**Purpose**: Coordinate complete testing workflow  
**Scope**: Infrastructure management and test execution coordination  
**Location**: `tests/run-tests.js`

## Test Execution Workflow

### Concurrency Control
The test infrastructure respects `maxConcurrentInstances` from test.config.json:

- **maxConcurrentInstances: 1** (current): Sequential execution, one test at a time
- **maxConcurrentInstances: N** (future): Up to N parallel test executions with port management
- **Port Management**: Dynamic allocation from `portRange` (30000-30010 = 11 available ports)
- **Resource Isolation**: Each concurrent instance gets unique container name, port, and Docker image tag

### Single Integration Test Execution (Concurrent-Aware)

```
For each integration test script:
  Create permutation queue: [v12-dnd5e, v12-pf2e, v13-dnd5e, v13-pf2e]
  
  While permutation queue not empty:
    Acquire execution slot (limited by maxConcurrentInstances)
    
    For next available permutation:
      1. Allocate unique port from available range
      2. Build Docker image (if not exists) with unique tag
      3. Deploy container with allocated port
      4. Run bootstrap steps → Live FoundryVTT session
      5. Execute integration test script
      6. Collect test results/artifacts
      7. Clean up container (stop/remove)
      8. Release port for reuse
      9. Record test outcome
    
    Release execution slot
  
  After all permutations complete:
    10. Remove built Docker images for this test
```

### Complete Test Suite Execution (Concurrent-Aware)

```
1. Load test.config.json (versions, systems, test scripts, concurrency settings)
2. Initialize port manager with available range (30000-30010)
3. Initialize concurrency semaphore with maxConcurrentInstances limit
4. Discover available integration test scripts

5. For each integration test script:
   - Execute Single Integration Test Execution workflow (concurrent-aware)
   - Aggregate results across all permutations
   
6. Generate final test report with concurrency metrics
7. Clean up any remaining artifacts
8. Release all allocated resources
```

### Concurrency Examples

**Sequential (maxConcurrentInstances: 1)**:
```
[Test A] v12-dnd5e (port 30000) → complete → cleanup
[Test A] v12-pf2e (port 30000) → complete → cleanup  
[Test A] v13-dnd5e (port 30000) → complete → cleanup
[Test A] v13-pf2e (port 30000) → complete → cleanup
[Test B] v12-dnd5e (port 30000) → complete → cleanup
...
```

**Parallel (maxConcurrentInstances: 3)**:
```
[Test A] v12-dnd5e (port 30000) ┐
[Test A] v12-pf2e (port 30001)  ├─ Running concurrently
[Test A] v13-dnd5e (port 30002) ┘
                                 
[Test A] v13-pf2e (port 30000) ← Starts when slot becomes available
[Test B] v12-dnd5e (port 30001) ← Starts when slot becomes available  
[Test B] v12-pf2e (port 30002) ← Starts when slot becomes available
...
```

## Configuration

### test.config.json Structure
```json
{
  "foundry-versions": ["v12", "v13"],
  "foundry-systems": ["dnd5e", "pf2e"],
  "foundryLicenseKey": "ENV:FOUNDRY_LICENSE_KEY",
  "docker": {
    "imagePrefix": "foundry-test",
    "portRange": {
      "start": 30000,
      "end": 30010
    },
    "maxConcurrentInstances": 1,
    "dataPath": "/data"
  },
  "bootstrap": {
    "timeouts": {
      "containerHealthCheck": 30000,
      "setupPageReady": 60000,
      "systemInstallation": 300000
    },
    "retries": {
      "containerHealthCheck": 30,
      "healthCheckInterval": 1000
    }
  },
  "integration-tests": [
    "hello-world.test.js",
    "simulacrum-basic-chat.test.js",
    "simulacrum-document-crud.test.js"
  ]
}
```

## File Structure

```
tests/
├── SPECIFICATION.md                 # This document
├── config/
│   └── test.config.json            # Test configuration
├── fixtures/
│   └── binary_versions/
│       ├── v12/FoundryVTT-*.zip    # FoundryVTT binaries
│       └── v13/FoundryVTT-*.zip
├── helpers/
│   ├── bootstrap/                   # Bootstrap infrastructure
│   │   ├── bootstrap-runner.js     # Core bootstrap orchestration
│   │   ├── license-helper.js       # License submission automation
│   │   ├── system-installer.js     # Game system installation
│   │   ├── world-creator.js        # World creation automation
│   │   └── session-manager.js      # Session authentication
│   ├── container-manager.js        # Docker container lifecycle
│   ├── port-manager.js             # Port allocation management
│   └── test-reporter.js            # Test result aggregation
├── integration/                     # Integration test scripts
│   ├── hello-world.test.js         # Basic connectivity test
│   ├── simulacrum-basic-chat.test.js
│   └── simulacrum-document-crud.test.js
├── docker/
│   ├── Dockerfile.foundry          # FoundryVTT container definition
│   └── entrypoint.sh              # Container startup script
├── run-tests.js                    # Main test orchestrator
└── cleanup-test-containers.js      # Emergency cleanup utility
```

## Bootstrap API

### BootstrapRunner Class

```javascript
class BootstrapRunner {
  async initialize()
  async createSession(permutation)  // Returns: { page, browser, containerId }
  async cleanupSession(sessionInfo)
  async cleanupImages(permutation)
}
```

**Permutation Structure**:
```javascript
{
  id: "v13-dnd5e",
  version: "v13", 
  system: "dnd5e",
  description: "D&D 5e on FoundryVTT v13"
}
```

**Session Response**:
```javascript
{
  page: puppeteerPage,      // Live FoundryVTT session
  browser: puppeteerBrowser,
  containerId: "container-id",
  port: 30001,
  gameState: {              // Verification data
    gameReady: true,
    userAuthenticated: true,
    isGM: true,
    systemId: "dnd5e"
  }
}
```

## Integration Test API

### Integration Test Script Structure

```javascript
// tests/integration/example.test.js
export default async function exampleIntegrationTest(session, permutation, config) {
  const { page, gameState } = session;
  
  // Test implementation
  console.log(`🧪 Testing example functionality on ${permutation.description}`);
  
  // Use page object to interact with live FoundryVTT
  const result = await page.evaluate(() => {
    // Test game.ready, UI elements, Simulacrum functionality, etc.
    return {
      success: true,
      testData: "example results"
    };
  });
  
  // Generate test artifacts
  const screenshot = await page.screenshot({ 
    path: `test-results/example-${permutation.id}-${Date.now()}.png` 
  });
  
  return {
    success: result.success,
    permutation,
    artifacts: {
      screenshot,
      testData: result.testData
    },
    message: "Example test completed successfully"
  };
}
```

### Test Orchestrator Usage

```javascript
// tests/run-tests.js
import { BootstrapRunner } from './helpers/bootstrap/bootstrap-runner.js';
import { TestReporter } from './helpers/test-reporter.js';

const config = loadConfig('tests/config/test.config.json');
const bootstrap = new BootstrapRunner(config);
const reporter = new TestReporter();

for (const testScript of config['integration-tests']) {
  const testFunction = await import(`./integration/${testScript}`);
  
  for (const permutation of generatePermutations(config)) {
    // Bootstrap phase
    const session = await bootstrap.createSession(permutation);
    
    try {
      // Test execution phase
      const testResult = await testFunction.default(session, permutation, config);
      reporter.recordResult(testResult);
      
    } finally {
      // Cleanup phase
      await bootstrap.cleanupSession(session);
    }
  }
  
  // Image cleanup after all permutations for this test
  await bootstrap.cleanupImages();
}

reporter.generateReport();
```

## Error Handling

### Bootstrap Failures
- **License Issues**: Clear error messages, license validation
- **Container Failures**: Automatic cleanup, port deallocation
- **System Installation**: Retry logic, detailed logging
- **Session Authentication**: Fallback strategies, timeout handling

### Test Failures
- **Individual Test Failures**: Isolated, don't affect other tests
- **Session Corruption**: Automatic session recreation
- **Resource Exhaustion**: Graceful degradation, cleanup enforcement

### Infrastructure Failures
- **Docker Issues**: Clear diagnostics, automatic cleanup
- **Port Conflicts**: Dynamic allocation, conflict resolution
- **File System Issues**: Permission validation, path verification

## Performance Considerations

### Resource Management
- **Port Pool**: Dynamic allocation from configured range (default: 30000-30010 = 11 ports)
- **Concurrency Limits**: Enforced by `maxConcurrentInstances` setting
- **Memory Usage**: Docker container resource limits per instance
- **Disk Space**: Automatic cleanup of images after test completion
- **CPU Usage**: Controlled by concurrency limits to prevent resource exhaustion

### Optimization Strategies
- **Image Reuse**: Build once per permutation, reuse across tests
- **Container Lifecycle**: Fast start/stop, minimal initialization
- **Port Reuse**: Dynamic allocation and release for maximum efficiency
- **Concurrency Scaling**: Configurable parallel execution via `maxConcurrentInstances`
- **Resource Pooling**: Efficient utilization of available ports and container slots

## Monitoring and Diagnostics

### Test Progress Tracking
- Real-time progress updates per permutation
- Detailed logging with timestamps
- Resource usage monitoring
- Failure rate tracking

### Debugging Support
- Screenshot capture on failures
- Container log preservation
- Network traffic logging
- Performance metrics collection

### Reporting
- Comprehensive test results with artifacts
- Per-permutation success/failure breakdown
- Performance metrics and timing data
- Infrastructure health status

## Future Enhancements

### Parallel Execution
- Container isolation for concurrent tests
- Resource pool management
- Load balancing across test runners

### Cloud Integration
- CI/CD pipeline integration
- Remote FoundryVTT licensing
- Distributed test execution
- Result artifact storage

### Advanced Testing
- Multi-user session testing
- Performance benchmarking
- Regression testing automation
- Cross-browser compatibility testing

---

This specification ensures clean separation between infrastructure (bootstrap) and testing logic, enabling maintainable, scalable integration testing across the full FoundryVTT ecosystem.