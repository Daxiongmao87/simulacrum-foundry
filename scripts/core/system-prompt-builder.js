/* eslint-disable complexity, max-lines-per-function, no-console */
/**
 * System Prompt Builder - Generates system prompts for AI conversations
 * Extracted from SimulacrumCore to reduce god class responsibilities
 */

import { createLogger } from '../utils/logger.js';
import { toolRegistry } from './tool-registry.js';

const logger = createLogger('SystemPrompt');

/**
 * Get document types information for the system prompt
 * @returns {string} Formatted document types info
 */
export function getDocumentTypesInfo() {
  try {
    const documentTypes = Object.keys(game?.documentTypes || {}).filter(type => {
      const collection = game?.collections?.get(type);
      return collection !== undefined;
    });

    if (documentTypes.length === 0) {
      return 'No document types available in current system.';
    }

    const typeDetails = documentTypes.map(type => {
      const subtypes = game.documentTypes[type] || [];
      if (subtypes.length > 0) {
        return `${type}: [${subtypes.join(', ')}]`;
      }
      return type;
    });

    return `Available document types: ${typeDetails.join(', ')}.`;
  } catch (error) {
    return 'Document type information unavailable.';
  }
}

/**
 * Get formatted list of available macros (World + Module)
 * @returns {Promise<string>} Formatted list of macros
 */
export async function getAvailableMacrosList() {
  const macros = [];

  // 1. World Macros
  game.macros.forEach(m => {
    macros.push(`- "${m.name}" (UUID: ${m.uuid})`);
  });

  // 2. Simulacrum Module Macros
  const pack = game.packs.get('simulacrum.simulacrum-macros');
  if (pack) {
    const index = await pack.getIndex();
    index.forEach(i => {
      macros.push(`- "${i.name}" (UUID: ${i.uuid})`);
    });
  }

  if (macros.length === 0) return 'No macros available.';
  return macros.join('\n');
}

/**
 * Build the complete system prompt
 * @returns {Promise<string>} The system prompt
 */
export async function buildSystemPrompt() {
  const documentTypesInfo = getDocumentTypesInfo();
  const legacyMode = game?.settings?.get('simulacrum', 'legacyMode') || false;
  const customSystemPrompt = game?.settings?.get('simulacrum', 'customSystemPrompt') || '';

  // Fetch available macros (World + Module) for execution context
  const macrosList = await getAvailableMacrosList();

  let basePrompt;

  if (legacyMode) {
    let toolSchemas = '';
    try {
      const schemas = toolRegistry.getToolSchemas();
      // Assertion: schemas must be present and well-formed in legacy mode
      const hasSchemas = Array.isArray(schemas) && schemas.length > 0;
      const allWellFormed =
        hasSchemas &&
        schemas.every(
          s =>
            s &&
            s.type === 'function' &&
            s.function &&
            s.function.name &&
            s.function.parameters &&
            s.function.parameters.type === 'object'
        );
      if (!hasSchemas || !allWellFormed) {
        // Log a clear warning for maintainers and guide the model conservatively
        logger.warn(
          'Legacy mode active but tool schemas are missing or malformed; tool calls may fail.'
        );
        toolSchemas = '\n\nWARNING: Tool schemas are unavailable. Do NOT attempt tool calls.';
      } else {
        toolSchemas = `\n\nAvailable tool schemas:\n${JSON.stringify(schemas, null, 2)}`;
      }
    } catch (e) {
      logger.error('Failed to retrieve tool schemas for legacy mode', e);
    }

    basePrompt = [
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Intro_v2'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.CriticalRules'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.ResearchFirst'),
      documentTypesInfo,
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Instructions'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Format'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Warning'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.Action'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.DocumentSchema'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.TaskTracking'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Legacy.EndTask'),
      toolSchemas,
    ].join('\n\n');
  } else {
    basePrompt = [
      game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.Identity'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.CriticalRules'),
      documentTypesInfo,
      game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.StrategicProtocol'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.TaskManagement'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.ToolOperatives'),
      `## Available Macros\nThe following macros are available for execution via the execute_macro tool:\n${macrosList}`,
      game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.CommunicationStyle_v2'),
      game.i18n.localize('SIMULACRUM.SystemPrompt.Standard.LoopTermination'),
    ].join('\n\n');
  }

  // Append custom system prompt if provided
  if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
    const customInstructions = game.i18n.format('SIMULACRUM.SystemPrompt.CustomInstructions', {
      customPrompt: customSystemPrompt.trim(),
    });
    basePrompt = basePrompt + '\n\n' + customInstructions;
  }

  // Security check: verify no HTML tags exist in the prompt (logged only in debug mode)
  if (globalThis.CONFIG?.debug?.simulacrum) {
    const tagRegex = /<\/?[a-z][a-z0-9]*\b[^>]*>/gi;
    const foundTags = basePrompt.match(tagRegex) || [];
    const isClean = foundTags.length === 0;

    logger.debug('System Prompt Verification');
    logger.debug(`Content Length: ${basePrompt.length}`);
    if (isClean) {
      logger.debug('Security Check: PASS (No forbidden HTML tags found)');
    } else {
      logger.error(
        `Security Check: FAIL (Found tags: ${foundTags.slice(0, 10).join(', ')}${foundTags.length > 10 ? '...' : ''})`
      );
      logger.warn('The presence of ANY HTML tags may trigger the API WAF.');
    }
  }

  return basePrompt;
}
