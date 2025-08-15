# FoundryVTT License Entry Automation Implementation

**Issue #40: Implement FoundryVTT License Entry Automation**

This document provides comprehensive details on the implementation of robust license entry automation for FoundryVTT Docker testing infrastructure.

## Summary

Enhanced the existing `enterLicenseKey()` method in DockerTestRunner with comprehensive automation strategies that automatically bypass license screens during CI/testing workflows. The implementation includes multiple selector strategies, enhanced navigation handling, comprehensive error detection, and integration with both sequential and concurrent testing frameworks.

## Implementation Details

### 1. Enhanced License Detection

**File:** `tests/helpers/docker-test-runner.js` (lines 256-559)

#### Multiple Selector Strategies
```javascript
// Enhanced license input selectors with FoundryVTT-specific patterns
const licenseSelectors = [
  // Standard form inputs
  'input[name="licenseKey"]',
  'input[name="license"]', 
  'input[name="key"]',
  '#license-key',
  '#licenseKey', 
  '#license',
  
  // FoundryVTT-specific patterns
  '.license-key-input',
  '.license-input',
  '.foundry-license input',
  'input[placeholder*="license" i]',
  'input[placeholder*="key" i]',
  
  // Form context selectors
  '.license-form input[type="text"]',
  '.setup-form input[type="text"]',
  'form input[type="text"]',
  
  // Fallback strategy
  'input[type="text"]'
];
```

#### Smart Input Detection
- **Context Analysis**: Evaluates input element context (name, id, placeholder, parent text)
- **License-Specific Filtering**: Only targets inputs actually related to license entry
- **Fallback Strategy**: Uses first text input if on detected license screen

### 2. Enhanced Submit Button Detection

#### Multiple Submit Strategies
```javascript
const submitSelectors = [
  // Standard submit buttons
  'button[type="submit"]',
  'input[type="submit"]',
  
  // FoundryVTT-specific patterns
  '.license-submit',
  '.foundry-submit',
  'button[data-action="submit"]',
  'button[data-action="license"]',
  
  // Text-based detection
  'button:has-text("submit")',
  'button:has-text("continue")',
  'button:has-text("activate")',
  'button:has-text("accept")',
  
  // Form context
  '.license-form button',
  '.setup-form button',
  'form button',
  
  // Generic fallback
  'button'
];
```

#### Smart Button Detection
- **Text Analysis**: Checks button text for submit-related keywords
- **Attribute Analysis**: Examines type and data-action attributes
- **Context Filtering**: Prioritizes buttons in license/form contexts

### 3. Enhanced Navigation Handling

#### Multiple Navigation Strategies
```javascript
const navigationResult = await Promise.race([
  // Strategy 1: Wait for navigation
  page.waitForNavigation({ 
    waitUntil: 'networkidle0', 
    timeout: 20000 
  }).then(() => ({ type: 'navigation', success: true })),
  
  // Strategy 2: Wait for URL change
  page.waitForFunction(() => 
    !window.location.href.includes('license') || 
    window.location.href.includes('setup') ||
    window.location.href.includes('game'),
    { timeout: 20000 }
  ).then(() => ({ type: 'url_change', success: true })),
  
  // Strategy 3: Wait for license screen to disappear
  page.waitForFunction(() => {
    const licenseInputs = document.querySelectorAll('input[name*="license"], input[id*="license"], .license-input');
    return licenseInputs.length === 0;
  }, { timeout: 20000 }).then(() => ({ type: 'screen_change', success: true })),
  
  // Strategy 4: Timeout fallback
  this.sleep(25000).then(() => ({ type: 'timeout', success: false }))
]);
```

#### Navigation Validation
- **Multiple Detection Methods**: URL change, DOM change, navigation events
- **Robust Timeout Handling**: Graceful fallback if navigation takes longer than expected
- **Success Reporting**: Detailed reporting of which strategy succeeded

### 4. Comprehensive Error Detection

#### License Error Detection
```javascript
const errorMessages = [
  'invalid license',
  'license expired', 
  'license already in use',
  'license error',
  'invalid key',
  'license not found'
];

const hasError = errorMessages.some(msg => bodyText.includes(msg));
```

#### Error Handling
- **Post-Submission Validation**: Checks for license-related errors after submission
- **Graceful Failure**: Returns detailed error information without breaking tests
- **Status Reporting**: Comprehensive status codes for different scenarios

### 5. Return Value Enhancement

#### Detailed Result Structure
```javascript
return {
  success: boolean,           // Whether license automation succeeded
  status: string,            // Specific status code
  details: string            // Human-readable description with technical details
};
```

#### Status Codes
- `license_accepted`: License successfully submitted and accepted
- `license_auto_accepted`: License automatically accepted without submit button
- `no_license_required`: No license input detected, license not required
- `no_license_key`: License input found but no license key provided
- `license_error`: License submission failed with error message
- `no_submit_method`: License input filled but no submit method found
- `license_entry_error`: Error during license entry process

### 6. ConcurrentDockerTestRunner Integration

**File:** `tests/helpers/concurrent-docker-test-runner.js` (lines 255-587)

#### Enhanced Bootstrap with License Tracking
```javascript
async bootstrapFoundryEnvironmentWithLicenseTracking(page, context) {
  // Enter license key with detailed tracking
  const licenseResult = await this.enterLicenseKey(page);
  
  // Store license result for test analysis
  const bootstrapResult = {
    licenseAutomation: licenseResult,
    timestamp: new Date().toISOString(),
    container: context
  };
  
  // Handle critical errors
  if (!licenseResult.success && licenseResult.status === 'license_error') {
    throw new Error(`License entry failed: ${licenseResult.details}`);
  }
  
  return bootstrapResult;
}
```

#### Concurrent Testing Support
- **Detailed Tracking**: Records license automation results for each container
- **Port-Specific Handling**: Works with dynamic port allocation
- **Error Propagation**: Properly handles license failures in concurrent scenarios

## Testing Implementation

### 1. Comprehensive Integration Tests

**File:** `tests/integration/license-automation-validation.test.js`

#### Test Coverage
1. **Enhanced License Detection**: Validates multiple selector strategies
2. **License Automation**: Tests actual license key entry and submission
3. **Concurrent Handling**: Validates automation across multiple containers
4. **Error Handling**: Tests graceful failure scenarios
5. **Integration**: Validates complete bootstrap sequence

### 2. Focused Bypass Tests

**File:** `tests/integration/license-screen-bypass.test.js`

#### Core Validation
1. **License Screen Bypass**: Proves automatic bypass prevents getting stuck
2. **Missing License Handling**: Validates graceful degradation
3. **Performance**: Ensures automation completes efficiently

## Configuration Integration

### Environment Variable Support
```javascript
const licenseKey = process.env.FOUNDRY_LICENSE_KEY || this.config.foundryLicenseKey;
```

### Graceful Degradation
- **Missing Key Handling**: Continues without failing when no license key provided
- **Template Detection**: Skips automation if placeholder values detected
- **Warning Messages**: Provides clear guidance on license key setup

## Performance Characteristics

### Timing Optimization
- **Smart Waiting**: Uses efficient waiting strategies (3s initial, 1s validation)
- **Parallel Strategies**: Multiple navigation detection methods run concurrently
- **Timeout Management**: Reasonable timeouts with fallback strategies

### Resource Efficiency
- **Selector Optimization**: Prioritizes most likely selectors first
- **Early Exit**: Stops searching when suitable elements found
- **Memory Management**: Cleans up DOM queries efficiently

## Error Resilience

### Robust Error Handling
- **Non-Breaking Failures**: License automation errors don't break test execution
- **Detailed Diagnostics**: Comprehensive error reporting for debugging
- **Fallback Strategies**: Multiple approaches for each automation step

### Debug Information
```javascript
console.log(`License screen detection: hasLicenseText=${hasLicenseText}, hasSetupTitle=${hasSetupTitle}`);
console.log(`Found license input with selector: ${selector}`);
console.log(`Input context: name="${name}", placeholder="${placeholder}", id="${id}"`);
```

## Acceptance Criteria Compliance

### ✅ Issue #40 Requirements Met

1. **Multiple Selector Strategies**: ✅ Implemented 15+ different selector patterns
2. **Robust License Key Entry**: ✅ Enhanced input detection and entry logic
3. **Proper Navigation Waiting**: ✅ Multiple navigation detection strategies
4. **Error Handling**: ✅ Comprehensive error detection and graceful failure
5. **Environment Variable Support**: ✅ FOUNDRY_LICENSE_KEY integration
6. **Integration Tests**: ✅ Comprehensive test suite proving functionality

### Integration Points

#### DockerTestRunner Enhancement
- **Backward Compatible**: Existing tests continue to work
- **Enhanced Reliability**: More robust license handling
- **Better Diagnostics**: Detailed logging and error reporting

#### ConcurrentDockerTestRunner Support  
- **Port-Aware**: Works with dynamic port allocation
- **Concurrent Safe**: Handles multiple containers simultaneously
- **Result Tracking**: Detailed automation results for analysis

## Usage Examples

### Basic Usage (Automatic)
```javascript
const runner = new DockerTestRunner();
const { page, containerId } = await runner.setupTestEnvironment(context);
// License automation happens automatically during setupTestEnvironment
```

### Concurrent Usage  
```javascript
const runner = new ConcurrentDockerTestRunner();
const { page, containerId, licenseResult } = await runner.setupTestEnvironment(context);
console.log('License automation result:', licenseResult.licenseAutomation);
```

### Manual Testing
```javascript
const licenseResult = await runner.enterLicenseKey(page);
if (licenseResult.success) {
  console.log(`License accepted: ${licenseResult.details}`);
} else {
  console.log(`License automation handled: ${licenseResult.status}`);
}
```

## Future Enhancements

### Potential Improvements
1. **Version-Specific Patterns**: Add FoundryVTT version-specific selector strategies
2. **Machine Learning**: Learn from successful selector patterns over time
3. **Visual Detection**: Screenshot-based license screen detection
4. **Retry Strategies**: Automatic retry with different strategies on failure

### Monitoring Integration
1. **Metrics Collection**: Track automation success rates
2. **Performance Monitoring**: Monitor automation timing across versions  
3. **Alert Integration**: Notify on consistent automation failures

## Conclusion

The enhanced license entry automation provides robust, reliable license screen bypass functionality that prevents CI workflows from getting stuck on license screens. The implementation uses multiple redundant strategies to ensure high success rates across different FoundryVTT versions and configurations while providing comprehensive error handling and diagnostics for debugging edge cases.

**Key Achievements:**
- ✅ 15+ selector strategies for maximum compatibility
- ✅ 4 navigation detection methods for robust transitions  
- ✅ 7 detailed status codes for precise error handling
- ✅ Complete integration with concurrent testing infrastructure
- ✅ Comprehensive test suite validating all functionality
- ✅ Backward compatible with existing test infrastructure

This implementation successfully addresses all acceptance criteria for Issue #40 and provides a solid foundation for reliable FoundryVTT testing automation.