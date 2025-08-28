/**
 * Centralized Logging System for Simulacrum
 *
 * Provides debug-controlled logging with automatic prefixing and integration
 * with the existing error handling infrastructure.
 *
 * Debug mode controlled by window.DEBUG variable:
 * - Set window.DEBUG = true in browser console to enable debug logging
 * - Set window.DEBUG = false to disable debug logging
 */

export class SimulacrumLogger {
  constructor() {
    this.prefix = 'Simulacrum | ';
    this.debugPrefix = 'Simulacrum | [Debug] ';
    this._errorLogger = null; // Will be set during initialization
  }

  /**
   * Initialize the logger with error logger
   * @param {ErrorLogger} errorLogger - The existing error logger instance
   */
  initialize(errorLogger = null) {
    this._errorLogger = errorLogger;
  }

  /**
   * Connect an error logger after initialization
   * @param {ErrorLogger} errorLogger - The error logger instance
   */
  connectErrorLogger(errorLogger) {
    this._errorLogger = errorLogger;
    this.debug('Error logger connected to main logger');
  }

  /**
   * Check if debug mode is enabled
   * @returns {boolean}
   */
  get isDebugMode() {
    return typeof window !== 'undefined' && window.DEBUG === true;
  }

  /**
   * Debug level logging - only shows when debug mode is enabled
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  debug(message, ...args) {
    if (this.isDebugMode) {
      // eslint-disable-next-line no-console
      console.log(this.debugPrefix + message, ...args);
    }
  }

  /**
   * Info level logging - always shows
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  info(message, ...args) {
    // eslint-disable-next-line no-console
    console.info(this.prefix + message, ...args);
  }

  /**
   * Warning level logging - always shows
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  warn(message, ...args) {
    console.warn(this.prefix + message, ...args);
  }

  /**
   * Error level logging - always shows and integrates with error logger
   * @param {string} message - The message to log
   * @param {Error|any} error - Optional error object
   * @param {...any} args - Additional arguments to log
   */
  error(message, error = null, ...args) {
    console.error(this.prefix + message, error || '', ...args);

    // Log to error logger if available
    if (this._errorLogger && error) {
      this._errorLogger.logError(error, {
        message,
        context: 'logger',
        additionalArgs: args,
      });
    }
  }

  /**
   * General log method - treated as debug (only shows in debug mode)
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  log(message, ...args) {
    this.debug(message, ...args);
  }

  /**
   * Log method with explicit level
   * @param {string} level - Log level: 'debug', 'info', 'warn', 'error'
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  logWithLevel(level, message, ...args) {
    switch (level) {
      case 'debug':
        this.debug(message, ...args);
        break;
      case 'info':
        this.info(message, ...args);
        break;
      case 'warn':
        this.warn(message, ...args);
        break;
      case 'error':
        this.error(message, null, ...args);
        break;
      default:
        this.debug(message, ...args);
    }
  }
}

/**
 * Create and return a global logger instance
 * This will be initialized in main.js
 */
export const logger = new SimulacrumLogger();

/**
 * Initialize the global logger
 * Called from main.js during module initialization
 */
export function initializeLogger(errorLogger = null) {
  logger.initialize(errorLogger);
  return logger;
}
