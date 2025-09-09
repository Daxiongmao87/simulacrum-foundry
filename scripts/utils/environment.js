/**
 * Environment Detection Utilities
 * Checks for FoundryVTT and other required environment objects
 */

/**
 * Check if the FoundryVTT execution environment is available
 * @returns {boolean} True if FoundryVTT environment is available
 */
export function isFoundryEnvironmentAvailable() {
  try {
    // Check for core FoundryVTT global objects - that's all we need
    const hasGame = typeof game !== 'undefined' && game !== null;
    const hasConfig = typeof CONFIG !== 'undefined' && CONFIG !== null;
    
    const result = hasGame && hasConfig;
    console.log('[Simulacrum:Environment] FoundryVTT environment check:', {
      hasGame,
      hasConfig,
      result
    });
    
    return result;
  } catch (error) {
    // If we can't even check these variables, environment is not available
    console.log('[Simulacrum:Environment] Environment check threw error:', error.message);
    return false;
  }
}

/**
 * Check if we're in a browser environment (vs Node.js test environment)
 * @returns {boolean} True if running in browser
 */
export function isBrowserEnvironment() {
  try {
    return typeof window !== 'undefined' && 
           typeof document !== 'undefined';
  } catch (error) {
    return false;
  }
}

/**
 * Check if we're in a test environment
 * @returns {boolean} True if running in Jest/test environment
 */
export function isTestEnvironment() {
  try {
    return typeof process !== 'undefined' && 
           process?.env?.NODE_ENV === 'test' ||
           typeof jest !== 'undefined';
  } catch (error) {
    return false;
  }
}

/**
 * Comprehensive environment check for tool execution capability
 * @returns {Object} Environment status with details
 */
export function checkToolExecutionEnvironment() {
  const foundryAvailable = isFoundryEnvironmentAvailable();
  const browserEnv = isBrowserEnvironment();
  const testEnv = isTestEnvironment();
  
  const canExecute = foundryAvailable && (browserEnv || testEnv);
  const reason = !foundryAvailable ? 'FoundryVTT environment not available' :
          !(browserEnv || testEnv) ? 'Not in browser or test environment' :
          'Environment suitable for tool execution';
  
  const result = {
    canExecuteTools: canExecute,
    foundryAvailable,
    browserEnv,
    testEnv,
    reason
  };
  
  console.log('[Simulacrum:Environment] Tool execution environment check:', result);
  
  return result;
}