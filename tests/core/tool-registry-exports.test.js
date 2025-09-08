// SPDX-License-Identifier: MIT

import defaultRegistry, { toolRegistry } from '../../scripts/core/tool-registry.js';

describe('tool-registry exports', () => {
  it('exports a default registry instance', () => {
    expect(defaultRegistry).toBeDefined();
    expect(typeof defaultRegistry).toBe('object');
  });

  it('exports a named toolRegistry instance', () => {
    expect(toolRegistry).toBeDefined();
    expect(typeof toolRegistry).toBe('object');
  });
});

