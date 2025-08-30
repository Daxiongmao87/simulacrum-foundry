import { Tool } from './tool-registry.js';

/**
 * TodoWrite Tool - Manages task lists and progress tracking for complex workflows
 * Allows the AI to create, update, and track progress through multi-step tasks
 */
export class TodoWriteTool extends Tool {
  constructor() {
    super(
      'todo_write',
      'Create and manage todo lists for tracking progress through complex multi-step tasks',
      {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: 'Array of todo items to create or update',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Unique identifier for the todo item',
                },
                content: {
                  type: 'string',
                  description: 'Description of the todo item',
                },
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                  description: 'Current status of the todo item',
                },
              },
              required: ['id', 'content', 'status'],
            },
          },
          merge: {
            type: 'boolean',
            description:
              'Whether to merge with existing todos (true) or replace them (false)',
            default: false,
          },
        },
        required: ['todos', 'merge'],
      },
      true, // isOutputMarkdown
      true // canUpdateOutput
    );

    // Store todos in memory for the current conversation only
    this.currentTodos = [];
  }

  /**
   * Execute the todo write tool
   */
  async execute(params) {
    try {
      const { todos, merge } = params;

      if (merge) {
        // Merge new todos with existing ones
        for (const newTodo of todos) {
          const existingIndex = this.currentTodos.findIndex(
            (todo) => todo.id === newTodo.id
          );
          if (existingIndex >= 0) {
            // Update existing todo
            this.currentTodos[existingIndex] = {
              ...this.currentTodos[existingIndex],
              ...newTodo,
            };
          } else {
            // Add new todo
            this.currentTodos.push(newTodo);
          }
        }
      } else {
        // Replace all todos
        this.currentTodos = [...todos];
      }

      // Format output for display
      const output = this.formatTodosOutput(this.currentTodos);

      return {
        success: true,
        result: output,
      };
    } catch (error) {
      game.simulacrum?.logger?.error('TodoWrite tool error:', error);
      return {
        success: false,
        error: `Failed to manage todos: ${error.message}`,
      };
    }
  }

  /**
   * Format todos for display
   */
  formatTodosOutput(todos) {
    if (!todos || todos.length === 0) {
      return '## 📋 Todo List\n\n*No todos currently*';
    }

    const statusEmojis = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌',
    };

    let output = '## 📋 Todo List\n\n';

    // Group by status
    const groups = {
      in_progress: todos.filter((t) => t.status === 'in_progress'),
      pending: todos.filter((t) => t.status === 'pending'),
      completed: todos.filter((t) => t.status === 'completed'),
      cancelled: todos.filter((t) => t.status === 'cancelled'),
    };

    // Show in-progress first
    if (groups.in_progress.length > 0) {
      output += '### 🔄 In Progress\n';
      for (const todo of groups.in_progress) {
        output += `- ${statusEmojis[todo.status]} **${todo.content}**\n`;
      }
      output += '\n';
    }

    // Then pending
    if (groups.pending.length > 0) {
      output += '### ⏳ Pending\n';
      for (const todo of groups.pending) {
        output += `- ${statusEmojis[todo.status]} ${todo.content}\n`;
      }
      output += '\n';
    }

    // Then completed
    if (groups.completed.length > 0) {
      output += '### ✅ Completed\n';
      for (const todo of groups.completed) {
        output += `- ${statusEmojis[todo.status]} ~~${todo.content}~~\n`;
      }
      output += '\n';
    }

    // Finally cancelled
    if (groups.cancelled.length > 0) {
      output += '### ❌ Cancelled\n';
      for (const todo of groups.cancelled) {
        output += `- ${statusEmojis[todo.status]} ~~${todo.content}~~\n`;
      }
      output += '\n';
    }

    // Add progress summary
    const completedCount = groups.completed.length;
    const totalCount = todos.length;
    const progressPercent =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    output += `**Progress:** ${completedCount}/${totalCount} completed (${progressPercent}%)`;

    return output;
  }

  /**
   * This tool doesn't need confirmation for todo management
   */
  shouldConfirmExecute() {
    return false;
  }
}
