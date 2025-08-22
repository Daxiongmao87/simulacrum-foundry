# Testing Quick Reference

## Quick Commands

### **Development (Fast)**
```bash
npm test                    # Run unit tests (fast)
npm run test:watch         # Watch mode for development
npm run console:validate   # Check console prefixes
npm run console:prefix     # Auto-fix console prefixes
```

### **Integration Testing (Medium)**
```bash
npm run test:integration           # Run integration tests
npm run test:integration:debug    # Debug mode with verbose output
npm run test:setup                # Setup test environment
npm run test:cleanup              # Cleanup test artifacts
```

### **Bootstrap Infrastructure (Core)**
```bash
node tests/run-tests.js           # Main test orchestrator
node tests/bootstrap/bootstrap-runner.js  # Bootstrap infrastructure
```

### **Comprehensive Testing (Slow)**
```bash
npm run test:all                  # Run all test categories
npm run test:all:debug           # All tests with debug output
npm run test:performance          # Performance testing
npm run test:security             # Security testing
```

## Test Execution Strategy

### **Pre-Commit (Fast)**
- ✅ Unit tests
- ✅ Code quality (ESLint, Prettier)
- ✅ Console validation
- ❌ Integration tests (too slow)

### **CI/CD Pipeline (Medium)**
- ✅ Integration tests
- ✅ Code coverage
- ✅ Dependency checks

### **Nightly Builds (Slow)**
- ✅ Performance tests
- ✅ Security tests
- ✅ Full test suite

## Debug Mode

### **Environment Variable**
```bash
DEBUG=true npm run test:integration
```

### **Command Line Flag**
```bash
npm run test:integration -- --debug
```

### **What Debug Mode Shows**
- ✅ Verbose logging
- ✅ Container setup details
- ✅ Step-by-step progress
- ✅ Error details

## Test Categories

### **Functional Tests**
- **Unit**: Individual functions (Jest)
- **Integration**: Multiple components (Docker + Puppeteer)
- **E2E**: Complete workflows (Puppeteer)

### **Infrastructure**
- **Bootstrap**: Core test environment setup (FoundryVTT + Docker)
- **Version Management**: Multi-version FoundryVTT support
- **UI Automation**: Version-specific UI handling

### **Non-Functional Tests**
- **Performance**: Load, memory, response time
- **Security**: Vulnerabilities, data exposure
- **Quality**: Code standards, complexity

## Common Issues

### **Console Prefix Validation Fails**
```bash
npm run console:prefix    # Auto-fix prefixes
npm run console:validate  # Verify fixes
```

### **Integration Tests Timeout**
- Check Docker is running
- Verify ports are available
- Use `--debug` flag for verbose output

### **Cleanup Issues**
```bash
npm run test:cleanup      # Manual cleanup
docker system prune       # Docker cleanup
```

## File Structure

```
tests/
├── bootstrap/            # Core test infrastructure
│   ├── bootstrap-runner.js     # Main orchestrator
│   ├── v12/                    # v12-specific UI automation
│   ├── v13/                    # v13-specific UI automation
│   └── common/                 # Shared utilities
├── integration/          # Integration tests
├── helpers/             # Test utilities and mocks
├── config/              # Test configuration
├── fixtures/            # Test data
└── README.md            # Detailed documentation
```

## Best Practices

1. **Write unit tests** for individual functions
2. **Use integration tests** for component interactions
3. **Enable debug mode** when troubleshooting
4. **Always run cleanup** after testing
5. **Check console prefixes** before committing

## Need Help?

- **Detailed docs**: `docs/testing-strategy.md`
- **Test workflow**: `tests/README.md`
- **Bootstrap architecture**: `tests/README.md#bootstrap-infrastructure-development`
- **Console issues**: `npm run console:validate`
- **Debug mode**: `npm run test:integration -- --debug`
