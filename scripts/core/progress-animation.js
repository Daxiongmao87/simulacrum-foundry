// scripts/core/progress-animation.js

/**
 * Progress Animation utilities for visual feedback during agent workflows
 * Provides spinning cog icons with dynamic gerund labels for user engagement
 */

/**
 * Generate progress animation HTML with spinning cog and gerund text
 * @param {string} gerund - The action being performed (e.g., "Thinking", "Creating", "Analyzing")
 * @returns {string} HTML string for progress display
 */
export function showProgress(gerund = 'Thinking') {
  return `<i class="fas fa-cog fa-spin"></i> ${gerund}...`;
}

/**
 * Generate progress animation HTML with custom styling
 * @param {string} gerund - The action being performed
 * @param {Object} options - Styling options
 * @param {string} options.color - Color for the icon and text
 * @param {string} options.size - Size class for the icon
 * @returns {string} HTML string for progress display
 */
export function showProgressWithOptions(gerund = 'Thinking', options = {}) {
  const { color = '#42a5f5', size = 'fa-lg' } = options;
  const style = color !== '#42a5f5' ? `style="color: ${color};"` : '';

  return `<i class="fas fa-cog fa-spin ${size}" ${style}></i> ${gerund}...`;
}

/**
 * Update progress text while maintaining spinning animation
 * @param {HTMLElement} progressElement - The progress container element
 * @param {string} newGerund - The new action text
 */
export function updateProgressText(progressElement, newGerund) {
  if (progressElement) {
    progressElement.innerHTML = showProgress(newGerund);
  }
}

/**
 * Create a complete progress container with simulacrum styling
 * @param {string} gerund - The action being performed
 * @returns {string} Complete HTML for styled progress container
 */
export function createProgressContainer(gerund = 'Thinking') {
  return `<div class="simulacrum-placeholder">${showProgress(gerund)}</div>`;
}
