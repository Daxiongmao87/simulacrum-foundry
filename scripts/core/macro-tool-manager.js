/**
 * Macro Tool Manager
 * 
 * Manages "Tool Macros" - macros that are exposed as first-class AI tools.
 * Handles discovery by parsing a `const tool` configuration object within the macro code.
 * 
 * Scans ALL macros (World + compendiums) for valid tool configs with enabled:true.
 * Hooks into macro create/update/delete for live updates.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('MacroToolManager');

/**
 * MacroToolManager class
 * Manages the registry of Tool Macros and their integration with the AI.
 */
export class MacroToolManager {
    /**
     * @param {ToolRegistry} [toolRegistry] - Optional reference to main tool registry for integration
     */
    constructor(toolRegistry = null) {
        this.tools = new Map(); // Map<toolName, toolDefinition>
        this.toolRegistry = toolRegistry;
    }

    /**
     * Initialize the manager
     */
    async initialize() {
        this.registerHooks();
        await this.refreshTools();
        logger.info('MacroToolManager initialized');
    }

    /**
     * Register hooks for live macro updates
     */
    registerHooks() {
        // Hook into macro lifecycle for live updates
        Hooks.on('createMacro', () => this.refreshTools());
        Hooks.on('updateMacro', () => this.refreshTools());
        Hooks.on('deleteMacro', () => this.refreshTools());

        logger.debug('Macro lifecycle hooks registered');
    }

    /**
     * Refresh the tool registry by scanning ALL macros (World + compendiums)
     */
    async refreshTools() {
        const newTools = new Map();

        // 1. Scan World macros
        if (game.macros) {
            for (const macro of game.macros) {
                const config = this._parseToolConfig(macro.command);
                if (config) {
                    this._registerTool(macro, config, newTools);
                }
            }
        }

        // 2. Scan all Macro-type compendiums
        for (const pack of game.packs) {
            if (pack.documentName !== 'Macro') continue;

            try {
                const docs = await pack.getDocuments();
                for (const macro of docs) {
                    const config = this._parseToolConfig(macro.command);
                    if (config) {
                        this._registerTool(macro, config, newTools);
                    }
                }
            } catch (e) {
                logger.debug(`Could not scan pack ${pack.collection}: ${e.message}`);
            }
        }

        this.tools = newTools;
        logger.debug(`Refreshed tools. Found ${this.tools.size} enabled macro tools.`);
    }

    /**
     * Extract the 'tool' configuration object from macro code.
     * Uses a balanced-brace extraction approach to handle nested objects.
     * @param {string} command - Macro source code
     * @returns {Object|null} - Configuration object or null if not found
     */
    _parseToolConfig(command) {
        if (!command) return null;

        // Find the start of 'const tool = {'
        const startMatch = command.match(/const\s+tool\s*=\s*\{/);
        if (!startMatch) return null;

        const startIndex = startMatch.index + startMatch[0].length - 1; // Position of '{'

        // Find the matching closing brace using balanced counting
        let braceCount = 0;
        let endIndex = -1;

        for (let i = startIndex; i < command.length; i++) {
            const char = command[i];
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    endIndex = i;
                    break;
                }
            }
        }

        if (endIndex === -1) {
            return null; // Unbalanced braces - skip silently
        }

        // Extract the object string including braces
        const objectString = command.substring(startIndex, endIndex + 1);

        try {
            // Evaluate the object definition as JavaScript
            const parseFn = new Function(`return ${objectString};`);
            const config = parseFn();

            // Basic validation
            if (!config.name || !config.description || !config.parameters) {
                return null;
            }
            return config;
        } catch (e) {
            return null; // Parse error - skip silently
        }
    }

    /**
     * Register a macro as a tool
     * @param {Macro} macro 
     * @param {Object} config 
     * @param {Map} toolMap 
     */
    _registerTool(macro, config, toolMap) {
        // Check enabled flag - must be explicitly set to true to register (default: disabled)
        if (config.enabled !== true) {
            return; // Skip silently - not enabled
        }

        const toolName = config.name;

        const toolDef = {
            name: toolName,
            description: config.description,
            parameters: config.parameters,
            schema: config.parameters,
            execute: async (args) => {
                const errors = this._validateSchema(args, config.parameters);
                if (errors.length > 0) throw new Error(`Validation: ${errors.join(', ')}`);
                return await macro.execute({ args });
            },
            originalName: macro.name,
            uuid: macro.uuid,
            isMacroTool: true
        };

        if (toolMap.has(toolName)) {
            logger.warn(`Duplicate tool name '${toolName}' in ${macro.name}. Overwriting.`);
        }
        toolMap.set(toolName, toolDef);

        // Integrate with main toolRegistry if available
        if (this.toolRegistry) {
            try {
                const existing = this.toolRegistry.getTool(toolName);
                if (existing) {
                    try {
                        this.toolRegistry.unregisterTool(toolName);
                    } catch (unregErr) {
                        // Ignore
                    }
                }

                this.toolRegistry.registerTool(toolDef, {
                    category: 'macro',
                    description: config.description,
                    tags: ['macro', 'custom']
                });
            } catch (regErr) {
                logger.debug(`Could not register '${toolName}' with toolRegistry: ${regErr.message}`);
            }
        }
    }

    /**
     * Basic JSON Schema validation
     */
    _validateSchema(args, schema) {
        const errors = [];
        if (!schema || !schema.required) return errors;
        for (const req of schema.required) {
            if (args[req] === undefined) errors.push(`Missing '${req}'`);
        }
        return errors;
    }

    getTools() {
        return Array.from(this.tools.values());
    }

    getToolSchemas() {
        return this.getTools().map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
    }
}
