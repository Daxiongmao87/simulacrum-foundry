#!/usr/bin/env node

/**
 * @file tests/helpers/bootstrap/common/validation.js
 * @description Common validation utilities for FoundryVTT testing
 */

/**
 * Validate that a FoundryVTT session is ready
 * @param {Object} session - Session object to validate
 * @returns {Object} Validation result with success status and details
 */
export function validateSession(session) {
  if (!session) {
    return { valid: false, error: 'Session object is null or undefined' };
  }
  
  if (!session.page) {
    return { valid: false, error: 'Session missing page object' };
  }
  
  if (!session.browser) {
    return { valid: false, error: 'Session missing browser object' };
  }
  
  if (!session.permutation) {
    return { valid: false, error: 'Session missing permutation object' };
  }
  
  if (!session.permutation.version) {
    return { valid: false, error: 'Session missing version information' };
  }
  
  if (!session.permutation.system) {
    return { valid: false, error: 'Session missing system information' };
  }
  
  return { valid: true };
}

/**
 * Validate that a test permutation is complete
 * @param {Object} permutation - Permutation object to validate
 * @returns {Object} Validation result with success status and details
 */
export function validatePermutation(permutation) {
  if (!permutation) {
    return { valid: false, error: 'Permutation object is null or undefined' };
  }
  
  if (!permutation.id) {
    return { valid: false, error: 'Permutation missing ID' };
  }
  
  if (!permutation.version) {
    return { valid: false, error: 'Permutation missing version' };
  }
  
  if (!permutation.system) {
    return { valid: false, error: 'Permutation missing system' };
  }
  
  if (!permutation.description) {
    return { valid: false, error: 'Permutation missing description' };
  }
  
  return { valid: true };
}

/**
 * Validate that configuration is complete
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result with success status and details
 */
export function validateConfig(config) {
  if (!config) {
    return { valid: false, error: 'Configuration object is null or undefined' };
  }
  
  if (!config.foundryLicenseKey) {
    return { valid: false, error: 'Missing foundryLicenseKey in configuration' };
  }
  
  if (!config.docker) {
    return { valid: false, error: 'Missing docker configuration' };
  }
  
  if (!config.docker.imagePrefix) {
    return { valid: false, error: 'Missing docker.imagePrefix in configuration' };
  }
  
  if (!config.puppeteer) {
    return { valid: false, error: 'Missing puppeteer configuration' };
  }
  
  if (!config.bootstrap) {
    return { valid: false, error: 'Missing bootstrap configuration' };
  }
  
  if (!config.bootstrap.timeouts) {
    return { valid: false, error: 'Missing bootstrap.timeouts in configuration' };
  }
  
  if (!config.bootstrap.retries) {
    return { valid: false, error: 'Missing bootstrap.retries in configuration' };
  }
  
  return { valid: true };
}

/**
 * Validate that a port number is valid
 * @param {number} port - Port number to validate
 * @returns {Object} Validation result with success status and details
 */
export function validatePort(port) {
  if (typeof port !== 'number') {
    return { valid: false, error: 'Port must be a number' };
  }
  
  if (port < 1 || port > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' };
  }
  
  if (!Number.isInteger(port)) {
    return { valid: false, error: 'Port must be an integer' };
  }
  
  return { valid: true };
}

/**
 * Validate that a FoundryVTT version is supported
 * @param {string} version - Version string to validate
 * @returns {Object} Validation result with success status and details
 */
export function validateFoundryVersion(version) {
  if (typeof version !== 'string') {
    return { valid: false, error: 'Version must be a string' };
  }
  
  if (!version.startsWith('v')) {
    return { valid: false, error: 'Version must start with "v"' };
  }
  
  const versionNumber = version.substring(1);
  if (!/^\d+$/.test(versionNumber)) {
    return { valid: false, error: 'Version number must be numeric' };
  }
  
  const numVersion = parseInt(versionNumber, 10);
  if (numVersion < 10) {
    return { valid: false, error: 'FoundryVTT version must be 10 or higher' };
  }
  
  return { valid: true };
}

/**
 * Validate that a game system is supported
 * @param {string} system - System string to validate
 * @returns {Object} Validation result with success status and details
 */
export function validateGameSystem(system) {
  if (typeof system !== 'string') {
    return { valid: false, error: 'System must be a string' };
  }
  
  if (system.length === 0) {
    return { valid: false, error: 'System cannot be empty' };
  }
  
  // Add any specific system validation rules here
  const validSystems = ['dnd5e', 'pf2e', 'swade', 'cyberpunk-red'];
  if (!validSystems.includes(system)) {
    console.warn(`[Validation] Warning: System "${system}" is not in the known valid systems list`);
  }
  
  return { valid: true };
}

/**
 * Validate that a Docker image name is valid
 * @param {string} imageName - Docker image name to validate
 * @returns {Object} Validation result with success status and details
 */
export function validateDockerImageName(imageName) {
  if (typeof imageName !== 'string') {
    return { valid: false, error: 'Image name must be a string' };
  }
  
  if (imageName.length === 0) {
    return { valid: false, error: 'Image name cannot be empty' };
  }
  
  // Docker image name validation rules
  const validImageNameRegex = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;
  if (!validImageNameRegex.test(imageName)) {
    return { valid: false, error: 'Image name contains invalid characters' };
  }
  
  if (imageName.length > 128) {
    return { valid: false, error: 'Image name is too long (max 128 characters)' };
  }
  
  return { valid: true };
}

/**
 * Validate that a container name is valid
 * @param {string} containerName - Container name to validate
 * @returns {Object} Validation result with success status and details
 }
 */
export function validateContainerName(containerName) {
  if (typeof containerName !== 'string') {
    return { valid: false, error: 'Container name must be a string' };
  }
  
  if (containerName.length === 0) {
    return { valid: false, error: 'Container name cannot be empty' };
  }
  
  // Docker container name validation rules
  const validContainerNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
  if (!validContainerNameRegex.test(containerName)) {
    return { valid: false, error: 'Container name contains invalid characters' };
  }
  
  if (containerName.length > 64) {
    return { valid: false, error: 'Container name is too long (max 64 characters)' };
  }
  
  return { valid: true };
}

/**
 * Comprehensive validation of all bootstrap parameters
 * @param {Object} params - Parameters to validate
 * @returns {Object} Validation result with success status and details
 */
export function validateBootstrapParams(params) {
  const results = [];
  
  // Validate each parameter
  if (params.config) {
    results.push({ name: 'config', ...validateConfig(params.config) });
  }
  
  if (params.permutation) {
    results.push({ name: 'permutation', ...validatePermutation(params.permutation) });
  }
  
  if (params.port) {
    results.push({ name: 'port', ...validatePort(params.port) });
  }
  
  if (params.imageName) {
    results.push({ name: 'imageName', ...validateDockerImageName(params.imageName) });
  }
  
  if (params.containerName) {
    results.push({ name: 'containerName', ...validateContainerName(params.containerName) });
  }
  
  // Check if any validations failed
  const failures = results.filter(result => !result.valid);
  
  if (failures.length > 0) {
    return {
      valid: false,
      errors: failures.map(f => `${f.name}: ${f.error}`),
      details: failures
    };
  }
  
  return { valid: true, results };
}
