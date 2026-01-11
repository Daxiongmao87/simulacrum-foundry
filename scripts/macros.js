/**
 * Simulacrum Macros - Defaults and management
 */

import { createLogger } from './utils/logger.js';

export const SIMULACRUM_MACRO_DEFINITIONS = [
  {
    name: 'Simulacrum: Clear Chat',
    type: 'script',
    img: 'icons/magic/light/explosion-star-glow-silhouette.webp',
    command: `
// Clear Simulacrum History
if (typeof SimulacrumCore !== 'undefined') {
  SimulacrumCore.clearConversation().then(success => {
    if (success) ui.notifications.info("Simulacrum conversation cleared.");
  });
}
    `.trim(),
  },
  {
    name: 'Simulacrum: Open Assistant',
    type: 'script',
    img: 'icons/tools/scribal/ink-quill-book-purple.webp',
    command: `ui.sidebar.activateTab('simulacrum');`,
  },
  {
    name: 'Simulacrum: Reset Settings to Default',
    type: 'script',
    img: 'icons/magic/time/arrows-circling-green.webp',
    command: `
// Reset Simulacrum Settings
if (typeof SimulacrumCore !== 'undefined') {
  new Dialog({
    title: "Reset Simulacrum",
    content: "<p>Reset all Simulacrum settings to default?</p>",
    buttons: {
      yes: {
        label: "Reset",
        callback: async () => {
             const defaults = {
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                maxTokens: 4096,
                temperature: 0.7,

             };
             for (const [k, v] of Object.entries(defaults)) {
                await game.settings.set('simulacrum', k, v);
             }
             ui.notifications.info("Simulacrum settings reset.");
        }
      },
      no: { label: "Cancel" }
    }
  }).render(true);
}
    `.trim(),
  },
];

export async function ensureSimulacrumMacros() {
  const logger = createLogger('Macros');
  // Check if we have a folder
  let folder = game.folders.find(f => f.name === 'Simulacrum Macros' && f.type === 'Macro');

  // Decide whether to auto-create logic:
  // We don't want to spam macros every reload if user deleted them.
  // But for now, we'll verify if they exist by name.

  // Actually, let's just create them if they don't exist ANYWHERE.

  for (const def of SIMULACRUM_MACRO_DEFINITIONS) {
    const existing = game.macros.some(m => m.name === def.name);
    if (!existing) {
      if (!folder) {
        folder = await Folder.create({
          name: 'Simulacrum Macros',
          type: 'Macro',
          color: '#8A2BE2',
        });
      }
      try {
        await Macro.create({
          ...def,
          folder: folder.id,
        });
        logger.info(`Created default macro: ${def.name}`);
      } catch (err) {
        logger.error(`Failed to create macro ${def.name}`, err);
      }
    }
  }
}
