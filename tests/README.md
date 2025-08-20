# Simulacrum FoundryVTT Testing Infrastructure

## ACTUAL FUCKING WORKFLOW (So Claude Doesn't Get Confused Again)

The testing infrastructure follows a strict, sequential workflow for both integration testing and manual testing modes:

### Standard Test Flow

1. **License Entry** - Submit FoundryVTT license key
2. **Dialog Closure** - Close any startup dialogs/notices  
3. **System Download** - Download game system (D&D 5e, etc.) - **THIS CAN TAKE SEVERAL MINUTES AND IS EXPECTED BEHAVIOR, NOT A FUCKING PROBLEM**
4. **World Creation** - Create test world with selected system
5. **GM Login** - Authenticate as Gamemaster user
6. **Module Enable** - Enable Simulacrum module (triggers page refresh)
7. **Page Reload Verification** - **CRITICAL STEP** - Verify page fully reloads after module activation
8. **Test Execution** - Either:
   - Run integration tests to verify module functionality
   - OR transition to manual mode (wait for ESC key)
9. **Cleanup** - **MUST ALWAYS HAPPEN REGARDLESS OF SUCCESS OR FAILURE** - Remove Docker containers
   - Remove Docker images if last test run or manual mode

### Critical Requirements

- **Step 3 (System Download)**: Expected to take minutes for hundreds of megabytes - NOT a timeout problem
- **Step 7 (Page Reload Verification)**: Currently timing out - THIS IS THE ACTUAL ISSUE  
- **Step 9 (Cleanup)**: MUST execute even if previous steps fail - Currently broken because cleanup code isn't reached

### Current Broken Behavior

1. **Page reload verification timing out** after Simulacrum module activation
2. **Cleanup not executing** when bootstrap fails - violates basic error handling principles
3. **Docker containers orphaned** because cleanup code not reached due to exceptions

### Manual Mode Workflow

Same steps 1-7, then:
8. **Manual Testing** - Display session info, wait indefinitely for ESC key press
9. **User Exit** - ESC key triggers cleanup and exit
10. **Cleanup** - Same cleanup requirements as integration tests

## Architecture Components

- `TestOrchestrator` - Main test coordination 
- `BootstrapRunner` - Handles steps 1-7 (bootstrap process)
- `ContainerManager` - Docker container lifecycle
- `PortManager` - Port allocation/cleanup

## Key Principle

**Bootstrap = Infrastructure Ready, Integration = Functionality Testing**

Bootstrap should only ensure FoundryVTT is loaded and ready for testing. Integration tests handle module validation.

## What Needs To Be Fixed

1. **Find WHY step 7 (page reload verification) is timing out**
2. **Fix cleanup code so it ALWAYS runs regardless of exceptions**
3. **Stop leaving orphaned Docker containers**

The system download taking time is EXPECTED and NOT the problem. The problem is page reload verification and broken cleanup.