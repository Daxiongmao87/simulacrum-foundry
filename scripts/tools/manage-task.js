import { BaseTool } from './base-tool.js';

export class ManageTaskTool extends BaseTool {
  constructor() {
    super(
      'manage_task',
      'Manage complex tasks by breaking them into steps, tracking progress, and updating state.',
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
            items: { type: 'string' },
            description: 'List of steps to complete the task (required for start_task).',
          },
          currentStep: {
            type: 'integer',
            description: 'Index of the current step being executed (0-indexed).',
          },
          status: {
            type: 'string',
            description: 'Status update for the current step or task.',
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
      return this._finishTask();
    }
  }

  _startTask({ taskName, taskGoal, steps }) {
    if (!taskName || !taskGoal || !steps) {
      throw new Error('start_task requires taskName, taskGoal, and steps.');
    }
    this.currentTask = {
      name: taskName,
      goal: taskGoal,
      steps: steps.map(s => ({ text: s, status: 'pending' })),
      currentStepIndex: 0,
      startTime: Date.now(),
    };
    return this._renderTaskUpdate('Task Started');
  }

  _updateTask({ currentStep, status }) {
    if (!this.currentTask) return 'No active task to update.';

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

    return this._renderTaskUpdate(status || 'Task Updated');
  }

  _finishTask() {
    if (!this.currentTask) return 'No active task to finish.';
    this.currentTask.steps.forEach(s => {
      s.status = 'completed';
    });
    const finalReport = this._renderTaskUpdate('Task Completed');
    this.currentTask = null;
    return finalReport;
  }

  _renderTaskUpdate(header) {
    if (!this.currentTask) return 'No active task.';

    let html = `<h3>${header}: ${this.currentTask.name}</h3>`;
    html += `<p><strong>Goal:</strong> ${this.currentTask.goal}</p>`;
    html += `<ul>`;
    this.currentTask.steps.forEach((step, index) => {
      let icon = '⬜';
      if (step.status === 'completed') icon = '✅';
      if (step.status === 'in_progress') icon = '🔄';
      const style = index === this.currentTask.currentStepIndex ? 'font-weight: bold;' : '';
      html += `<li style="${style}">${icon} ${step.text}</li>`;
    });
    html += `</ul>`;

    // In a real implementation this would post to chat, but for now we return string representation
    // or log it. The tool output is displayed to the user by the AI system anyway.
    return {
      content: `Task State:\nName: ${this.currentTask.name}\nGoal: ${this.currentTask.goal}\nStep: ${this.currentTask.currentStepIndex}/${this.currentTask.steps.length}`,
      display: html,
    };
  }
}
