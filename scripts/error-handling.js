/**
 * Comprehensive Error Handling System for Simulacrum
 */

export class SimulacrumError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', severity = 'error', context = {}) {
    super(message);
    this.name = 'SimulacrumError';
    this.code = code;
    this.severity = severity; // 'info', 'warning', 'error', 'critical'
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Convert technical error to user-friendly message
   */
  toUserMessage() {
    const userMessages = {
      'AI_SERVICE_UNAVAILABLE': 'AI service is currently unavailable. You can still use tools manually.',
      'PERMISSION_DENIED': 'You don\'t have permission for this action. Contact your GM for access.',
      'DOCUMENT_NOT_FOUND': 'The requested document could not be found. It may have been deleted or moved.',
      'TOOL_EXECUTION_FAILED': 'Tool execution failed. Please check your input and try again.',
      'NETWORK_ERROR': 'Network connection issue. Please check your connection and try again.',
      'INVALID_PARAMETERS': 'Invalid parameters provided. Please check your input.',
      'RATE_LIMIT_EXCEEDED': 'Too many requests. Please wait a moment and try again.',
      'AUTHENTICATION_FAILED': 'Authentication failed. Please check your API key configuration.'
    };

    return userMessages[this.code] || this.message;
  }

  /**
   * Get appropriate UI notification type
   */
  getNotificationType() {
    const typeMap = {
      'info': 'info',
      'warning': 'warn', 
      'error': 'error',
      'critical': 'error'
    };
    return typeMap[this.severity] || 'error';
  }
}

export class ErrorRecoveryManager {
  constructor() {
    this.retryAttempts = new Map();
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 10000; // 10 seconds
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry(operation, context = {}) {
    const operationId = context.operationId || 'anonymous';
    let attempt = 0;
    
    while (attempt < this.maxRetries) {
      try {
        const result = await operation();
        // Reset retry count on success
        this.retryAttempts.delete(operationId);
        return result;
        
      } catch (error) {
        attempt++;
        console.warn(`Operation ${operationId} failed, attempt ${attempt}:`, error);
        
        if (attempt >= this.maxRetries) {
          throw new SimulacrumError(
            `Operation failed after ${this.maxRetries} attempts: ${error.message}`,
            'MAX_RETRIES_EXCEEDED',
            'error',
            { originalError: error, attempts: attempt }
          );
        }
        
        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = Math.min(
          this.baseDelay * Math.pow(2, attempt - 1),
          this.maxDelay
        );
        const jitter = Math.random() * 0.1 * delay;
        
        await this.sleep(delay + jitter);
      }
    }
  }

  /**
   * Check if error should not be retried
   */
  isNonRetryableError(error) {
    const nonRetryableCodes = [
      'PERMISSION_DENIED',
      'AUTHENTICATION_FAILED', 
      'INVALID_PARAMETERS',
      'DOCUMENT_NOT_FOUND'
    ];
    
    return error.code && nonRetryableCodes.includes(error.code);
  }

  /**
   * Handle critical errors that require system-level response
   */
  handleCriticalError(error) {
    console.error('Critical error detected:', error);
    
    // Notify user
    ui.notifications.error(
      `Critical system error: ${error.toUserMessage()}. Please refresh the page if issues persist.`
    );
    
    // Attempt graceful degradation
    this.activateSafeMode();
  }

  /**
   * Activate safe mode with limited functionality
   */
  activateSafeMode() {
    console.warn('Activating Simulacrum safe mode');
    
    // Disable AI service
    if (game.simulacrum?.aiService) {
      game.simulacrum.aiService = null;
    }
    
    // Show safe mode indicator
    ui.notifications.warn(
      'Simulacrum is running in safe mode. Some features may be unavailable.'
    );
  }

  /**
   * Utility function for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class ErrorLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.debugMode = false;
  }

  /**
   * Log error with context
   */
  logError(error, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        severity: error.severity,
        stack: error.stack
      },
      context: {
        ...context,
        user: game.user?.id,
        world: game.world?.id,
        system: game.system?.id
      }
    };

    // Remove sensitive information
    this.sanitizeLogEntry(logEntry);
    
    this.logs.push(logEntry);
    
    // Maintain log size
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Console output based on severity
    this.outputToConsole(logEntry);
  }

  /**
   * Remove sensitive data from log entries
   */
  sanitizeLogEntry(logEntry) {
    const sensitiveFields = ['apiKey', 'token', 'password', 'secret'];
    
    function sanitizeObject(obj) {
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
          if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
            obj[key] = '[REDACTED]';
          } else if (typeof obj[key] === 'object') {
            sanitizeObject(obj[key]);
          }
        });
      }
    }
    
    sanitizeObject(logEntry);
  }

  /**
   * Output log entry to console based on severity
   */
  outputToConsole(logEntry) {
    const { error, context } = logEntry;
    const message = `Simulacrum [${error.severity}]: ${error.message}`;
    
    switch (error.severity) {
      case 'critical':
        console.error(message, { error, context });
        break;
      case 'error':
        console.error(message, { error, context });
        break;
      case 'warning':
        console.warn(message, { error, context });
        break;
      case 'info':
        console.info(message, { error, context });
        break;
      default:
        if (this.debugMode) {
          console.debug(message, { error, context });
        }
    }
  }

  /**
   * Get recent logs for debugging
   */
  getRecentLogs(count = 50) {
    return this.logs.slice(-count);
  }

  /**
   * Export logs for debugging
   */
  exportLogs() {
    const logsData = {
      exportDate: new Date().toISOString(),
      version: game.modules.get('simulacrum')?.version || 'unknown',
      logs: this.logs
    };
    
    const blob = new Blob([JSON.stringify(logsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulacrum-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Global error handling setup
export function setupGlobalErrorHandling() {
  const errorLogger = new ErrorLogger();
  const recoveryManager = new ErrorRecoveryManager();
  
  // Global error handler
  window.addEventListener('error', (event) => {
    const error = new SimulacrumError(
      event.message || 'Unknown JavaScript error',
      'JAVASCRIPT_ERROR',
      'error',
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      }
    );
    
    errorLogger.logError(error);
  });
  
  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    const error = new SimulacrumError(
      event.reason?.message || 'Unhandled promise rejection',
      'PROMISE_REJECTION',
      'error',
      { reason: event.reason }
    );
    
    errorLogger.logError(error);
  });
  
  // Make error handling globally accessible
  game.simulacrum = game.simulacrum || {};
  game.simulacrum.errorLogger = errorLogger;
  game.simulacrum.recoveryManager = recoveryManager;
}

// Initialize global error handling when module loads
if (typeof game !== 'undefined') {
  Hooks.once('init', setupGlobalErrorHandling);
}