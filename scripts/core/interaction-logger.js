/**
 * InteractionLogger - Captures and exports agent-user interaction logs
 *
 * Logs all messages, tool calls, and tool results for debugging and analysis.
 * Provides JSON export functionality accessible from the config UI.
 * Persists to FoundryVTT flags, cleared when conversation is cleared.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('InteractionLogger');
const LOGGER_VERSION = '1.0.0';
const FLAG_KEY = 'interactionLog';

/**
 * Entry types for logged interactions
 */
const EntryType = Object.freeze({
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  SYSTEM: 'system',
  LOOP_EVENT: 'loop_event',
});

/**
 * InteractionLogger class - Singleton instance for logging all agent-user interactions
 * Persists to FoundryVTT user flags, mirroring ConversationManager pattern.
 */
class InteractionLogger {
  constructor() {
    this._entries = [];
    this._sessionStart = new Date().toISOString();
    this._enabled = true; // Enabled by default
    this._maxEntries = 5000; // FIFO limit to prevent memory issues
    this._saveDebounceTimer = null;
  }

  /**
   * Initialize logger and load persisted entries
   */
  async initialize() {
    await this.load();
    logger.info(`InteractionLogger initialized with ${this._entries.length} persisted entries`);
  }

  /**
   * Get persistence key for current world
   * @returns {string}
   * @private
   */
  _getPersistenceKey() {
    return `${FLAG_KEY}:${game?.world?.id || 'unknown'}`;
  }

  /**
   * Save log entries to FoundryVTT user flags
   * @returns {Promise<boolean>}
   */
  async save() {
    try {
      if (typeof game !== 'undefined' && game?.user && typeof game.user.setFlag === 'function') {
        const state = {
          entries: this._entries,
          sessionStart: this._sessionStart,
          v: 1,
        };
        await game.user.setFlag('simulacrum', this._getPersistenceKey(), state);
        return true;
      }
    } catch (e) {
      logger.warn('Failed to save interaction log', e);
    }
    return false;
  }

  /**
   * Load log entries from FoundryVTT user flags
   * @returns {Promise<boolean>}
   */
  async load() {
    try {
      if (typeof game !== 'undefined' && game?.user && typeof game.user.getFlag === 'function') {
        const state = await game.user.getFlag('simulacrum', this._getPersistenceKey());
        if (state && state.entries) {
          this._entries = state.entries;
          this._sessionStart = state.sessionStart || new Date().toISOString();
          return true;
        }
      }
    } catch (e) {
      logger.warn('Failed to load interaction log', e);
    }
    return false;
  }

  /**
   * Debounced save - batches rapid writes
   * @private
   */
  _debouncedSave() {
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
    }
    this._saveDebounceTimer = setTimeout(() => {
      this.save().catch(e => logger.warn('Debounced save failed', e));
    }, 500);
  }

  /**
   * Check if logging is enabled
   * @returns {boolean}
   */
  get enabled() {
    return this._enabled;
  }

  /**
   * Enable or disable logging
   * @param {boolean} value
   */
  set enabled(value) {
    this._enabled = Boolean(value);
  }

  /**
   * Generate a unique ID for log entries
   * @returns {string}
   * @private
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add an entry to the log buffer with FIFO eviction
   * @param {object} entry
   * @private
   */
  _addEntry(entry) {
    this._entries.push(entry);

    // FIFO eviction if over limit
    while (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }

    // Trigger debounced save
    this._debouncedSave();
  }

  /**
   * Log a message from ConversationManager.addMessage
   * @param {object} message - The message object
   * @param {object} context - Additional context (toolCalls, toolCallId, metadata)
   */
  logMessage(message, context = {}) {
    if (!this.enabled) return;

    // Skip 'tool' role messages - they are logged via logToolResult() with richer metadata
    // (success, durationMs). Logging here would cause duplicates.
    if (message.role === 'tool') return;

    const { toolCalls, metadata } = context;
    const baseEntry = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      type: message.role,
      content: message.content,
    };

    // Add role-specific metadata
    if (message.role === 'assistant') {
      baseEntry.metadata = {
        hasToolCalls: Boolean(toolCalls && toolCalls.length > 0),
        toolCallCount: toolCalls?.length || 0,
        ...(metadata?.provider_metadata ? { provider_metadata: metadata.provider_metadata } : {}),
      };
    } else if (message.role === 'system') {
      baseEntry.type = EntryType.SYSTEM;
    }

    this._addEntry(baseEntry);
  }

  /**
   * Log a tool call before execution
   * @param {string} toolName - Name of the tool
   * @param {object} args - Tool arguments
   * @param {string} toolCallId - Tool call ID
   */
  logToolCall(toolName, args, toolCallId) {
    if (!this.enabled) return;

    this._addEntry({
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      type: EntryType.TOOL_CALL,
      content: null,
      metadata: {
        toolName,
        toolCallId,
        arguments: args,
      },
    });
  }

  /**
   * Log a tool result after execution
   * @param {string} toolCallId - Tool call ID
   * @param {object} result - Tool execution result
   * @param {boolean} success - Whether execution succeeded
   * @param {number} durationMs - Execution time in milliseconds
   */
  logToolResult(toolCallId, result, success, durationMs) {
    if (!this.enabled) return;

    this._addEntry({
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      type: EntryType.TOOL_RESULT,
      content: typeof result === 'string' ? result : JSON.stringify(result),
      metadata: {
        toolCallId,
        success,
        durationMs,
      },
    });
  }

  /**
   * Log a correlated tool-loop lifecycle event for stall diagnostics (#178)
   * @param {string} loopId - Correlated loop identifier
   * @param {string} event - Event name, e.g. 'loop_started', 'loop_ended'
   * @param {object} [details] - Small serializable details object
   */
  logLoopEvent(loopId, event, details = {}) {
    if (!this.enabled || !loopId) return;

    this._addEntry({
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      type: EntryType.LOOP_EVENT,
      loopId,
      event,
      details: details || {},
    });
  }

  /**
   * Get all log entries
   * @returns {Array} Log entries
   */
  getEntries() {
    return [...this._entries];
  }

  /**
   * Get entry count
   * @returns {number}
   */
  get entryCount() {
    return this._entries.length;
  }

  /**
   * Clear all log entries and persist the clear
   */
  async clear() {
    this._entries = [];
    this._sessionStart = new Date().toISOString();
    await this.save();
    logger.info('Interaction log cleared');
  }

  /**
   * Build a human-readable diagnostic log from current entries.
   * @returns {string} Formatted text log
   */
  buildReadableLog() {
    const model =
      typeof game !== 'undefined'
        ? (game.settings?.get('simulacrum', 'model') ?? 'unknown')
        : 'unknown';
    const system = game?.system?.id || 'unknown';
    const moduleVersion = game?.modules?.get('simulacrum')?.version || 'unknown';
    const date = new Date().toISOString();

    const toolCalls = this._entries.filter(e => e.type === EntryType.TOOL_CALL).length;
    const failures = this._entries.filter(
      e => e.type === EntryType.TOOL_RESULT && e.metadata?.success === false
    ).length;

    let log = `=== Simulacrum Interaction Log ===\n`;
    log += `Model: ${model} | System: ${system} | Simulacrum: ${moduleVersion}\n`;
    log += `Date: ${date} | Entries: ${this._entries.length} | Tool Calls: ${toolCalls} | Failures: ${failures}\n`;
    log += `\n--- Conversation ---\n`;

    for (const entry of this._entries) {
      log += this._formatEntryLine(entry);
    }

    return log;
  }

  /**
   * Format a single log entry as a conversation log line.
   * @param {object} entry Log entry
   * @returns {string} Formatted line (empty for non-conversation entries)
   */
  _formatEntryLine(entry) {
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '??:??:??';
    if (entry.type === EntryType.USER) {
      return `[${time}] User: ${entry.content || ''}\n`;
    } else if (entry.type === EntryType.ASSISTANT) {
      return `[${time}] Assistant: ${(entry.content || '').substring(0, 500)}\n`;
    } else if (entry.type === EntryType.TOOL_CALL) {
      return this._formatToolCallLine(entry, time);
    } else if (entry.type === EntryType.TOOL_RESULT) {
      return this._formatToolResultLine(entry, time);
    } else if (entry.type === EntryType.LOOP_EVENT) {
      return this._formatLoopEventLine(entry, time);
    }
    return '';
  }

  /**
   * Format a TOOL_CALL entry as a log line.
   * @param {object} entry Log entry
   * @param {string} time Formatted timestamp
   * @returns {string} Formatted line
   */
  _formatToolCallLine(entry, time) {
    const toolName = entry.metadata?.toolName || 'unknown';
    const args = entry.metadata?.arguments ? JSON.stringify(entry.metadata.arguments) : '';
    return `[${time}] Tool: ${toolName}(${args.substring(0, 300)})\n`;
  }

  /**
   * Format a TOOL_RESULT entry as a log line.
   * @param {object} entry Log entry
   * @param {string} time Formatted timestamp
   * @returns {string} Formatted line
   */
  _formatToolResultLine(entry, time) {
    const ok = entry.metadata?.success !== false ? 'OK' : 'FAIL';
    return `[${time}] Result [${ok}]: ${(entry.content || '').substring(0, 300)}\n`;
  }

  /**
   * Format a LOOP_EVENT entry as a log line.
   * @param {object} entry Log entry
   * @param {string} time Formatted timestamp
   * @returns {string} Formatted line
   */
  _formatLoopEventLine(entry, time) {
    const details = Object.keys(entry.details || {}).length
      ? ` ${JSON.stringify(entry.details)}`
      : '';
    return `[${time}] [loop ${entry.loopId}] ${entry.event}${details}\n`;
  }

  /**
   * Export log as JSON string
   * @returns {string} JSON export
   */
  export() {
    const customSystemPrompt = game?.settings?.get('simulacrum', 'customSystemPrompt') || '';

    const exportData = {
      version: LOGGER_VERSION,
      exportedAt: new Date().toISOString(),
      worldId: game?.world?.id || 'unknown',
      userId: game?.user?.id || 'unknown',
      sessionStart: this._sessionStart,
      customSystemPrompt: customSystemPrompt,
      entryCount: this._entries.length,
      entries: this._entries,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Download log as human-readable text file.
   * Uses exact pattern from Foundry Core (client/utils/helpers.mjs)
   */
  downloadAsFile() {
    const textData = this.buildReadableLog();
    const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `simulacrum-log-${dateStr}.txt`;

    const blob = new Blob([textData], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = filename;

    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => window.URL.revokeObjectURL(a.href), 100);

    logger.info(`Exported ${this._entries.length} log entries to ${filename}`);
  }
}

/**
 * InteractionLogDownloader - FormApplication for the settings menu button
 * Immediately triggers download when opened
 */
class InteractionLogDownloader extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'interaction-log-downloader',
      title: 'Download Interaction Log',
      template: null,
      width: 1,
      height: 1,
    });
  }

  /** @override */
  async _render(_force, _options) {
    // Don't actually render - just trigger download and close
    interactionLogger.downloadAsFile();
    ui?.notifications?.info(`Exported ${interactionLogger.entryCount} interaction log entries`);
    this.close();
  }
}

// Singleton instance
const interactionLogger = new InteractionLogger();

// Expose globally for debugging
if (typeof window !== 'undefined') {
  window.SimulacrumLogger = interactionLogger;
}

export { interactionLogger, InteractionLogger, InteractionLogDownloader, EntryType };
