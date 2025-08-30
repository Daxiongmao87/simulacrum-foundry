/**
 * MarkdownParser - A utility class for converting Markdown to HTML
 * Supports GitHub-flavored Markdown including tables and other rich formatting
 */

export class MarkdownParser {
  /**
   * Convert markdown text to HTML
   * @param {string} text - The markdown text to convert
   * @return {string} - The HTML representation
   */
  static parse(text) {
    if (!text) {
      return '';
    }

    // Check if already HTML (basic check)
    if (text.trim().startsWith('<') && text.includes('</')) {
      return text;
    }

    let html = text;

    // Process code blocks first to avoid formatting inside them
    const codeBlocks = [];
    html = html.replace(/```([^`]*?)```/gs, (match, code) => {
      const id = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(`<pre><code>${this._escapeHtml(code)}</code></pre>`);
      return id;
    });

    // Process inline code
    const inlineCode = [];
    html = html.replace(/`([^`]*?)`/g, (match, code) => {
      const id = `__INLINE_CODE_${inlineCode.length}__`;
      inlineCode.push(`<code>${this._escapeHtml(code)}</code>`);
      return id;
    });

    // Process tables
    const tables = [];
    html = html.replace(
      /^\|(.+)\|\r?\n\|[-:\| ]+\|\r?\n((?:\|.+\|\r?\n)+)/gm,
      (match) => {
        const id = `__TABLE_${tables.length}__`;
        tables.push(this._parseTable(match));
        return id;
      }
    );

    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Bold, italic and both
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

    // Lists
    html = this._parseLists(html);

    // Links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank">$1</a>'
    );

    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // Horizontal rule
    html = html.replace(/^---+$/gm, '<hr>');

    // Blockquotes
    html = this._parseBlockquotes(html);

    // Paragraphs - handle consecutive lines as a single paragraph
    html = this._parseParagraphs(html);

    // Re-insert code blocks
    codeBlocks.forEach((block, i) => {
      html = html.replace(`__CODE_BLOCK_${i}__`, block);
    });

    // Re-insert inline code
    inlineCode.forEach((code, i) => {
      html = html.replace(`__INLINE_CODE_${i}__`, code);
    });

    // Re-insert tables
    tables.forEach((table, i) => {
      html = html.replace(`__TABLE_${i}__`, table);
    });

    return html;
  }

  /**
   * Parse markdown lists into HTML
   * @private
   */
  static _parseLists(text) {
    // Process ordered lists
    let html = text.replace(/^(\d+\. .+(\n|$))+/gm, (match) => {
      const items = match.split(/^\d+\. /m).filter(Boolean);
      return (
        '<ol>' +
        items.map((item) => `<li>${item.trim()}</li>`).join('') +
        '</ol>'
      );
    });

    // Process unordered lists
    html = html.replace(/^([\*\-] .+(\n|$))+/gm, (match) => {
      const items = match.split(/^[\*\-] /m).filter(Boolean);
      return (
        '<ul>' +
        items.map((item) => `<li>${item.trim()}</li>`).join('') +
        '</ul>'
      );
    });

    return html;
  }

  /**
   * Parse markdown blockquotes into HTML
   * @private
   */
  static _parseBlockquotes(text) {
    // Find blockquote sections (lines starting with >)
    return text.replace(/^>\s*(.*?)$(\n^>\s*(.*?)$)*/gm, (match) => {
      // Extract the content from each line
      const content = match.replace(/^>\s*(.*?)$/gm, '$1').trim();
      return `<blockquote>${content}</blockquote>`;
    });
  }

  /**
   * Parse markdown paragraphs
   * @private
   */
  static _parseParagraphs(text) {
    // Skip parsing paragraphs inside certain elements
    const splitText = text.split(
      /(<\/?(?:h[1-6]|ul|ol|li|blockquote|div|pre|table|tr|td|th)[^>]*>)/g
    );

    let inBlock = false;
    const result = [];

    for (let i = 0; i < splitText.length; i++) {
      const part = splitText[i];

      // Check if we're entering or leaving a block element
      if (
        part.match(
          /<(?:h[1-6]|ul|ol|li|blockquote|div|pre|table|tr|td|th)[^>]*>/
        )
      ) {
        inBlock = true;
        result.push(part);
      } else if (
        part.match(
          /<\/(?:h[1-6]|ul|ol|li|blockquote|div|pre|table|tr|td|th)[^>]*>/
        )
      ) {
        inBlock = false;
        result.push(part);
      } else if (!inBlock) {
        // If not inside a block element, wrap with paragraphs
        if (part.trim() !== '') {
          // Separate by blank lines and wrap each in paragraph
          const paragraphs = part.split(/\n{2,}/g);
          for (let j = 0; j < paragraphs.length; j++) {
            if (paragraphs[j].trim() !== '') {
              result.push(`<p>${paragraphs[j].trim()}</p>`);
            }
          }
        }
      } else {
        // Inside block, leave as is
        result.push(part);
      }
    }

    return result.join('');
  }

  /**
   * Parse markdown tables into HTML
   * @private
   */
  static _parseTable(tableText) {
    const lines = tableText.trim().split('\n');
    let html = '<table><thead><tr>';

    // Process header row
    const headers = lines[0].split('|').filter((cell) => cell.trim() !== '');
    for (const header of headers) {
      html += `<th>${header.trim()}</th>`;
    }
    html += '</tr></thead><tbody>';

    // Process alignment row (line[1]) and data rows (line[2+])
    const alignments = [];
    const alignmentCells = lines[1]
      .split('|')
      .filter((cell) => cell.trim() !== '');

    for (const cell of alignmentCells) {
      const trimmed = cell.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
        alignments.push('center');
      } else if (trimmed.endsWith(':')) {
        alignments.push('right');
      } else {
        alignments.push('left');
      }
    }

    // Process data rows
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        continue;
      }

      html += '<tr>';
      const cells = line.split('|').filter((cell) => cell.trim() !== '');

      for (let j = 0; j < cells.length; j++) {
        const alignment = j < alignments.length ? alignments[j] : 'left';
        html += `<td style="text-align: ${alignment}">${cells[j].trim()}</td>`;
      }

      html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
  }

  /**
   * Escape HTML special characters
   * @private
   */
  static _escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
