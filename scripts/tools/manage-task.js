import { BaseTool } from './base-tool.js';

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
            description: 'Status update for the current step or task.',
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

  _finishTask({ summary }) {
    if (!this.currentTask) return 'No active task to finish.';

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
      // Format as "<Title>: <Description>" for consistency
      html += `<li style="${style}">${icon} <strong>${step.title}:</strong> ${step.description}</li>`;
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
