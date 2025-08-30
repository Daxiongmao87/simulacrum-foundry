// scripts/core/tool-scheduler.js
// Replaced with CoreToolScheduler inspired by gemini-cli

// Simple unique ID generator
const generateCallId = () =>
  `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Default config – can be overridden via options
class DefaultConfig {
  getApprovalMode() {
    // Check Gremlin mode setting
    if (game.settings.get('simulacrum', 'gremlinMode')) {
      return 'GREMLIN';
    }
    return 'ASK';
  }
}

export class SimulacrumToolScheduler {
  constructor(optionsOrRegistry) {
    // Support legacy constructor(toolRegistry) and new options
    if (
      optionsOrRegistry &&
      typeof optionsOrRegistry === 'object' &&
      !Array.isArray(optionsOrRegistry) &&
      optionsOrRegistry.toolRegistry
    ) {
      const opts = optionsOrRegistry;
      this.toolRegistry = opts.toolRegistry;
      this.outputUpdateHandler = opts.outputUpdateHandler;
      this.onAllToolCallsComplete = opts.onAllToolCallsComplete;
      this.onToolCallsUpdate = opts.onToolCallsUpdate;
      this.getPreferredEditor = opts.getPreferredEditor;
      this.config = opts.config || new DefaultConfig();
      this.onEditorClose = opts.onEditorClose;
    } else {
      // Legacy: only toolRegistry provided
      this.toolRegistry = optionsOrRegistry;
      this.outputUpdateHandler = undefined;
      this.onAllToolCallsComplete = undefined;
      this.onToolCallsUpdate = undefined;
      this.getPreferredEditor = () => undefined;
      this.config = new DefaultConfig();
      this.onEditorClose = () => {};
    }
    this.toolCalls = [];
    this.abortController = null;
  }

  // Legacy method – schedule a single tool call
  async scheduleToolExecution(toolName, parameters, _user, abortSignal) {
    const callId = generateCallId();
    const request = { callId, name: toolName, args: parameters };
    const promise = new Promise((resolve, reject) => {
      // Store resolve/reject for later completion
      this.schedule(request, abortSignal, resolve, reject);
    });
    return promise;
  }

  // New schedule method – accepts array of requests
  async schedule(requests, signal, resolvePromise, rejectPromise) {
    const reqArray = Array.isArray(requests) ? requests : [requests];
    const toolRegistry = await this.toolRegistry;
    const newCalls = reqArray.map((req) => {
      const tool = toolRegistry.getTool(req.name);
      if (!tool) {
        return {
          status: 'error',
          request: req,
          response: {
            callId: req.callId,
            error: new Error(`Tool ${req.name} not found`),
          },
          durationMs: 0,
          resolve: resolvePromise, // Store resolve for single call
          reject: rejectPromise, // Store reject for single call
        };
      }
      return {
        status: 'validating',
        request: req,
        tool,
        startTime: Date.now(),
        resolve: resolvePromise, // Store resolve for single call
        reject: rejectPromise, // Store reject for single call
      };
    });
    this.toolCalls = this.toolCalls.concat(newCalls);
    this.notifyToolCallsUpdate();

    for (const call of newCalls) {
      if (call.status !== 'validating') {
        continue;
      }
      const { request, tool } = call;
      try {
        if (true) {
          // Force Gremlin mode for agentic loop
          this.setStatusInternal(request.callId, 'scheduled');
        } else {
          const confirmation = await tool.shouldConfirmExecute(
            request.args,
            signal
          );
          if (confirmation) {
            this.setStatusInternal(
              request.callId,
              'awaiting_approval',
              confirmation
            );
          } else {
            this.setStatusInternal(request.callId, 'scheduled');
          }
        }
      } catch (e) {
        this.setStatusInternal(request.callId, 'error', {
          callId: request.callId,
          error: e,
        });
      }
    }
    this.attemptExecutionOfScheduledCalls(signal);
    this.checkAndNotifyCompletion();
  }

  setStatusInternal(targetCallId, status, data) {
    this.toolCalls = this.toolCalls.map((call) => {
      if (
        call.request.callId !== targetCallId ||
        ['success', 'error', 'cancelled'].includes(call.status)
      ) {
        return call;
      }
      const start = call.startTime;
      const updatedCall = { ...call };

      switch (status) {
        case 'success':
          updatedCall.status = 'success';
          updatedCall.response = data;
          updatedCall.durationMs = start ? Date.now() - start : undefined;
          if (updatedCall.resolve) {
            updatedCall.resolve(data);
          }
          break;
        case 'error':
          updatedCall.status = 'error';
          updatedCall.response = data;
          updatedCall.durationMs = start ? Date.now() - start : undefined;
          if (updatedCall.reject) {
            updatedCall.reject(
              data?.error || new Error('Tool execution failed')
            );
          }
          break;
        case 'awaiting_approval':
          updatedCall.status = 'awaiting_approval';
          updatedCall.confirmationDetails = data;
          break;
        case 'scheduled':
          updatedCall.status = 'scheduled';
          break;
        case 'executing':
          updatedCall.status = 'executing';
          updatedCall.startTime = start;
          break;
        case 'cancelled':
          updatedCall.status = 'cancelled';
          updatedCall.response = data;
          if (updatedCall.reject) {
            updatedCall.reject(new Error('Tool execution cancelled'));
          }
          break;
        default:
          break;
      }
      return updatedCall;
    });
    this.notifyToolCallsUpdate();
    this.checkAndNotifyCompletion();
  }

  notifyToolCallsUpdate() {
    if (this.onToolCallsUpdate) {
      this.onToolCallsUpdate(this.toolCalls);
    }
  }

  checkAndNotifyCompletion() {
    const terminal = this.toolCalls.every((c) =>
      ['success', 'error', 'cancelled'].includes(c.status)
    );
    if (terminal && this.onAllToolCallsComplete) {
      this.onAllToolCallsComplete(this.toolCalls);
      this.toolCalls = [];
    }
  }

  async attemptExecutionOfScheduledCalls(signal) {
    for (const call of this.toolCalls.filter((c) => c.status === 'scheduled')) {
      this.setStatusInternal(call.request.callId, 'executing');
      try {
        // Debug logging for parameter validation
        game.simulacrum?.logger?.debug(
          `Executing tool ${call.request.name} with args:`,
          call.request.args
        );

        // Validate parameters before execution
        if (call.request.name === 'create_document') {
          if (!call.request.args?.documentType) {
            throw new Error(
              `Tool ${call.request.name}: Parameter 'documentType' is missing or undefined. Received args: ${JSON.stringify(call.request.args)}`
            );
          }
          if (!call.request.args?.data) {
            throw new Error(
              `Tool ${call.request.name}: Parameter 'data' is missing or undefined. Received args: ${JSON.stringify(call.request.args)}`
            );
          }
        }

        const result = await call.tool.execute(
          call.request.args,
          signal,
          // Provide output handler to tools for progress updates
          typeof this.outputUpdateHandler === 'function'
            ? this.outputUpdateHandler
            : undefined
        );

        // Record tool usage for workflow enforcement
        const workflowEnforcer = game.simulacrum?.workflowEnforcer;
        if (workflowEnforcer) {
          workflowEnforcer.recordToolUsage(
            call.request.name,
            call.request.args
          );
        }

        this.setStatusInternal(call.request.callId, 'success', result);
      } catch (e) {
        game.simulacrum?.logger?.error(
          `Tool execution failed for ${call.request.name}:`,
          e
        );
        this.setStatusInternal(call.request.callId, 'error', {
          callId: call.request.callId,
          error: e,
        });
      }
    }
  }

  async handleConfirmationResponse(callId, outcome, signal, _payload) {
    if (outcome === 'Cancel' || signal.aborted) {
      this.setStatusInternal(callId, 'cancelled', 'User cancelled');
    } else {
      this.setStatusInternal(callId, 'scheduled');
    }
    this.attemptExecutionOfScheduledCalls(signal);
  }

  isRunning() {
    return this.toolCalls.some(
      (c) => c.status === 'executing' || c.status === 'awaiting_approval'
    );
  }

  abortAllTools() {
    this.toolCalls = [];
  }
}
