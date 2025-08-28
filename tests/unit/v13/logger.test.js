/**
 * @file tests/unit/v13/logger.test.js
 * @description Unit tests for SimulacrumLogger class (FoundryVTT v13)
 */

import { jest } from '@jest/globals';
import { SimulacrumLogger, initializeLogger } from '../../../scripts/core/logger.js';

describe('SimulacrumLogger v13', () => {
  let logger;
  let mockErrorLogger;
  let consoleSpy;

  beforeEach(() => {
    // Mock window object for browser environment
    global.window = { DEBUG: false };
    
    // Mock error logger
    mockErrorLogger = {
      logError: jest.fn()
    };

    // Create logger instance
    logger = new SimulacrumLogger();
    
    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      info: jest.spyOn(console, 'info').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    // Restore console methods
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
    
    // Clean up globals
    delete global.window;
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with correct prefixes', () => {
      expect(logger.prefix).toBe('Simulacrum | ');
      expect(logger.debugPrefix).toBe('Simulacrum | [Debug] ');
      expect(logger._errorLogger).toBeNull();
    });
  });

  describe('isDebugMode', () => {
    test('should return false when window.DEBUG is false', () => {
      global.window.DEBUG = false;
      expect(logger.isDebugMode).toBe(false);
    });

    test('should return true when window.DEBUG is true', () => {
      global.window.DEBUG = true;
      expect(logger.isDebugMode).toBe(true);
    });

    test('should return false when window.DEBUG is undefined', () => {
      delete global.window.DEBUG;
      expect(logger.isDebugMode).toBe(false);
    });

    test('should return false when window is undefined', () => {
      delete global.window;
      expect(logger.isDebugMode).toBe(false);
    });
  });

  describe('debug method', () => {
    test('should log debug message when DEBUG is true', () => {
      global.window.DEBUG = true;
      logger.debug('Test debug message', { test: 'data' });
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Simulacrum | [Debug] Test debug message',
        { test: 'data' }
      );
    });

    test('should not log debug message when DEBUG is false', () => {
      global.window.DEBUG = false;
      logger.debug('Test debug message', { test: 'data' });
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    test('should not log debug message when DEBUG is undefined', () => {
      delete global.window.DEBUG;
      logger.debug('Test debug message');
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('info method', () => {
    test('should always log info messages with correct prefix', () => {
      logger.info('Test info message', { data: 'test' });
      
      expect(consoleSpy.info).toHaveBeenCalledWith(
        'Simulacrum | Test info message',
        { data: 'test' }
      );
    });

    test('should log info regardless of DEBUG setting', () => {
      global.window.DEBUG = false;
      logger.info('Test info message');
      
      expect(consoleSpy.info).toHaveBeenCalledWith('Simulacrum | Test info message');
    });
  });

  describe('warn method', () => {
    test('should always log warning messages with correct prefix', () => {
      logger.warn('Test warning message', { warning: 'data' });
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'Simulacrum | Test warning message',
        { warning: 'data' }
      );
    });

    test('should log warnings regardless of DEBUG setting', () => {
      global.window.DEBUG = false;
      logger.warn('Test warning message');
      
      expect(consoleSpy.warn).toHaveBeenCalledWith('Simulacrum | Test warning message');
    });
  });

  describe('error method', () => {
    test('should always log error messages with correct prefix', () => {
      const testError = new Error('Test error');
      logger.error('Test error message', testError, { extra: 'data' });
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Simulacrum | Test error message',
        testError,
        { extra: 'data' }
      );
    });

    test('should log errors regardless of DEBUG setting', () => {
      global.window.DEBUG = false;
      logger.error('Test error message');
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Simulacrum | Test error message',
        ''
      );
    });

    test('should integrate with error logger when available', () => {
      logger.connectErrorLogger(mockErrorLogger);
      const testError = new Error('Test error');
      
      logger.error('Test error message', testError, { context: 'test' });
      
      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        testError,
        {
          message: 'Test error message',
          context: 'logger',
          additionalArgs: [{ context: 'test' }]
        }
      );
    });

    test('should not call error logger when no error object provided', () => {
      logger.connectErrorLogger(mockErrorLogger);
      
      logger.error('Test error message without error object');
      
      expect(mockErrorLogger.logError).not.toHaveBeenCalled();
    });
  });

  describe('log method', () => {
    test('should behave like debug method', () => {
      global.window.DEBUG = true;
      logger.log('Test log message', { test: 'data' });
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Simulacrum | [Debug] Test log message',
        { test: 'data' }
      );
    });

    test('should not log when DEBUG is false', () => {
      global.window.DEBUG = false;
      logger.log('Test log message');
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('logWithLevel method', () => {
    test('should route to debug method for debug level', () => {
      global.window.DEBUG = true;
      logger.logWithLevel('debug', 'Test debug message', { data: 'test' });
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Simulacrum | [Debug] Test debug message',
        { data: 'test' }
      );
    });

    test('should route to info method for info level', () => {
      logger.logWithLevel('info', 'Test info message', { data: 'test' });
      
      expect(consoleSpy.info).toHaveBeenCalledWith(
        'Simulacrum | Test info message',
        { data: 'test' }
      );
    });

    test('should route to warn method for warn level', () => {
      logger.logWithLevel('warn', 'Test warn message', { data: 'test' });
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'Simulacrum | Test warn message',
        { data: 'test' }
      );
    });

    test('should route to error method for error level', () => {
      logger.logWithLevel('error', 'Test error message', { data: 'test' });
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        'Simulacrum | Test error message',
        '',
        { data: 'test' }
      );
    });

    test('should default to debug for unknown levels', () => {
      global.window.DEBUG = true;
      logger.logWithLevel('unknown', 'Test unknown message', { data: 'test' });
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Simulacrum | [Debug] Test unknown message',
        { data: 'test' }
      );
    });
  });

  describe('Error Logger Integration', () => {
    test('initialize should accept error logger', () => {
      logger.initialize(mockErrorLogger);
      expect(logger._errorLogger).toBe(mockErrorLogger);
    });

    test('connectErrorLogger should set error logger and log debug message', () => {
      global.window.DEBUG = true;
      logger.connectErrorLogger(mockErrorLogger);
      
      expect(logger._errorLogger).toBe(mockErrorLogger);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Simulacrum | [Debug] Error logger connected to main logger'
      );
    });

    test('connectErrorLogger should not log debug when DEBUG is false', () => {
      global.window.DEBUG = false;
      logger.connectErrorLogger(mockErrorLogger);
      
      expect(logger._errorLogger).toBe(mockErrorLogger);
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });
});

describe('initializeLogger function', () => {
  let mockErrorLogger;

  beforeEach(() => {
    mockErrorLogger = {
      logError: jest.fn()
    };
  });

  test('should return logger instance', () => {
    const result = initializeLogger();
    expect(result).toBeInstanceOf(SimulacrumLogger);
  });

  test('should initialize with error logger when provided', () => {
    const result = initializeLogger(mockErrorLogger);
    expect(result._errorLogger).toBe(mockErrorLogger);
  });

  test('should initialize without error logger when not provided', () => {
    const result = initializeLogger();
    expect(result._errorLogger).toBeNull();
  });
});