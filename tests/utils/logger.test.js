/**
 * Tests for Logger utility
 */
import { Logger, createLogger, isDebugEnabled } from '../../scripts/utils/logger.js';

describe('Logger', () => {
    let originalConsoleLog;
    let originalConsoleWarn;
    let originalConsoleError;
    let mockLog;
    let mockWarn;
    let mockError;

    beforeEach(() => {
        originalConsoleLog = console.log;
        originalConsoleWarn = console.warn;
        originalConsoleError = console.error;
        mockLog = jest.fn();
        mockWarn = jest.fn();
        mockError = jest.fn();
        console.log = mockLog;
        console.warn = mockWarn;
        console.error = mockError;
    });

    afterEach(() => {
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
    });

    describe('LEVELS', () => {
        it('should have correct log level values', () => {
            expect(Logger.LEVELS.ERROR).toBe(0);
            expect(Logger.LEVELS.WARN).toBe(1);
            expect(Logger.LEVELS.INFO).toBe(2);
            expect(Logger.LEVELS.DEBUG).toBe(3);
        });
    });

    describe('constructor', () => {
        it('should create logger with component name', () => {
            const logger = new Logger('TestComponent');
            expect(logger.component).toBe('TestComponent');
            expect(logger.prefix).toBe('[Simulacrum:TestComponent]');
        });

        it('should default to INFO level', () => {
            const logger = new Logger('Test');
            expect(logger.level).toBe(Logger.LEVELS.INFO);
        });

        it('should accept custom log level', () => {
            const logger = new Logger('Test', Logger.LEVELS.DEBUG);
            expect(logger.level).toBe(Logger.LEVELS.DEBUG);
        });
    });

    describe('error', () => {
        it('should log error when level >= ERROR', () => {
            const logger = new Logger('Test', Logger.LEVELS.ERROR);
            logger.error('Error message', { data: 'value' });
            expect(mockError).toHaveBeenCalledWith('[Simulacrum:Test]', 'Error message', { data: 'value' });
        });

        it('should always log errors at any level', () => {
            const logger = new Logger('Test', Logger.LEVELS.DEBUG);
            logger.error('Error message');
            expect(mockError).toHaveBeenCalled();
        });
    });

    describe('warn', () => {
        it('should log warning when level >= WARN', () => {
            const logger = new Logger('Test', Logger.LEVELS.WARN);
            logger.warn('Warning message');
            expect(mockWarn).toHaveBeenCalledWith('[Simulacrum:Test]', 'Warning message');
        });

        it('should not log warning when level < WARN', () => {
            const logger = new Logger('Test', Logger.LEVELS.ERROR);
            logger.warn('Warning message');
            expect(mockWarn).not.toHaveBeenCalled();
        });
    });

    describe('info', () => {
        it('should log info when level >= INFO', () => {
            const logger = new Logger('Test', Logger.LEVELS.INFO);
            logger.info('Info message');
            expect(mockLog).toHaveBeenCalledWith('[Simulacrum:Test]', 'Info message');
        });

        it('should not log info when level < INFO', () => {
            const logger = new Logger('Test', Logger.LEVELS.WARN);
            logger.info('Info message');
            expect(mockLog).not.toHaveBeenCalled();
        });
    });

    describe('debug', () => {
        it('should log debug when level >= DEBUG', () => {
            const logger = new Logger('Test', Logger.LEVELS.DEBUG);
            logger.debug('Debug message');
            expect(mockLog).toHaveBeenCalledWith('[Simulacrum:Test]', 'Debug message');
        });

        it('should not log debug when level < DEBUG', () => {
            const logger = new Logger('Test', Logger.LEVELS.INFO);
            logger.debug('Debug message');
            expect(mockLog).not.toHaveBeenCalled();
        });
    });

    describe('isDebugEnabled', () => {
        let originalCONFIG;

        beforeEach(() => {
            originalCONFIG = globalThis.CONFIG;
        });

        afterEach(() => {
            if (originalCONFIG !== undefined) {
                globalThis.CONFIG = originalCONFIG;
            } else {
                delete globalThis.CONFIG;
            }
        });

        it('should return true when CONFIG.debug.simulacrum is true', () => {
            globalThis.CONFIG = { debug: { simulacrum: true } };
            expect(Logger.isDebugEnabled()).toBe(true);
        });

        it('should return true by default during dev', () => {
            globalThis.CONFIG = {};
            expect(Logger.isDebugEnabled()).toBe(true);
        });

        it('should handle missing CONFIG gracefully', () => {
            delete globalThis.CONFIG;
            expect(() => Logger.isDebugEnabled()).not.toThrow();
        });
    });
});

describe('createLogger', () => {
    it('should create a Logger instance', () => {
        const logger = createLogger('Component');
        expect(logger).toBeInstanceOf(Logger);
        expect(logger.component).toBe('Component');
    });

    it('should create logger with custom level', () => {
        const logger = createLogger('Component', Logger.LEVELS.DEBUG);
        expect(logger.level).toBe(Logger.LEVELS.DEBUG);
    });
});

describe('isDebugEnabled', () => {
    it('should delegate to Logger.isDebugEnabled', () => {
        const result = isDebugEnabled();
        expect(typeof result).toBe('boolean');
    });
});
