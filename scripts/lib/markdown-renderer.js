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
  const foundryOptions = globalThis?.foundry?.constants?.SHOWDOWN_OPTIONS
    ?? globalThis?.foundry?.common?.constants?.SHOWDOWN_OPTIONS
    ?? globalThis?.SHOWDOWN_OPTIONS
    ?? {};
  return foundryOptions;
}

function stripImages(html) {
  return html.replace(IMAGE_TAG_PATTERN, '');
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
    if (MarkdownRenderer.#converter !== undefined) return MarkdownRenderer.#converter;

    const showdown = globalThis?.window?.showdown;
    if (!showdown?.Converter) {
      logger.warn('Showdown converter unavailable; leaving markdown unconverted');
      MarkdownRenderer.#converter = null;
      return MarkdownRenderer.#converter;
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
      MarkdownRenderer.#converter = null;
    }

    return MarkdownRenderer.#converter;
  }

  static async render(raw, options = {}) {
    const { disable = false, allowHtml = true, stripImages: removeImages = false } = options;
    const text = typeof raw === 'string' ? raw : String(raw ?? '');

    if (!text.trim()) return '';
    if (disable) return text;

    if (MarkdownRenderer.looksLikeHtml(text)) {
      return allowHtml ? text : text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    if (!MarkdownRenderer.looksLikeMarkdown(text)) {
      return text;
    }

    const converter = MarkdownRenderer.#ensureConverter();
    if (!converter) return text;

    try {
      let html = converter.makeHtml(text);
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
