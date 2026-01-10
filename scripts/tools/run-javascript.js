/* eslint-disable no-new-func */
import { BaseTool } from './base-tool.js';

/**
 * Tool to execute arbitrary JavaScript code.
 * WARNING: This tool allows full code execution.
 */
export class RunJavascriptTool extends BaseTool {
    constructor() {
        super('run_javascript', 'Executes arbitrary JavaScript code.', {
            type: 'object',
            properties: {
                script: {
                    type: 'string',
                    description:
                        'The JavaScript code to execute. Use `return` to return a value. `console.log` output is captured and returned.',
                },
            },
            required: ['script'],
        });
    }

    /**
     * @param {object} args
     * @param {string} args.script
     * @returns {Promise<any>}
     */
    async execute({ script }) {
        const logs = [];
        const originalConsole = console;

        // Create a proxy console to capture logs
        // We bind to original console methods to ensure they still work in the browser console
        const capturedConsole = {
            log: (...args) => {
                logs.push({ type: 'log', message: args.map(a => String(a)).join(' ') });
                originalConsole.log(...args);
            },
            warn: (...args) => {
                logs.push({ type: 'warn', message: args.map(a => String(a)).join(' ') });
                originalConsole.warn(...args);
            },
            error: (...args) => {
                logs.push({ type: 'error', message: args.map(a => String(a)).join(' ') });
                originalConsole.error(...args);
            },
            info: (...args) => {
                logs.push({ type: 'info', message: args.map(a => String(a)).join(' ') });
                originalConsole.info(...args);
            },
            debug: (...args) => {
                logs.push({ type: 'debug', message: args.map(a => String(a)).join(' ') });
                originalConsole.debug(...args);
            },
        };

        try {
            // Use AsyncFunction
            // We pass 'console' as an argument to shadow the global console within the script scope
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const fn = new AsyncFunction('console', script);

            const result = await fn(capturedConsole);

            return {
                searchResult: result, // Using 'searchResult' key for consistency with generic tool output viewing if applicable, or just result
                result: result,
                logs: logs,
            };
        } catch (err) {
            // We catch the error to return the logs along with the error message
            return {
                error: err.message,
                stack: err.stack,
                logs: logs,
            };
        }
    }
}
