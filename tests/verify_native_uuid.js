import { processMessageForDisplay } from '../scripts/ui/sidebar-state-syncer.js';

// MOCK GLOBALS
global.game = {
  user: { isGM: true },
  i18n: { localize: k => k },
};

global.foundry = {
  applications: {
    ux: {
      TextEditor: {
        implementation: {
          enrichHTML: async (content, options) => {
            console.log(`[TextEditor] Enriched: ${content}`);
            // Mock enrichment: Replace @UUID with Anchor
            return content.replace(/@UUID\[([^\]]+)\]/g, '<a class="entity-link">$1</a>');
          },
        },
      },
    },
  },
  utils: { randomID: () => 'id123' },
};

// Mock Showdown used by MarkdownRenderer
global.globalThis = global; // Enhance node global
global.window = {
  showdown: {
    Converter: class {
      constructor() {
        this.makeHtml = text => {
          console.log(`[Showdown] Rendering: ${text}`);
          return `<p>${text}</p>`; // Basic wrap
        };
        this.setOption = () => {};
      }
    },
  },
};

// MOCK LOGGERS
// We need to intercept logger creation or mock the module if specific paths are used
// But sidebar-state-syncer imports createLogger.
// Ideally we mock the module, but in pure node script without loader hooks, we rely on the implementation being robust or mocked via module replacement?
// Since we are running 'node script.js', we can't easily mock imports.
// However, 'createLogger' in 'utils/logger.js' likely works in node if it just uses console.
// We assume it's safe.

async function runTest() {
  console.log('--- Starting Native UUID Pipeline Verification ---');

  const input = '**Bold** and @UUID[Actor.Ogre]';
  console.log(`Input: ${input}`);

  // Call the function
  const result = await processMessageForDisplay(input);

  console.log(`Output: ${result}`);

  // Verification Logic
  const hasBoldMarkdown = result.includes('<p>**Bold**'); // Showdown mock just wraps, it doesn't parse markdown logic unless real showdown used.
  // Wait, if I mock makeHtml to just return `<p>${text}</p>`, then `**Bold**` remains `**Bold**`.
  // But `processMessageForDisplay` applies MarkdownRenderer.
  // If MarkdownRenderer thinks it's HTML, it aborts (unless force=true).
  // `enrichHTML` returns `**Bold** and <a ...>Actor.Ogre</a>`.
  // This HAS HTML tags.
  // If logic is correct (force=true), MarkdownRenderer (Mock) runs and wraps it in <p>.
  // If logic is broken (force=false), MarkdownRenderer sees HTML and aborts (returns original).

  const hasHTMLTag = result.includes('<a class="entity-link">');
  const isWrapped = result.startsWith('<p>');

  if (hasHTMLTag && isWrapped) {
    console.log('PASS: Content was Enriched AND Markdown Rendered.');
  } else {
    if (!hasHTMLTag) console.error('FAIL: Enrichment missing (UUID not converted).');
    if (!isWrapped) console.error('FAIL: Markdown rendering skipped (HTML detection blocked it?).');
    process.exit(1);
  }
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
