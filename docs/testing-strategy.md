# Simulacrum Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for the Simulacrum FoundryVTT module, covering test categories, execution strategies, and implementation details.

## Testing Philosophy

### **Quality vs Speed Balance**
- **Fast feedback** for developers (pre-commit)
- **Comprehensive validation** for releases (CI/CD + nightly)
- **No blocking** of developer productivity
- **Catch issues early** in the development cycle

### **Test Pyramid**
```
    /\
   /  \     E2E Tests (Few, Slow)
  /____\    Integration Tests (Some, Medium)
 /______\   Unit Tests (Many, Fast)
```

## Test Categories

### **Functional Tests (What the system DOES)**

#### **Unit Tests**
- **Scope**: Individual functions, methods, and modules
- **Dependencies**: Mocked external dependencies
- **Execution**: Fast (milliseconds)
- **Framework**: Jest
- **Examples**:
  - `calculateDamage()` function logic
  - `validateSettings()` input validation
  - `parseUserInput()` string processing

#### **Integration Tests**
- **Scope**: Multiple components working together
- **Dependencies**: Real external systems (FoundryVTT, Docker)
- **Execution**: Medium (seconds to minutes)
- **Framework**: Custom test runner + Puppeteer
- **Examples**:
  - Module initialization in FoundryVTT
  - Database operations with real data
  - API endpoint testing

#### **End-to-End Tests**
- **Scope**: Complete user workflows
- **Dependencies**: Full system stack
- **Execution**: Slow (minutes)
- **Framework**: Puppeteer + Docker
- **Examples**:
  - Complete user registration flow
  - Full combat sequence
  - Module configuration workflow

### **Non-Functional Tests (Technical/Performance)**

#### **Performance Tests**
- **Load Testing**: Concurrent user simulation
- **Memory Testing**: Memory leak detection
- **Response Time**: API performance validation
- **Resource Usage**: CPU, memory, disk I/O

#### **Security Tests**
- **Vulnerability Scanning**: Dependency checks
- **Data Exposure**: Sensitive information leaks
- **Access Control**: Permission validation
- **Input Validation**: Malicious input handling

#### **Code Quality Tests**
- **Complexity Analysis**: Cyclomatic complexity
- **Maintainability**: Code structure metrics
- **Standards Compliance**: ESLint, Prettier
- **Documentation**: API documentation coverage

## Execution Strategy

### **Pre-Commit Hooks (Fast & Local)**

**Purpose**: Catch basic issues before commit without blocking developer productivity

**What Runs**:
- ✅ **Unit Tests** (`npm test`) - Fast execution (milliseconds)
- ✅ **Code Quality** - ESLint, Prettier, security scans
- ✅ **Console Validation** - Prefix consistency, no sensitive data
- ✅ **Type Checking** - TypeScript/Flow validation (if applicable)

**What Does NOT Run**:
- ❌ Integration tests (too slow)
- ❌ Performance tests (too slow)
- ❌ Browser tests (needs Docker)
- ❌ Database tests (needs infrastructure)

**Execution Time**: < 30 seconds
**Goal**: Developer productivity + basic quality

### **CI/CD Pipeline (Quality Gate)**

**Purpose**: Ensure code quality and catch integration issues

**What Runs**:
- ✅ **Integration Tests** (`npm run test:integration`) - Docker + Puppeteer
- ✅ **Code Coverage** - Test coverage reports
- ✅ **Dependency Checks** - Security vulnerabilities
- ✅ **Build Validation** - Module packaging

**Execution Time**: 5-15 minutes
**Goal**: Quality gate for pull requests

### **Nightly Builds (Comprehensive)**

**Purpose**: Long-term system health and performance monitoring

**What Runs**:
- ✅ **Performance Tests** (`npm run test:performance`) - Load testing, memory leaks
- ✅ **Security Tests** (`npm run test:security`) - Penetration testing, compliance
- ✅ **Full Test Suite** (`npm run test:all`) - All test categories
- ✅ **Long-Running Tests** - Stress testing, stability

**Execution Time**: 30+ minutes
**Goal**: Long-term health monitoring

## Implementation Details

### **Test Infrastructure**

#### **Unit Tests (Jest)**
```bash
# Fast execution, local development
npm test                    # Run all unit tests
npm run test:watch         # Watch mode for development
npm run test:coverage      # Coverage reports
```

#### **Integration Tests (Docker + Puppeteer)**
```bash
# Medium execution, CI/CD pipeline
npm run test:integration           # Run integration tests
npm run test:integration:debug    # Debug mode with verbose output
npm run test:setup                # Setup test environment
npm run test:cleanup              # Cleanup test artifacts
```

#### **Bootstrap Infrastructure (Core Test Engine)**
```bash
# Core infrastructure for setting up test environments
node tests/run-tests.js           # Main test orchestrator
node tests/bootstrap/bootstrap-runner.js  # Bootstrap infrastructure
```

**Bootstrap Infrastructure**: The core engine that creates live FoundryVTT sessions for testing. It handles:
- **Version Compatibility**: Manages FoundryVTT v12/v13 differences
- **Docker Orchestration**: Builds and runs test containers
- **Session Management**: Creates authenticated GM sessions
- **UI Automation**: Handles license, EULA, system installation

#### **Smoke Tests (Quick Validation)**

Use smoke tests to quickly validate that infrastructure changes didn’t break the basics.

When to run:
- After modifying bootstrap or common utilities
- Before longer integration runs

Commands:
```bash
# Build/run container(s), print info, wait for ESC to cleanup
node tests/run-tests.js --container-only -v v13

# Complete bootstrap to a live session and wait for ESC
node tests/run-tests.js --manual -v v13
```

Checklist:
- Image builds successfully (no Dockerfile errors)
- Container becomes ready (HTTP 302 on printed URL)
- URL opens; GM login works if prompted
- World loads; basic UI appears
- Pressing ESC stops the session and cleans up container/image

#### **Performance Tests (Custom)**
```bash
# Slow execution, nightly builds
npm run test:performance          # Load testing
npm run test:memory              # Memory leak detection
npm run test:stress              # Stress testing
```

### **Test Data Management**

#### **Fixtures**
- **Static Data**: Test configurations, mock responses
- **Dynamic Data**: Generated test data, randomized inputs
- **Sensitive Data**: Never committed, environment-specific

#### **Test Environment**
- **Docker Containers**: Isolated FoundryVTT instances
- **Port Management**: Dynamic port allocation
- **Resource Cleanup**: Automatic cleanup on completion/failure
- **Version Management**: Multi-version FoundryVTT support (v12, v13)
- **UI Automation**: Version-specific UI handling for different FoundryVTT versions

### **Debugging & Troubleshooting**

#### **Debug Mode**
```bash
# Enable verbose logging
DEBUG=true npm run test:integration
npm run test:integration -- --debug
```

#### **Manual Testing Mode**
```bash
# Interactive testing for debugging
npm run test:manual
```

## Future Enhancements

### **Test Categories to Add**

#### **Smoke Tests**
- **Purpose**: Basic functionality verification
- **Scope**: Critical user paths
- **Execution**: Very fast (< 1 minute)
- **Use Case**: Pre-deployment validation

#### **Regression Tests**
- **Purpose**: Catch previously fixed bugs
- **Scope**: Known failure scenarios
- **Execution**: Medium speed
- **Use Case**: Release validation

#### **Accessibility Tests**
- **Purpose**: Ensure usability for all users
- **Scope**: UI components, navigation
- **Execution**: Medium speed
- **Use Case**: Compliance requirements

### **Infrastructure Improvements**

#### **Parallel Execution**
- **Unit Tests**: Parallel execution for faster feedback
- **Integration Tests**: Parallel container execution
- **Performance Tests**: Distributed load testing

#### **Test Reporting**
- **Coverage Reports**: Visual coverage analysis
- **Performance Metrics**: Historical performance tracking
- **Failure Analysis**: Root cause identification

## Best Practices

### **Test Writing**
- **Arrange-Act-Assert**: Clear test structure
- **Descriptive Names**: Test names explain the scenario
- **Isolation**: Tests don't depend on each other
- **Cleanup**: Tests clean up after themselves

### **Test Maintenance**
- **Regular Updates**: Keep tests current with code changes
- **Refactoring**: Improve test structure over time
- **Documentation**: Document complex test scenarios
- **Performance**: Monitor test execution times

### **Continuous Improvement**
- **Metrics Tracking**: Monitor test effectiveness
- **Feedback Loop**: Developer input on test quality
- **Tool Updates**: Keep testing tools current
- **Process Refinement**: Improve testing workflows

## Conclusion

This testing strategy provides a balanced approach to quality assurance:

- **Fast feedback** for developers through pre-commit hooks
- **Quality gates** through CI/CD integration testing
- **Comprehensive validation** through nightly performance and security testing

The strategy evolves with the project, adding new test categories and improving infrastructure as needed.
