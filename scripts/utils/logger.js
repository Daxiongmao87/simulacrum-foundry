/**
 * Centralized logging utility for Simulacrum module
 * Replaces console statements with controlled logging
 */

export class Logger {
  /**
   * Log levels for filtering messages
   * @readonly
   * @enum {number}
   */
  static LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
  };

  /**
   * Create logger instance
   * @param {string} component - Component name for prefixing
   * @param {number} level - Minimum log level to output
   */
  constructor(component, level = Logger.LEVELS.INFO) {
    this.component = component;
    this.level = level;
    this.prefix = `[Simulacrum:${component}]`;
  }

  /**
   * Check if debug logging is enabled via CONFIG.debug.simulacrum
   * @returns {boolean} True if debug logging is enabled
   */
  static isDebugEnabled() {
    try {
      return globalThis.CONFIG?.debug?.simulacrum === true;
    } catch {
      return false;
    }
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {...any} args - Additional arguments
   */
  error(message, ...args) {
    if (this.level >= Logger.LEVELS.ERROR) {
      // eslint-disable-next-line no-console
      console.error(this.prefix, message, ...args);
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {...any} args - Additional arguments
   */
  warn(message, ...args) {
    if (this.level >= Logger.LEVELS.WARN) {
      // eslint-disable-next-line no-console
      console.warn(this.prefix, message, ...args);
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {...any} args - Additional arguments
   */
  info(message, ...args) {
    if (this.level >= Logger.LEVELS.INFO) {
      // eslint-disable-next-line no-console
      console.log(this.prefix, message, ...args);
    }
  }

  /**
   * Log debug message (only if CONFIG.debug.simulacrum is true)
   * @param {string} message - Debug message
   * @param {...any} args - Additional arguments
   */
  debug(message, ...args) {
    if (this.level >= Logger.LEVELS.DEBUG && Logger.isDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.log(this.prefix, message, ...args);
    }
  }
}

/**
 * Create logger for component
 * @param {string} component - Component name
 * @param {number} level - Log level
 * @returns {Logger} Logger instance
 */
export function createLogger(component, level = Logger.LEVELS.INFO) {
  return new Logger(component, level);
}

export default Logger;
export function isDebugEnabled() {
  return Logger.isDebugEnabled();
}
