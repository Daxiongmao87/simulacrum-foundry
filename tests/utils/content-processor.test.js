/**
 * Tests for Content Processing Utilities
 */

import { transformThinkTags, hasThinkTags } from '../../scripts/utils/content-processor.js';

describe('Content Processor Utils', () => {
  describe('hasThinkTags', () => {
    it('should detect literal think tags', () => {
      const content = 'Some text <think>internal thoughts</think> more text';
      expect(hasThinkTags(content)).toBe(true);
    });

    it('should detect HTML-escaped think tags', () => {
      const content = 'Some text &lt;think&gt;internal thoughts&lt;/think&gt; more text';
      expect(hasThinkTags(content)).toBe(true);
    });

    it('should return false for content without think tags', () => {
      const content = 'Just regular content with no special tags';
      expect(hasThinkTags(content)).toBe(false);
    });

    it('should handle null/undefined content', () => {
      expect(hasThinkTags(null)).toBe(false);
      expect(hasThinkTags(undefined)).toBe(false);
      expect(hasThinkTags('')).toBe(false);
    });

    it('should handle non-string content', () => {
      expect(hasThinkTags(123)).toBe(false);
      expect(hasThinkTags({})).toBe(false);
      expect(hasThinkTags([])).toBe(false);
    });
  });

  describe('transformThinkTags', () => {
    it('should transform literal think tags to collapsible HTML', () => {
      const input = 'Hello <think>I should be helpful</think> world';
      const result = transformThinkTags(input);

      expect(result).toContain('<details class="simulacrum-thoughts">');
      expect(result).toContain('<summary>🤔 Thoughts</summary>');
      expect(result).toContain('<div class="think-content">I should be helpful</div>');
      expect(result).toContain('</details>');
      expect(result).toContain('Hello');
      expect(result).toContain('world');
    });

    it('should transform HTML-escaped think tags', () => {
      const input = 'Text &lt;think&gt;escaped thoughts&lt;/think&gt; more text';
      const result = transformThinkTags(input);

      expect(result).toContain('<details class="simulacrum-thoughts">');
      expect(result).toContain('escaped thoughts');
    });

    it('should handle multiple think blocks', () => {
      const input = '<think>First thought</think> text <think>Second thought</think>';
      const result = transformThinkTags(input);

      // Should have two details elements
      const detailsCount = (result.match(/<details/g) || []).length;
      expect(detailsCount).toBe(2);

      expect(result).toContain('First thought');
      expect(result).toContain('Second thought');
    });

    it('should escape HTML content within think tags', () => {
      const input = '<think>This contains <script>alert("xss")</script> dangerous content</think>';
      const result = transformThinkTags(input);

      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should preserve line breaks in think content', () => {
      const input = '<think>Line 1\nLine 2\nLine 3</think>';
      const result = transformThinkTags(input);

      expect(result).toContain('Line 1<br>Line 2<br>Line 3');
    });

    it('should handle empty think tags', () => {
      const input = 'Text <think></think> more text';
      const result = transformThinkTags(input);

      expect(result).toBe('Text  more text');
    });

    it('should handle whitespace-only think tags', () => {
      const input = 'Text <think>   \n  \t  </think> more text';
      const result = transformThinkTags(input);

      expect(result).toBe('Text  more text');
    });

    it('should handle nested quotes and special characters', () => {
      const input = '<think>She said "Hello" & he replied \'Hi\' with 50% confidence</think>';
      const result = transformThinkTags(input);

      expect(result).toContain('&quot;Hello&quot;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&#39;Hi&#39;');
    });

    it('should handle mixed literal and escaped tags', () => {
      const input = '<think>Literal</think> and &lt;think&gt;escaped&lt;/think&gt;';
      const result = transformThinkTags(input);

      const detailsCount = (result.match(/<details/g) || []).length;
      expect(detailsCount).toBe(2);

      expect(result).toContain('Literal');
      expect(result).toContain('escaped');
    });

    it('should gracefully handle malformed tags', () => {
      const input = '<think>Unclosed tag and <think>nested <think>tags</think>';
      const result = transformThinkTags(input);

      // Should transform what it can and leave malformed parts
      expect(result).toContain('<details');
    });

    it('should handle null/undefined input', () => {
      expect(transformThinkTags(null)).toBeNull();
      expect(transformThinkTags(undefined)).toBeUndefined();
      expect(transformThinkTags('')).toBe('');
    });

    it('should handle non-string input', () => {
      expect(transformThinkTags(123)).toBe(123);
      expect(transformThinkTags({})).toEqual({});
      expect(transformThinkTags([])).toEqual([]);
    });

    it('should return original content when no think tags present', () => {
      const input = 'Just regular content with no special tags';
      expect(transformThinkTags(input)).toBe(input);
    });

    it('should handle case-insensitive matching', () => {
      const input = '<THINK>uppercase tags</THINK> and <Think>mixed case</Think>';
      const result = transformThinkTags(input);

      expect(result).toContain('uppercase tags');
      expect(result).toContain('mixed case');
    });
  });

  describe('error handling', () => {
    it('should gracefully handle transformation errors', () => {
      // Mock console.warn to test error handling
      const originalWarn = console.warn;
      console.warn = jest.fn();

      // Force an error by temporarily breaking the regex
      const originalReplace = String.prototype.replace;
      try {
        String.prototype.replace = function () {
          throw new Error('Mock error');
        };

        const input = '<think>test content</think>';
        const result = transformThinkTags(input);

        // Should return original content and log warning
        expect(result).toBe(input);
        expect(console.warn).toHaveBeenCalledWith('[Simulacrum:ContentProcessor]', 'Failed to transform think tags:', expect.any(Error));
      } finally {
        // Restore mocks
        String.prototype.replace = originalReplace;
        console.warn = originalWarn;
      }
    });
  });
});