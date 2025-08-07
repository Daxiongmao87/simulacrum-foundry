// scripts/core/agentic-loop-controller.js

import { SimulacrumAIService } from '../chat/ai-service.js';
import { SimulacrumToolScheduler } from './tool-scheduler.js';
import { AgentResponseParser } from './json-response-parser.js';
import { AgenticContext } from './agentic-context.js';

/**
 * Manages the autonomous AI -> Tool -> AI cycle based on continuation state.
 * This controller orchestrates the entire agent workflow, from initial user request
 * through multi-step tool execution to final completion.
 */
export class AgenticLoopController {
    /**
     * @param {SimulacrumAIService} aiService - The AI service instance.
     * @param {SimulacrumToolScheduler} toolScheduler - The tool scheduler instance.
     */
    constructor(aiService, toolScheduler) {
        /**
         * @type {boolean}
         * @private
         */
        this.cancelled = false;

        /**
         * @type {SimulacrumAIService}
         * @private
         */
        this.aiService = aiService;

        /**
         * @type {SimulacrumToolScheduler}
         * @private
         */
        this.toolScheduler = toolScheduler;

        /**
         * @type {AgentResponseParser}
         * @private
         */
        this.responseParser = new AgentResponseParser(this.aiService);

        /**
         * @type {AgenticContext | null}
         * @private
         */
        this.currentContext = null;
    }

    /**
     * Initializes the context for a new user request.
     * @param {string} userMessage - The initial message from the user.
     * @returns {AgenticContext} The initialized context.
     * @private
     */
    initializeContext(userMessage) {
        const context = new AgenticContext();
        context.addUserMessage(userMessage);
        this.currentContext = context;
        return context;
    }

    /**
     * Displays a placeholder message in the UI.
     * @param {string} message - The message to display.
     * @private
     */
    showPlaceholder(message) {
        // TODO: Integrate with actual UI for progress display
        ui.notifications.info(`Simulacrum | ${message}...`);
        console.log(`Simulacrum | Placeholder: ${message}`);
    }

    /**
     * Replaces the current placeholder with a final message.
     * @param {string} message - The final message to display.
     * @private
     */
    replacePlaceholderWithMessage(message) {
        // TODO: Integrate with actual UI to replace placeholder
        ui.notifications.info(`Simulacrum | AI Response: ${message}`);
        console.log(`Simulacrum | AI Response: ${message}`);
    }

    /**
     * Displays a general message in the UI.
     * @param {string} message - The message to display.
     * @private
     */
    showMessage(message) {
        ui.notifications.info(`Simulacrum | ${message}`);
        console.log(`Simulacrum | ${message}`);
    }

    /**
     * Executes a list of tool calls.
     * @param {Array<Object>} toolCalls - An array of tool call objects.
     * @returns {Promise<Array<Object>>} A promise that resolves to an array of tool results.
     * @private
     */
    async executeTools(toolCalls) {
        const toolResults = [];
        console.log("Simulacrum | Starting tool execution...");
        for (const toolCall of toolCalls) {
            console.log(`Simulacrum | Attempting to execute tool: ${toolCall.tool_name} with parameters:`, toolCall.parameters);
            try {
                const result = await this.toolScheduler.scheduleToolExecution(toolCall.tool_name, toolCall.parameters, game.user);
                console.log(`Simulacrum | Tool ${toolCall.tool_name} executed successfully. Result:`, result);
                toolResults.push({ tool_name: toolCall.tool_name, result: result });
            } catch (error) {
                console.error(`Simulacrum | Tool execution failed for ${toolCall.tool_name}:`, error);
                ui.notifications.error(`Simulacrum | Tool execution failed for ${toolCall.tool_name}: ${error.message}`);
                toolResults.push({ tool_name: toolCall.tool_name, error: error.message });
            }
        }
        console.log("Simulacrum | All tool executions completed.");
        return toolResults;
    }

    /**
     * Processes a user request through the agentic loop.
     * @param {string} userMessage - The initial message from the user.
     * @returns {Promise<void>}
     */
    async processUserRequest(userMessage) {
        this.cancelled = false;
        let context = this.initializeContext(userMessage);

        // Show initial thinking placeholder
        this.showPlaceholder("Thinking");

        const MAX_ITERATIONS = 10; // Safety limit to prevent infinite loops
        let iteration = 0;

        while (!this.cancelled && iteration < MAX_ITERATIONS) {
            iteration++;
            try {
                // Get AI response with accumulated context
                const chatPrompt = await context.toChatPrompt(); // Ensure to await if toChatPrompt is async
                console.log(`Simulacrum | Iteration ${iteration}: Fetching AI response with prompt:`, chatPrompt);
                const response = await this.aiService.sendMessage(chatPrompt);
                console.log(`Simulacrum | Iteration ${iteration}: Raw AI response:`, response);
                const parsed = await this.responseParser.parseAgentResponse(response);
                console.log(`Simulacrum | Iteration ${iteration}: Parsed JSON response:`, parsed);

                // Programmatic enforcement of in_progress logic:
                // If AI provides tool_calls, the loop must continue, regardless of AI's in_progress suggestion.
                if (parsed.tool_calls && parsed.tool_calls.length > 0) {
                    parsed.continuation.in_progress = true;
                    console.log(`Simulacrum | Iteration ${iteration}: Overriding in_progress to true due to tool_calls.`);
                }

                // Replace placeholder with AI message
                this.replacePlaceholderWithMessage(parsed.message);
                context.addAIResponse(parsed); // Add parsed AI response to context
                console.log(`Simulacrum | Iteration ${iteration}: AI response added to context.`);

                // Check if we're done
                if (!parsed.continuation.in_progress) {
                    this.showMessage("Workflow completed.");
                    console.log(`Simulacrum | Iteration ${iteration}: Workflow completed.`);
                    return; // Complete
                }

                // Check for cancellation (again, after AI response)
                if (this.cancelled) {
                    this.showMessage("Operation cancelled by user.");
                    return;
                }

                // Show progress placeholder with gerund
                this.showPlaceholder(parsed.continuation.gerund);

                // Execute tools if present
                if (parsed.tool_calls && parsed.tool_calls.length > 0) {
                    console.log(`Simulacrum | Iteration ${iteration}: Tool calls identified:`, parsed.tool_calls);
                    const toolResults = await this.executeTools(parsed.tool_calls);
                    context.addToolResults(toolResults);
                    console.log(`Simulacrum | Iteration ${iteration}: Tool execution results:`, toolResults);
                } else {
                    // If AI indicates continuation but provides no tools, it might be stuck or waiting for more info.
                    // For now, we'll just log and continue, but this might need more sophisticated handling.
                    console.warn("Simulacrum | AI indicated continuation but provided no tool calls.");
                }

            } catch (error) {
                console.error("Simulacrum | Agentic loop error:", error);
                ui.notifications.error(`Simulacrum | Agentic loop error: ${error.message}`);
                // Attempt to provide error context to AI for recovery, or terminate gracefully
                context.addError(error.message); // Assuming AgenticContext has an addError method
                this.showMessage(`Agentic loop encountered an error: ${error.message}. Attempting to recover...`);
                // For now, we'll break to prevent infinite error loops.
                break;
            }
        }

        if (iteration >= MAX_ITERATIONS) {
            this.showMessage("Agentic loop terminated due to maximum iteration limit.");
            console.warn("Simulacrum | Agentic loop terminated due to maximum iteration limit.");
        } else if (this.cancelled) {
            this.showMessage("Operation cancelled by user.");
        }
    }

    /**
     * Cancels the ongoing agentic workflow.
     */
    cancel() {
        this.cancelled = true;
        this.toolScheduler.abortAllTools(); // Assuming ToolScheduler has an abortAllTools method
        ui.notifications.warn("Simulacrum | Agentic workflow cancellation requested.");
    }
}
