/**
 * Custom error for tool validation failures
 */
export class ToolValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolValidationError';
  }
}
