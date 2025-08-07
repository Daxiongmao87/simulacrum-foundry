// scripts/core/tool-scheduler.js
// Replaced with CoreToolScheduler inspired by gemini-cli

// Simple unique ID generator
const generateCallId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Default config – can be overridden via options
class DefaultConfig {
  getApprovalMode() {
        // Check YOLO mode setting
        if (game.settings.get('simulacrum', 'yoloMode')) {
            return 'YOLO';
        }
        return 'ASK';
    }
}

export class SimulacrumToolScheduler {
  constructor(optionsOrRegistry) {
    // Support legacy constructor(toolRegistry) and new options
    if (optionsOrRegistry && typeof optionsOrRegistry === 'object' && !Array.isArray(optionsOrRegistry) && optionsOrRegistry.toolRegistry) {
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
  async scheduleToolExecution(toolName, parameters, user) {
    const callId = generateCallId();
    const request = { callId, name: toolName, args: parameters };
    const abortCtrl = new AbortController();
    const promise = new Promise((resolve, reject) => {
      this.schedule(request, abortCtrl.signal).then(() => {
        const call = this.toolCalls.find(c => c.request.callId === callId);
        if (call && call.status === 'success') resolve(call.response);
        else if (call && call.status === 'error') reject(call.response?.error || new Error('Tool execution failed'));
        else reject(new Error('Tool execution aborted'));
      }).catch(reject);
    });
    return promise;
  }

  // New schedule method – accepts array of requests
  async schedule(requests, signal) {
    if (this.isRunning()) {
      throw new Error('Cannot schedule new tool calls while others are running');
    }
    const reqArray = Array.isArray(requests) ? requests : [requests];
    const toolRegistry = await this.toolRegistry;
    const newCalls = reqArray.map(req => {
      const tool = toolRegistry.getTool(req.name);
      if (!tool) {
        return {
          status: 'error',
          request: req,
          response: { callId: req.callId, error: new Error(`Tool ${req.name} not found`) },
          durationMs: 0,
        };
      }
      return {
        status: 'validating',
        request: req,
        tool,
        startTime: Date.now(),
      };
    });
    this.toolCalls = this.toolCalls.concat(newCalls);
    this.notifyToolCallsUpdate();

    for (const call of newCalls) {
      if (call.status !== 'validating') continue;
      const { request, tool } = call;
      try {
        if (this.config.getApprovalMode() === 'YOLO') {
          this.setStatusInternal(request.callId, 'scheduled');
        } else {
          const confirmation = await tool.shouldConfirmExecute(request.args, signal);
          if (confirmation) {
            this.setStatusInternal(request.callId, 'awaiting_approval', confirmation);
          } else {
            this.setStatusInternal(request.callId, 'scheduled');
          }
        }
      } catch (e) {
        this.setStatusInternal(request.callId, 'error', { callId: request.callId, error: e });
      }
    }
    this.attemptExecutionOfScheduledCalls(signal);
    this.checkAndNotifyCompletion();
  }

  setStatusInternal(targetCallId, status, data) {
    this.toolCalls = this.toolCalls.map(call => {
      if (call.request.callId !== targetCallId || ['success', 'error', 'cancelled'].includes(call.status)) return call;
      const start = call.startTime;
      switch (status) {
        case 'success':
          return { ...call, status: 'success', response: data, durationMs: start ? Date.now() - start : undefined };
        case 'error':
          return { ...call, status: 'error', response: data, durationMs: start ? Date.now() - start : undefined };
        case 'awaiting_approval':
          return { ...call, status: 'awaiting_approval', confirmationDetails: data };
        case 'scheduled':
          return { ...call, status: 'scheduled' };
        case 'executing':
          return { ...call, status: 'executing', startTime: start };
        case 'cancelled':
          return { ...call, status: 'cancelled', response: data };
        default:
          return call;
      }
    });
    this.notifyToolCallsUpdate();
    this.checkAndNotifyCompletion();
  }

  notifyToolCallsUpdate() {
    if (this.onToolCallsUpdate) this.onToolCallsUpdate(this.toolCalls);
  }

  checkAndNotifyCompletion() {
    const terminal = this.toolCalls.every(c => ['success', 'error', 'cancelled'].includes(c.status));
    if (terminal && this.onAllToolCallsComplete) {
      this.onAllToolCallsComplete(this.toolCalls);
      this.toolCalls = [];
    }
  }

  async attemptExecutionOfScheduledCalls(signal) {
    for (const call of this.toolCalls.filter(c => c.status === 'scheduled')) {
      this.setStatusInternal(call.request.callId, 'executing');
      try {
        const result = await call.tool.execute(call.request.args, signal);
        this.setStatusInternal(call.request.callId, 'success', result);
      } catch (e) {
        this.setStatusInternal(call.request.callId, 'error', { callId: call.request.callId, error: e });
      }
    }
  }

  async handleConfirmationResponse(callId, outcome, signal, payload) {
    if (outcome === 'Cancel' || signal.aborted) {
      this.setStatusInternal(callId, 'cancelled', 'User cancelled');
    } else {
      this.setStatusInternal(callId, 'scheduled');
    }
    this.attemptExecutionOfScheduledCalls(signal);
  }

  isRunning() {
    return this.toolCalls.some(c => c.status === 'executing' || c.status === 'awaiting_approval');
  }

  abort() {
    if (this.abortController) this.abortController.abort();
    this.toolCalls = [];
  }
}