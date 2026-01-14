/* eslint-disable complexity */
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MarkdownRenderer');
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const MARKDOWN_PATTERN = new RegExp(
  /(\*\*|__|[_*]{1}|`{1,3}|~~|^>\s|\n>\s|\n[-*+]\s|\n\d+\.\s|^#{1,6}\s|```)/.source,
  'm'
);
const IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi;

function resolveShowdownOptions() {
  const foundryOptions =
    globalThis?.foundry?.constants?.SHOWDOWN_OPTIONS ??
    globalThis?.foundry?.common?.constants?.SHOWDOWN_OPTIONS ??
    globalThis?.SHOWDOWN_OPTIONS ??
    {};
  return foundryOptions;
}

function stripImages(html) {
  return html.replace(IMAGE_TAG_PATTERN, '');
}

/**
 * Sanitize HTML to ensure all tags are properly closed.
 * Uses DOMParser to parse and re-serialize, which automatically fixes unclosed tags.
 * This prevents malformed HTML from breaking the DOM structure (e.g., unclosed <em> tags
 * causing subsequent elements to be nested inside them).
 * @param {string} html - The HTML string to sanitize
 * @returns {string} Well-formed HTML string
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return html;

  try {
    // Use DOMParser to parse HTML - it automatically closes unclosed tags
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');

    // Extract the content from the wrapper div
    const wrapper = doc.body.querySelector('div');
    return wrapper ? wrapper.innerHTML : html;
  } catch (err) {
    // If parsing fails for any reason, return original HTML
    logger.warn('HTML sanitization failed; returning original content', err);
    return html;
  }
}

export class MarkdownRenderer {
  static #converter;

  static reset() {
    MarkdownRenderer.#converter = undefined;
  }

  static looksLikeHtml(text) {
    return HTML_PATTERN.test(text);
  }

  static looksLikeMarkdown(text) {
    return MARKDOWN_PATTERN.test(text);
  }

  static #ensureConverter() {
    // Only return if we have a valid converter instance
    if (MarkdownRenderer.#converter) return MarkdownRenderer.#converter;

    const showdown = globalThis?.window?.showdown;
    if (!showdown?.Converter) {
      // Do not cache null/failure, allowing retry on next render attempt
      // This prevents permanent breakage if accessed before Showdown library loads
      logger.warn('Showdown converter unavailable (yet?); leaving markdown unconverted');
      return null;
    }

    try {
      const options = resolveShowdownOptions();
      if (showdown.setOption) {
        for (const [key, value] of Object.entries(options)) {
          showdown.setOption(key, value);
        }
      }
      MarkdownRenderer.#converter = new showdown.Converter();
    } catch (err) {
      logger.error('Failed to initialize Showdown converter', err);
      // Do not cache failure to allow recovery
      return null;
    }

    return MarkdownRenderer.#converter;
  }

  static async render(raw, options = {}) {
    const {
      disable = false,
      allowHtml = true,
      stripImages: removeImages = false,
      force = false,
    } = options;
    const text = typeof raw === 'string' ? raw : String(raw ?? '');

    if (!text.trim()) return '';
    if (disable) return text;

    if (!force && MarkdownRenderer.looksLikeHtml(text)) {
      return allowHtml ? text : text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // If force is true, bypass the markdown detection heuristic
    if (!force && !MarkdownRenderer.looksLikeMarkdown(text)) {
      return text;
    }

    const converter = MarkdownRenderer.#ensureConverter();
    if (!converter) return text;

    try {
      let html = converter.makeHtml(text);

      // Sanitize HTML to ensure all tags are properly closed
      // This prevents DOM corruption from unclosed <em>/<strong> tags
      html = sanitizeHtml(html);

      if (!allowHtml) {
        html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      if (removeImages) {
        html = stripImages(html);
      }
      return html;
    } catch (err) {
      logger.warn('Markdown conversion failed; returning original content', err);
      return text;
    }
  }
}

export default MarkdownRenderer;
