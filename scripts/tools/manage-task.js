import { BaseTool } from './base-tool.js';
import { SimulacrumHooks } from '../core/hook-manager.js';

export class ManageTaskTool extends BaseTool {
  constructor() {
    super(
      'manage_task',
      'Track progress on multi-step tasks with a visual step tracker shown to the user. Call with "start_task" to define a task with named steps, "update_task" to advance to each step as you work, and "finish_task" to complete the task with a summary. The final step in every task must have the title "Summary".',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start_task', 'update_task', 'finish_task'],
            description: 'The lifecycle action: "start_task" creates a new task with a name, goal, and step list. "update_task" advances to a step and reports progress. "finish_task" completes the task and displays a summary.',
          },
          taskName: {
            type: 'string',
            description: 'The display name for the task (required for start_task).',
          },
          taskGoal: {
            type: 'string',
            description: 'A brief description of what the task aims to accomplish (required for start_task).',
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'A short label for the step (e.g., "Research", "Implement", "Verify", "Summary").',
                },
                description: {
                  type: 'string',
                  description: 'A description of what this step accomplishes.',
                },
              },
              required: ['title', 'description'],
            },
            description: 'The ordered list of steps for the task (required for start_task). Each step has a `title` and `description`. The last step must have title "Summary".',
          },
          currentStep: {
            type: 'integer',
            description: 'The 0-indexed step number to advance to (for update_task). All steps before this index are marked completed.',
          },
          status: {
            type: 'string',
            description: 'A human-readable progress message for the current step (e.g., "Researching existing documents", "Creating the NPC actor"). Do not use machine-style values like "in_progress" or "completed".',
          },
          summary: {
            type: 'string',
            description: 'A concise summary of what was accomplished (required for finish_task). This text is displayed as the final Summary step content.',
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
      return this.handleError('start_task requires taskName, taskGoal, and steps.', 'ValidationError');
    }

    // Validate step structure
    if (!Array.isArray(steps) || steps.length === 0) {
      return this.handleError('Task rejected: steps must be a non-empty array of {title, description} objects.', 'ValidationError');
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || typeof step.title !== 'string' || typeof step.description !== 'string') {
        return this.handleError(`Task rejected: Step ${i} must be an object with "title" and "description" string properties.`, 'ValidationError');
      }
    }

    // Validate that the final step is a Summary step
    const lastStep = steps[steps.length - 1];
    if (lastStep.title !== 'Summary') {
      return this.handleError(
        'Task rejected: The final step must have title "Summary". ' +
        'Please restructure your task list so the last step is { title: "Summary", description: "<placeholder or actual summary>" }.',
        'ValidationError'
      );
    }

    this.currentTask = {
      name: taskName,
      goal: taskGoal,
      steps: steps.map(s => ({ title: s.title, description: s.description, status: 'pending' })),
      currentStepIndex: 0,
      startTime: Date.now(),
      lastDisplayedStep: 0, // Track which step we last showed a separator for (started at 0)
    };

    // Mark first step as in progress
    this.currentTask.steps[0].status = 'in_progress';

    // Emit hook to show task tracker
    Hooks.callAll(SimulacrumHooks.TASK_STARTED, this._getTaskState());

    // Generate separator for Step 1 immediately
    const stepNum = 1;
    const currentStepTitle = steps[0].title;
    const separatorHtml = `<div class="simulacrum-step-separator"><div class="step-task-name">${taskName}</div><div class="step-info"><span class="step-label">Step ${stepNum}</span><span class="step-title">${currentStepTitle}</span></div></div>`;

    return {
      content: `Task started: ${taskName}\nGoal: ${taskGoal}\nSteps: ${steps.length}`,
      display: separatorHtml,
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
      return this.handleError(
        'finish_task rejected: You MUST provide a "summary" parameter describing what was accomplished. ' +
        'Example: { action: "finish_task", summary: "Deleted the accidental human race item and updated the Shym races journal with all canonical FR 2e races." }',
        'ValidationError'
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
