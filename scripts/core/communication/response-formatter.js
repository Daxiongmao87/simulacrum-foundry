/**
 * Communication Enhancement - Response Formatter
 * Final answer structuring and CLI optimization
 */

import { FormattedResponse } from './interfaces.js';
import { createLogger } from '../../utils/logger.js';

export class ResponseFormatter {
  constructor() {
    this.logger = createLogger('ResponseFormatter');
    this.formatTemplates = new Map();
    this.cliConstraints = {
      maxWidth: 80,
      preferredWidth: 70,
      maxSectionDepth: 3,
      maxResponseLength: 2000,
      maxCodeBlockLength: 500
    };
    this.formatStats = {
      totalFormatted: 0,
      averageLength: 0,
      formatFailures: 0
    };

    this._initializeFormatTemplates();
  }

  /**
   * Format final response with CLI optimization
   * @param {TaskResults} taskResults - Completed task results
   * @param {CommunicationContext} context - Communication context
   * @returns {Promise<FormattedResponse>} Formatted response
   */
  async formatFinalResponse(taskResults, context) {
    try {
      this.logger.debug(`Formatting final response for task: ${taskResults.taskTitle}`);

      const template = this._selectTemplate(taskResults, context);
      const response = await this._applyTemplate(template, taskResults, context);
      
      this._optimizeForCLI(response, context);
      this._validateResponse(response, context);
      this._updateFormatStats(response);

      this.logger.debug(`Response formatted: ${response.getMetadata().wordCount} words, ${response.sections.length} sections`);
      
      return response;

    } catch (error) {
      this.logger.error('Response formatting failed:', error);
      this.formatStats.formatFailures++;
      
      return this._createFallbackResponse(taskResults, error);
    }
  }

  /**
   * Format error response with actionable information
   * @param {Error} error - Error that occurred
   * @param {TaskResults} partialResults - Any partial results
   * @param {CommunicationContext} context - Communication context
   * @returns {FormattedResponse} Formatted error response
   */
  formatErrorResponse(error, partialResults = null, context = null) {
    const response = new FormattedResponse();
    
    response.addSection('Error Encountered', this._formatErrorDetails(error));

    if (partialResults && partialResults.outputs.size > 0) {
      response.addSection('Partial Results', this._formatPartialResults(partialResults));
    }

    response.addSection('Next Steps', this._formatErrorRecovery(error, partialResults));

    this._optimizeForCLI(response, context);
    return response;
  }

  /**
   * Format simple confirmation response
   * @param {string} action - Action completed
   * @param {Object} details - Optional details
   * @param {CommunicationContext} context - Communication context
   * @returns {FormattedResponse} Simple formatted response
   */
  formatSimpleConfirmation(action, details = {}, context = null) {
    const response = new FormattedResponse();
    
    if (context && context.isVerbose()) {
      response.addSection('Action Completed', action);
      
      if (Object.keys(details).length > 0) {
        const detailsText = Object.entries(details)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        response.addSection('Details', detailsText, 2);
      }
    } else {
      // Concise format for simple tasks
      response.content = details.file ? `${action}: ${details.file}` : action;
      // Add a basic section for consistency
      response.addSection('Completed', action);
    }

    return response;
  }

  /**
   * Format collaborative response with feedback points
   * @param {TaskResults} taskResults - Task results
   * @param {Array} feedbackPoints - Points needing user input
   * @param {CommunicationContext} context - Communication context
   * @returns {FormattedResponse} Collaborative response
   */
  formatCollaborativeResponse(taskResults, feedbackPoints, context) {
    const response = new FormattedResponse();
    
    response.addSection('Work Completed', this._formatCompletedWork(taskResults));
    
    response.addSection('Feedback Needed', this._formatFeedbackPoints(feedbackPoints));
    
    response.addSection('Next Steps', 'Please review the above points and provide feedback to continue.');

    this._optimizeForCLI(response, context);
    return response;
  }

  /**
   * Apply custom formatting style
   * @param {FormattedResponse} response - Response to style
   * @param {Object} styleOptions - Custom styling options
   * @returns {FormattedResponse} Styled response
   */
  applyCustomStyling(response, styleOptions = {}) {
    const defaultStyle = {
      useEmphasis: true,
      bulletStyle: '-',
      codeBlockStyle: 'fenced',
      sectionDivider: '\n',
      maxLineLength: this.cliConstraints.maxWidth
    };

    const style = { ...defaultStyle, ...styleOptions };
    
    // Apply styling transformations
    response.styling = { ...response.styling, ...style };
    
    return response;
  }

  /**
   * Select appropriate formatting template
   * @private
   */
  _selectTemplate(taskResults, context) {
    if (context.isSimpleTask() && taskResults.isSuccessful()) {
      return 'simple_success';
    }
    
    if (!taskResults.isSuccessful()) {
      return 'error_detailed';
    }
    
    if (context.isComplexTask()) {
      return 'detailed_success';
    }
    
    if (taskResults.changes.length > 0 || taskResults.outputs.size > 0) {
      return 'standard_success';
    }
    
    return 'basic_success';
  }

  /**
   * Apply formatting template
   * @private
   */
  async _applyTemplate(templateName, taskResults, context) {
    const template = this.formatTemplates.get(templateName);
    if (!template) {
      throw new Error(`Unknown format template: ${templateName}`);
    }

    return await template.apply(taskResults, context, this);
  }

  /**
   * Optimize response for CLI display
   * @private
   */
  _optimizeForCLI(response, context) {
    if (!context) return;

    const maxLength = Math.min(context.getMaxLength(), this.cliConstraints.maxResponseLength);
    
    if (response.getMetadata().characterCount > maxLength) {
      const truncated = response.truncate(maxLength);
      response.sections = truncated.sections;
    }

    // Apply CLI-specific formatting
    response.styling.maxWidth = Math.min(
      context.environmentInfo.terminalWidth || 80,
      this.cliConstraints.maxWidth
    );

    // Ensure sections don't get too deep
    response.sections.forEach(section => {
      if (section.level > this.cliConstraints.maxSectionDepth) {
        section.level = this.cliConstraints.maxSectionDepth;
      }
    });
  }

  /**
   * Validate formatted response
   * @private
   */
  _validateResponse(response, context) {
    const metadata = response.getMetadata();
    
    if (metadata.characterCount === 0) {
      throw new Error('Empty response generated');
    }
    
    if (context && metadata.characterCount > context.getMaxLength()) {
      this.logger.warn(`Response exceeds max length: ${metadata.characterCount} > ${context.getMaxLength()}`);
    }
    
    if (response.sections.length === 0 && !response.content) {
      throw new Error('Response has no content or sections');
    }
  }

  /**
   * Create fallback response for formatting failures
   * @private
   */
  _createFallbackResponse(taskResults, error) {
    const response = new FormattedResponse();
    
    if (taskResults.isSuccessful()) {
      response.content = `Task completed: ${taskResults.taskTitle}`;
    } else {
      response.content = `Task failed: ${taskResults.taskTitle}`;
    }
    
    response.addSection('Note', `Response formatting failed: ${error.message}`);
    
    return response;
  }

  /**
   * Format error details
   * @private
   */
  _formatErrorDetails(error) {
    let details = `**${error.message}**\n`;
    
    if (error.context) {
      details += `Context: ${error.context}\n`;
    }
    
    if (error.stack && process.env.NODE_ENV === 'development') {
      details += `\nStack trace:\n\`\`\`\n${error.stack}\n\`\`\``;
    }
    
    return details.trim();
  }

  /**
   * Format partial results
   * @private
   */
  _formatPartialResults(partialResults) {
    const outputs = Array.from(partialResults.outputs.entries());
    
    if (outputs.length === 0) {
      return 'No partial results available.';
    }
    
    return outputs.map(([key, output]) => {
      let line = `${key}: ${output.value}`;
      if (output.description) {
        line += ` - ${output.description}`;
      }
      return line;
    }).join('\n');
  }

  /**
   * Format error recovery suggestions
   * @private
   */
  _formatErrorRecovery(error, partialResults) {
    const suggestions = [];
    
    if (error.message.includes('timeout')) {
      suggestions.push('Try running the task again with a longer timeout');
      suggestions.push('Break the task into smaller steps');
    }
    
    if (error.message.includes('permission')) {
      suggestions.push('Check file permissions and access rights');
      suggestions.push('Ensure you have necessary credentials');
    }
    
    if (error.message.includes('not found')) {
      suggestions.push('Verify all required files and dependencies exist');
      suggestions.push('Check file paths and references');
    }
    
    if (partialResults && partialResults.outputs.size > 0) {
      suggestions.push('Review partial results above for completed work');
      suggestions.push('Consider continuing from the last successful step');
    }
    
    if (suggestions.length === 0) {
      suggestions.push('Review the error details above');
      suggestions.push('Check system logs for additional information');
      suggestions.push('Retry the operation if appropriate');
    }
    
    return suggestions.map(s => `- ${s}`).join('\n');
  }

  /**
   * Format completed work summary
   * @private
   */
  _formatCompletedWork(taskResults) {
    const sections = [];
    
    if (taskResults.outputs.size > 0) {
      sections.push('**Outputs Generated:**');
      const outputs = Array.from(taskResults.outputs.entries());
      sections.push(outputs.map(([key, output]) => `- ${key}: ${output.value}`).join('\n'));
    }
    
    if (taskResults.changes.length > 0) {
      sections.push('\n**Changes Made:**');
      sections.push(taskResults.changes.map(change => `- ${change.description || change.type}`).join('\n'));
    }
    
    if (taskResults.validationResults.length > 0) {
      sections.push('\n**Validation Results:**');
      const passed = taskResults.validationResults.filter(v => v.success);
      sections.push(`- ${passed.length}/${taskResults.validationResults.length} validations passed`);
    }
    
    return sections.join('\n');
  }

  /**
   * Format feedback points
   * @private
   */
  _formatFeedbackPoints(feedbackPoints) {
    return feedbackPoints.map((point, index) => {
      let formatted = `${index + 1}. **${point.title}**\n`;
      formatted += `   ${point.description}\n`;
      
      if (point.options && point.options.length > 0) {
        formatted += `   Options: ${point.options.join(', ')}\n`;
      }
      
      return formatted;
    }).join('\n');
  }

  /**
   * Update formatting statistics
   * @private
   */
  _updateFormatStats(response) {
    this.formatStats.totalFormatted++;
    
    const metadata = response.getMetadata();
    const totalLength = this.formatStats.averageLength * (this.formatStats.totalFormatted - 1) + metadata.characterCount;
    this.formatStats.averageLength = totalLength / this.formatStats.totalFormatted;
  }

  /**
   * Initialize format templates
   * @private
   */
  _initializeFormatTemplates() {
    this.formatTemplates.set('simple_success', {
      apply: async (taskResults, context, formatter) => {
        return formatter.formatSimpleConfirmation(
          `Completed: ${taskResults.taskTitle}`,
          taskResults.outputs.size > 0 ? { outputs: taskResults.outputs.size } : {},
          context
        );
      }
    });

    this.formatTemplates.set('basic_success', {
      apply: async (taskResults, context, formatter) => {
        const response = new FormattedResponse();
        
        response.addSection('Task Completed', taskResults.taskTitle);
        
        if (taskResults.outputs.size > 0) {
          response.addSection('Results', formatter._formatPartialResults(taskResults), 2);
        }
        
        return response;
      }
    });

    this.formatTemplates.set('standard_success', {
      apply: async (taskResults, context, formatter) => {
        const response = new FormattedResponse();
        
        response.addSection('Task Completed', taskResults.taskTitle);
        
        if (taskResults.outputs.size > 0) {
          response.addSection('Outputs', formatter._formatPartialResults(taskResults), 2);
        }
        
        if (taskResults.changes.length > 0) {
          const changesText = taskResults.changes.map(c => `- ${c.description || c.type}`).join('\n');
          response.addSection('Changes Made', changesText, 2);
        }
        
        if (taskResults.validationResults.length > 0) {
          const validationText = formatter._formatValidationSummary(taskResults.validationResults);
          response.addSection('Validation', validationText, 2);
        }
        
        return response;
      }
    });

    this.formatTemplates.set('detailed_success', {
      apply: async (taskResults, context, formatter) => {
        const response = new FormattedResponse();
        
        response.addSection('Implementation Complete', taskResults.taskTitle);
        
        response.addSection('Summary', formatter._formatDetailedSummary(taskResults), 2);
        
        if (taskResults.outputs.size > 0) {
          response.addSection('Outputs Generated', formatter._formatPartialResults(taskResults), 2);
        }
        
        if (taskResults.changes.length > 0) {
          response.addSection('Changes Made', formatter._formatDetailedChanges(taskResults.changes), 2);
        }
        
        if (taskResults.validationResults.length > 0) {
          response.addSection('Testing & Validation', formatter._formatDetailedValidation(taskResults.validationResults), 2);
        }
        
        if (taskResults.hasWarnings()) {
          response.addSection('Notes', formatter._formatWarnings(taskResults.warnings), 2);
        }
        
        return response;
      }
    });

    this.formatTemplates.set('error_detailed', {
      apply: async (taskResults, context, formatter) => {
        const response = new FormattedResponse();
        
        response.addSection('Task Failed', taskResults.taskTitle);
        
        if (taskResults.errors.length > 0) {
          const errorText = taskResults.errors.map(e => `- ${e.message}`).join('\n');
          response.addSection('Errors Encountered', errorText, 2);
        }
        
        if (taskResults.outputs.size > 0) {
          response.addSection('Partial Results', formatter._formatPartialResults(taskResults), 2);
        }
        
        response.addSection('Recovery Options', formatter._formatErrorRecovery(taskResults.errors[0], taskResults), 2);
        
        return response;
      }
    });
  }

  /**
   * Format validation summary
   * @private
   */
  _formatValidationSummary(validationResults) {
    const passed = validationResults.filter(v => v.success).length;
    const total = validationResults.length;
    
    let summary = `${passed}/${total} validations passed`;
    
    if (passed < total) {
      const failed = validationResults.filter(v => !v.success);
      summary += `\n\nFailed validations:\n${failed.map(f => `- ${f.message || 'Validation failed'}`).join('\n')}`;
    }
    
    return summary;
  }

  /**
   * Format detailed summary
   * @private
   */
  _formatDetailedSummary(taskResults) {
    const summary = [];
    
    summary.push(`Status: ${taskResults.status}`);
    summary.push(`Duration: ${this._formatDuration(taskResults.duration)}`);
    
    if (taskResults.outputs.size > 0) {
      summary.push(`Outputs: ${taskResults.outputs.size} generated`);
    }
    
    if (taskResults.changes.length > 0) {
      summary.push(`Changes: ${taskResults.changes.length} modifications made`);
    }
    
    if (taskResults.validationResults.length > 0) {
      const passed = taskResults.validationResults.filter(v => v.success).length;
      summary.push(`Validation: ${passed}/${taskResults.validationResults.length} tests passed`);
    }
    
    return summary.join('\n');
  }

  /**
   * Format detailed changes
   * @private
   */
  _formatDetailedChanges(changes) {
    return changes.map(change => {
      let formatted = `- ${change.description || change.type}`;
      
      if (change.file) {
        formatted += ` (${change.file})`;
      }
      
      if (change.linesAdded || change.linesRemoved) {
        const stats = [];
        if (change.linesAdded) stats.push(`+${change.linesAdded}`);
        if (change.linesRemoved) stats.push(`-${change.linesRemoved}`);
        formatted += ` [${stats.join(', ')}]`;
      }
      
      return formatted;
    }).join('\n');
  }

  /**
   * Format detailed validation
   * @private
   */
  _formatDetailedValidation(validationResults) {
    return validationResults.map(result => {
      const status = result.success ? '✓' : '✗';
      let formatted = `${status} ${result.name || 'Validation'}`;
      
      if (result.message) {
        formatted += `: ${result.message}`;
      }
      
      if (result.details) {
        formatted += `\n  Details: ${result.details}`;
      }
      
      return formatted;
    }).join('\n');
  }

  /**
   * Format warnings
   * @private
   */
  _formatWarnings(warnings) {
    return warnings.map(warning => {
      let formatted = `⚠ ${warning.message}`;
      if (warning.context) {
        formatted += ` (${warning.context})`;
      }
      return formatted;
    }).join('\n');
  }

  /**
   * Format duration in human-readable form
   * @private
   */
  _formatDuration(milliseconds) {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    }
    
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Get formatter statistics
   * @returns {Object} Current formatting statistics
   */
  getFormatterStatistics() {
    return {
      ...this.formatStats,
      successRate: this.formatStats.totalFormatted > 0 
        ? ((this.formatStats.totalFormatted - this.formatStats.formatFailures) / this.formatStats.totalFormatted) * 100 
        : 0,
      availableTemplates: Array.from(this.formatTemplates.keys()),
      cliConstraints: { ...this.cliConstraints }
    };
  }

  /**
   * Register custom format template
   * @param {string} name - Template name
   * @param {Object} template - Template definition
   */
  registerFormatTemplate(name, template) {
    this.formatTemplates.set(name, template);
    this.logger.info(`Registered format template: ${name}`);
  }
}

export default ResponseFormatter;