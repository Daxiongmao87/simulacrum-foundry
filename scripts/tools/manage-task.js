import { BaseTool } from './base-tool.js';
import { SimulacrumHooks } from '../core/hook-manager.js';

export class ManageTaskTool extends BaseTool {
  constructor() {
    super(
      'manage_task',
      'Manage complex tasks by breaking them into steps, tracking progress, and updating state. Each step must have a "title" and "description" formatted as "<Title>: <Description>". IMPORTANT: The FINAL step MUST have title "Summary" (description can be a placeholder). When calling finish_task, you MUST provide the actual summary content describing what was accomplished.',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start_task', 'update_task', 'finish_task'],
            description: 'The action to perform on the task.',
          },
          taskName: {
            type: 'string',
            description: 'Name of the task (required for start_task).',
          },
          taskGoal: {
            type: 'string',
            description: 'Overall goal of the task (required for start_task).',
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Short title for the step (e.g., "Research", "Implement", "Verify", "Summary").',
                },
                description: {
                  type: 'string',
                  description: 'Detailed description of what this step accomplishes.',
                },
              },
              required: ['title', 'description'],
            },
            description: 'List of steps to complete the task (required for start_task). Each step is an object with "title" and "description". The LAST step MUST have title "Summary".',
          },
          currentStep: {
            type: 'integer',
            description: 'Index of the current step being executed (0-indexed).',
          },
          status: {
            type: 'string',
            description: 'Human-readable status message for the current step (e.g., "Researching existing documents", "Creating the NPC actor"). Do NOT use machine-style values like "in_progress" or "completed".',
          },
          summary: {
            type: 'string',
            description: 'REQUIRED for finish_task. The actual summary of what was accomplished during the task. This will be displayed as the final Summary step content.',
          },
        },
        required: ['action'],
      }
    );

    this.currentTask = null;
  }

  async execute(params) {
    const { action } = params;

    if (action === 'start_task') {
      return this._startTask(params);
    }

    if (action === 'update_task') {
      return this._updateTask(params);
    }

    if (action === 'finish_task') {
      return this._finishTask(params);
    }
  }

  _startTask({ taskName, taskGoal, steps }) {
    if (!taskName || !taskGoal || !steps) {
      throw new Error('start_task requires taskName, taskGoal, and steps.');
    }

    // Validate step structure
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('Task rejected: steps must be a non-empty array of {title, description} objects.');
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || typeof step.title !== 'string' || typeof step.description !== 'string') {
        throw new Error(`Task rejected: Step ${i} must be an object with "title" and "description" string properties.`);
      }
    }

    // Validate that the final step is a Summary step
    const lastStep = steps[steps.length - 1];
    if (lastStep.title !== 'Summary') {
      throw new Error(
        'Task rejected: The final step must have title "Summary". ' +
        'Please restructure your task list so the last step is { title: "Summary", description: "<placeholder or actual summary>" }.'
      );
    }

    this.currentTask = {
      name: taskName,
      goal: taskGoal,
      steps: steps.map(s => ({ title: s.title, description: s.description, status: 'pending' })),
      currentStepIndex: 0,
      startTime: Date.now(),
      lastDisplayedStep: -1, // Track which step we last showed a separator for
    };

    // Mark first step as in progress
    this.currentTask.steps[0].status = 'in_progress';

    // Emit hook to show task tracker
    Hooks.callAll(SimulacrumHooks.TASK_STARTED, this._getTaskState());

    return {
      content: `Task started: ${taskName}\nGoal: ${taskGoal}\nSteps: ${steps.length}`,
      display: '', // No display in chat - tracker shows it
    };
  }

  _updateTask({ currentStep, status }) {
    if (!this.currentTask) return { content: 'No active task to update.', display: '' };

    if (typeof currentStep === 'number') {
      this.currentTask.currentStepIndex = currentStep;
      // Mark previous steps done
      for (let j = 0; j < currentStep; j++) {
        this.currentTask.steps[j].status = 'completed';
      }
      // Mark current step in progress
      if (this.currentTask.steps[currentStep]) {
        this.currentTask.steps[currentStep].status = 'in_progress';
      }
    }

    // Emit hook to update task tracker
    Hooks.callAll(SimulacrumHooks.TASK_UPDATED, this._getTaskState());

    const currentStepTitle = this.currentTask.steps[this.currentTask.currentStepIndex]?.title || 'Unknown';
    const stepNum = this.currentTask.currentStepIndex + 1;
    const totalSteps = this.currentTask.steps.length;
    const taskName = this.currentTask.name;

    // Only show separator when moving to a NEW step (prevents duplicates when AI calls update_task multiple times)
    const stepIndex = this.currentTask.currentStepIndex;
    const isNewStep = stepIndex !== this.currentTask.lastDisplayedStep;

    let display = '';
    if (isNewStep) {
      this.currentTask.lastDisplayedStep = stepIndex;
      display = `<div class="simulacrum-step-separator"><div class="step-task-name">${taskName}</div><div class="step-info"><span class="step-label">Step ${stepNum}</span><span class="step-title">${currentStepTitle}</span></div></div>`;
    }

    return {
      content: `Task update: Step ${stepNum}/${totalSteps} - ${currentStepTitle}`,
      display,
    };
  }

  _finishTask({ summary }) {
    if (!this.currentTask) return { content: 'No active task to finish.', display: '' };

    // Require summary content for finish_task
    if (!summary || typeof summary !== 'string' || summary.trim().length === 0) {
      throw new Error(
        'finish_task rejected: You MUST provide a "summary" parameter describing what was accomplished. ' +
        'Example: { action: "finish_task", summary: "Deleted the accidental human race item and updated the Shym races journal with all canonical FR 2e races." }'
      );
    }

    // Update the Summary step's description with the actual summary content
    const lastStepIndex = this.currentTask.steps.length - 1;
    this.currentTask.steps[lastStepIndex].description = summary;

    // Mark all steps as completed
    this.currentTask.steps.forEach(s => {
      s.status = 'completed';
    });

    const taskName = this.currentTask.name;

    // Emit hook to hide task tracker
    Hooks.callAll(SimulacrumHooks.TASK_FINISHED, {
      ...this._getTaskState(),
      summary: summary,
    });

    this.currentTask = null;

    return {
      content: `Task completed: ${taskName}\n\nSummary: ${summary}`,
      display: `**Task Complete: ${taskName}**\n\n${summary}`,
    };
  }

  _getTaskState() {
    if (!this.currentTask) return null;
    return {
      name: this.currentTask.name,
      goal: this.currentTask.goal,
      steps: this.currentTask.steps.map(s => ({ ...s })),
      currentStepIndex: this.currentTask.currentStepIndex,
      totalSteps: this.currentTask.steps.length,
    };
  }
}
