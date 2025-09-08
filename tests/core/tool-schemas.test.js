// SPDX-License-Identifier: MIT

import { ToolRegistry } from '../../scripts/core/tool-registry.js';

describe('Tool schema completeness and normalization', () => {
  let registry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('ensures name exists and parameters default to an object schema when missing', () => {
    const toolNoSchema = {
      name: 'no_schema_tool',
      description: 'A tool without explicit schema',
      async execute() { return { content: 'ok' }; }
    };
    registry.registerTool(toolNoSchema);

    const schemas = registry.getToolSchemas();
    const spec = schemas.find(s => s.function?.name === 'no_schema_tool');
    expect(spec).toBeDefined();
    expect(spec.type).toBe('function');
    expect(spec.function.name).toBe('no_schema_tool');
    expect(spec.function.parameters).toBeDefined();
    expect(spec.function.parameters.type).toBe('object');
    expect(spec.function.parameters.properties).toBeDefined();
    expect(typeof spec.function.parameters.properties).toBe('object');
  });

  it('normalizes non-object parameter schemas to object with properties', () => {
    const toolWeirdSchema = {
      name: 'weird_schema_tool',
      description: 'A tool with non-object schema',
      schema: { type: 'array', items: { type: 'string' } },
      async execute() { return { content: 'ok' }; }
    };
    registry.registerTool(toolWeirdSchema);

    const spec = registry.getToolSchemas().find(s => s.function?.name === 'weird_schema_tool');
    expect(spec).toBeDefined();
    expect(spec.type).toBe('function');
    expect(spec.function.parameters.type).toBe('object');
    expect(spec.function.parameters.properties).toEqual({});
  });
});

