// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { DocumentAPI } from '../../scripts/core/document-api';

describe('DocumentAPI Schema Retrieval', () => {
  beforeEach(() => {
    global.game = {
      documentTypes: {
        Actor: ['Actor'],
        Item: ['Item'],
      },
      collections: new Map([
        ['Actor', new Map()],
        ['Item', new Map()],
      ]),
    };

    const effectSchema = {
      fields: {
        label: { type: 'String' },
        duration: { type: 'Number' },
      },
    };

    const itemSchema = {
      fields: {
        name: { type: 'String' },
        description: { type: 'String' },
      },
      has: (field) => field === 'system',
      getField: (field) => {
        if (field === 'system') {
          return {
            fields: {
              damage: { type: 'String' },
              range: { type: 'String' },
            },
          };
        }
        return null;
      },
    };

    global.CONFIG = {
      Actor: {
        documentClass: {
          schema: { fields: { name: { type: 'String' } } },
          hierarchy: {},
        },
      },
      Item: {
        documentClass: {
          schema: itemSchema,
          hierarchy: {
            Effect: {
              schema: effectSchema,
              hierarchy: {},
            },
          },
        },
      },
    };
  });

  afterEach(() => {
    delete global.game;
    delete global.CONFIG;
  });

  test('should retrieve the schema for a top-level document type', () => {
    const schema = DocumentAPI.getDocumentSchema('Actor');
    expect(schema).not.toBeNull();
    expect(schema.type).toBe('Actor');
    expect(schema.fields).toEqual(['name']);
  });

  test('should retrieve the schema for an embedded document type', () => {
    const schema = DocumentAPI.getDocumentSchema('Effect');
    expect(schema).not.toBeNull();
    expect(schema.type).toBe('Effect');
    expect(schema.fields).toEqual(['label', 'duration']);
  });

  test('should return null for an invalid document type', () => {
    const schema = DocumentAPI.getDocumentSchema('InvalidType');
    expect(schema).toBeNull();
  });
});
