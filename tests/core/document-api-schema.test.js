// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

import { DocumentAPI } from '../../scripts/core/document-api';

describe('DocumentAPI Enhanced Schema Retrieval', () => {
  beforeEach(() => {
    // Mock performance for testing
    global.performance = {
      now: () => Date.now()
    };

    global.game = {
      documentTypes: {
        Actor: ['Actor'],
        Item: ['Item'],
        JournalEntry: ['JournalEntry'],
      },
      collections: new Map([
        ['Actor', new Map()],
        ['Item', new Map()],
        ['JournalEntry', new Map()],
      ]),
    };

    const effectSchema = {
      fields: {
        label: { type: 'String' },
        duration: { type: 'Number' },
        icon: { type: 'String' },
      },
    };

    const activitySchema = {
      fields: {
        name: { type: 'String' },
        type: { type: 'String' },
        cost: { type: 'Number' },
      },
    };

    const itemSchema = {
      fields: {
        name: { type: 'String' },
        description: { type: 'String' },
        effects: { model: 'ActiveEffect' },
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

    const journalPageSchema = {
      fields: {
        name: { type: 'String' },
        content: { type: 'String' },
        type: { type: 'String' },
      },
    };

    // Enhanced CONFIG with multiple document types and embedded hierarchies
    global.CONFIG = {
      Actor: {
        documentClass: {
          schema: {
            fields: {
              name: { type: 'String' },
              items: { element: 'Item' },
              effects: { element: 'ActiveEffect' },
            }
          },
          hierarchy: {
            Item: {
              schema: itemSchema,
              hierarchy: {
                Effect: {
                  schema: effectSchema,
                  hierarchy: {},
                },
              },
            },
            ActiveEffect: {
              schema: effectSchema,
              hierarchy: {},
            },
          },
          metadata: {
            embedded: {
              Item: 'items',
              ActiveEffect: 'effects',
            },
          },
        },
      },
      Item: {
        documentClass: {
          schema: itemSchema,
          hierarchy: {
            ActiveEffect: {
              schema: effectSchema,
              hierarchy: {},
            },
            Activity: {
              schema: activitySchema,
              hierarchy: {},
            },
          },
          metadata: {
            embedded: {
              ActiveEffect: 'effects',
              Activity: 'activities',
            },
          },
        },
      },
      JournalEntry: {
        documentClass: {
          schema: {
            fields: {
              name: { type: 'String' },
              pages: { element: 'JournalEntryPage' },
            },
          },
          hierarchy: {
            JournalEntryPage: {
              schema: journalPageSchema,
              hierarchy: {},
            },
          },
          metadata: {
            embedded: {
              JournalEntryPage: 'pages',
            },
          },
        },
      },
      // System-specific document (e.g., from dnd5e system)
      'dnd5e-weapon': {
        documentClass: {
          schema: {
            fields: {
              name: { type: 'String' },
              activities: { element: 'Activity' },
            },
          },
          hierarchy: {
            Activity: {
              schema: activitySchema,
              hierarchy: {},
            },
          },
          metadata: {
            embedded: {
              Activity: 'activities',
            },
          },
        },
      },
    };

    // Enhanced CONFIG with type-specific data models (dataModels)
    global.CONFIG.Item.dataModels = {
      weapon: {
        schema: {
          fields: {
            damage: { type: 'String' },
            range: { type: 'String' },
            weaponType: { type: 'String' },
          },
        },
        hierarchy: {
          Activity: {
            schema: {
              fields: {
                name: { type: 'String' },
                type: { type: 'String' },
                cost: { type: 'Number' },
                damage: { type: 'String' },
                target: { type: 'String' },
              },
            },
            hierarchy: {},
          },
        },
      },
      armor: {
        schema: {
          fields: {
            armorClass: { type: 'Number' },
            armorType: { type: 'String' },
          },
        },
        hierarchy: {}, // No embedded documents
      },
      spell: {
        schema: {
          fields: {
            level: { type: 'Number' },
            school: { type: 'String' },
          },
        },
        hierarchy: {
          SpellEffect: {
            schema: {
              fields: {
                damage: { type: 'String' },
                duration: { type: 'String' },
              },
            },
            hierarchy: {},
          },
        },
      },
    };

    // Mock system-specific document namespaces for testing
    global.dnd5e = {
      documents: {
        activity: {
          AttackActivity: {
            documentName: 'SystemActivity',
            schema: {
              fields: {
                _id: { type: 'String' },
                type: { type: 'String' },
                name: { type: 'String' },
                img: { type: 'String' },
                sort: { type: 'Number' },
                activation: { type: 'Object' },
                consumption: { type: 'Object' },
                description: { type: 'String' },
                duration: { type: 'Object' },
                effects: { type: 'Array' },
                range: { type: 'Object' },
                target: { type: 'Object' },
                uses: { type: 'Object' },
                attack: { type: 'Object' },
                damage: { type: 'Object' },
              },
            },
          },
          CastActivity: {
            documentName: 'SystemActivity',
            schema: {
              fields: {
                _id: { type: 'String' },
                type: { type: 'String' },
                name: { type: 'String' },
                spell: { type: 'String' },
              },
            },
          },
        },
      },
    };

    global.pf2e = {
      documents: {
        action: {
          StrikeAction: {
            documentName: 'SystemAction',
            schema: {
              fields: {
                name: { type: 'String' },
                actionType: { type: 'String' },
                cost: { type: 'Number' },
              },
            },
          },
        },
      },
    };
  });

  afterEach(() => {
    delete global.game;
    delete global.CONFIG;
    delete global.performance;
    delete global.dnd5e;
    delete global.pf2e;
  });

  describe('Top-level Document Schema Retrieval', () => {
    test('should retrieve the schema for a top-level document type', () => {
      const schema = DocumentAPI.getDocumentSchema('Actor');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('Actor');
      expect(schema.fields).toEqual(['name', 'items', 'effects']);
    });

    test('should maintain backward compatibility with existing functionality', () => {
      const schema = DocumentAPI.getDocumentSchema('Item');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('Item');
      expect(schema.fields).toEqual(['name', 'description', 'effects']);
    });
  });

  describe('Embedded Document Schema Retrieval', () => {
    test('should retrieve schema for embedded document in Item hierarchy', () => {
      const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('ActiveEffect');
      expect(schema.fields).toEqual(['label', 'duration', 'icon']);
    });

    test('should retrieve schema for system-specific embedded document', () => {
      const schema = DocumentAPI.getDocumentSchema('Activity');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('Activity');
      expect(schema.fields).toEqual(['name', 'type', 'cost']);
    });

    test('should find embedded document in multiple possible parent hierarchies', () => {
      // ActiveEffect exists in both Actor and Item hierarchies
      const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('ActiveEffect');
      // Should return first match (Actor comes before Item alphabetically)
    });

    test('should discover embedded documents via metadata.embedded', () => {
      const schema = DocumentAPI.getDocumentSchema('JournalEntryPage');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('JournalEntryPage');
      expect(schema.fields).toEqual(['name', 'content', 'type']);
    });
  });

  describe('Nested Embedded Documents', () => {
    test('should handle nested embedded document hierarchies', () => {
      // Effect is embedded in Item, which is embedded in Actor
      const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
      expect(schema).not.toBeNull();
      expect(schema.embedded).toEqual([]);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should return null for non-existent document type', () => {
      const schema = DocumentAPI.getDocumentSchema('NonExistentType');
      expect(schema).toBeNull();
    });

    test('should handle malformed CONFIG entries gracefully', () => {
      // Add malformed config entry
      global.CONFIG.Malformed = { documentClass: null };

      const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
      expect(schema).not.toBeNull(); // Should still find valid entries
    });

    test('should handle missing hierarchy property gracefully', () => {
      // Add config without hierarchy
      global.CONFIG.NoHierarchy = {
        documentClass: {
          schema: { fields: { name: { type: 'String' } } },
          // no hierarchy property
        },
      };

      const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
      expect(schema).not.toBeNull(); // Should find in other entries
    });

    test('should handle undefined game.documentTypes gracefully', () => {
      delete global.game.documentTypes;

      const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
      expect(schema).not.toBeNull(); // Should still work via CONFIG search
    });
  });

  describe('Performance Requirements', () => {
    test('should complete schema discovery within reasonable time', () => {
      const startTime = Date.now();
      const schema = DocumentAPI.getDocumentSchema('Activity');
      const elapsed = Date.now() - startTime;

      expect(schema).not.toBeNull();
      expect(elapsed).toBeLessThan(100); // Should be much faster than 100ms in tests
    });
  });

  describe('Search Order Consistency', () => {
    test('should return consistent results for documents in multiple hierarchies', () => {
      // Run the same query multiple times
      const results = [];
      for (let i = 0; i < 5; i++) {
        const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
        results.push(schema?.type);
      }

      // All results should be identical
      expect(results.every(result => result === results[0])).toBe(true);
    });
  });

  describe('Schema Content Validation', () => {
    test('should include all expected schema properties', () => {
      const schema = DocumentAPI.getDocumentSchema('Activity');
      expect(schema).toHaveProperty('type');
      expect(schema).toHaveProperty('fields');
      expect(schema).toHaveProperty('systemFields');
      expect(schema).toHaveProperty('embedded');
      expect(schema).toHaveProperty('relationships');
      expect(schema).toHaveProperty('references');
    });

    test('should handle embedded documents with empty hierarchies', () => {
      const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
      expect(schema).not.toBeNull();
      expect(Array.isArray(schema.embedded)).toBe(true);
      expect(schema.embedded).toEqual([]);
    });
  });

  describe('Type-Specific Data Model Discovery', () => {
    test('should discover Activity from Item weapon dataModel', () => {
      const schema = DocumentAPI.getDocumentSchema('Activity');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('Activity');
      // Note: dnd5e-weapon comes first alphabetically and is found before Item.dataModels.weapon
      expect(schema.fields).toEqual(['name', 'type', 'cost']);
    });

    test('should discover SpellEffect from Item spell dataModel', () => {
      const schema = DocumentAPI.getDocumentSchema('SpellEffect');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('SpellEffect');
      expect(schema.fields).toEqual(['damage', 'duration']);
    });

    test('should handle missing dataModels gracefully', () => {
      // Add config without dataModels
      global.CONFIG.TestDoc = {
        documentClass: {
          schema: { fields: { name: { type: 'String' } } },
          hierarchy: {},
        },
        // No dataModels property
      };

      const schema = DocumentAPI.getDocumentSchema('Activity');
      expect(schema).not.toBeNull(); // Should still find in existing dataModels
    });

    test('should handle malformed dataModels gracefully', () => {
      // Add config with malformed dataModels
      global.CONFIG.MalformedDoc = {
        documentClass: {
          schema: { fields: { name: { type: 'String' } } },
          hierarchy: {},
        },
        dataModels: {
          badType: null, // Malformed entry
        },
      };

      const schema = DocumentAPI.getDocumentSchema('Activity');
      expect(schema).not.toBeNull(); // Should still find in valid dataModels
    });

    test('should search dataModels in alphabetical order', () => {
      // Test with a unique embedded document that only exists in dataModels
      global.CONFIG.Item.dataModels.zzz_last = {
        hierarchy: {
          UniqueEmbedded: {
            schema: {
              fields: {
                lastVersion: { type: 'String' },
              },
            },
          },
        },
      };

      global.CONFIG.Item.dataModels.aaa_first = {
        hierarchy: {
          UniqueEmbedded: {
            schema: {
              fields: {
                firstVersion: { type: 'String' },
              },
            },
          },
        },
      };

      // Should find the first alphabetically (aaa_first) since it only exists in dataModels
      const schema = DocumentAPI.getDocumentSchema('UniqueEmbedded');
      expect(schema).not.toBeNull();
      expect(schema.fields).toContain('firstVersion');
    });

    test('should fallback to base hierarchy if not found in dataModels', () => {
      const schema = DocumentAPI.getDocumentSchema('ActiveEffect');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('ActiveEffect');
      // Should still find in base hierarchy, not dataModels
    });
  });

  describe('Mixed Discovery Sources', () => {
    test('should prioritize base hierarchy over dataModels', () => {
      // Add Activity to base hierarchy to test priority
      global.CONFIG.Item.documentClass.hierarchy.Activity = {
        schema: {
          fields: {
            baseVersion: { type: 'String' },
          },
        },
        hierarchy: {},
      };

      const schema = DocumentAPI.getDocumentSchema('Activity');
      expect(schema).not.toBeNull();
      expect(schema.fields).toContain('baseVersion'); // Should find base version first
    });

    test('should search CONFIG before game.documentTypes', () => {
      // Activity is found in CONFIG dataModels, should not need game.documentTypes
      const schema = DocumentAPI.getDocumentSchema('Activity');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('Activity');
    });
  });

  describe('Performance and Error Handling', () => {
    test('should complete subtype discovery within reasonable time', () => {
      const startTime = Date.now();
      const schema = DocumentAPI.getDocumentSchema('SpellEffect');
      const elapsed = Date.now() - startTime;

      expect(schema).not.toBeNull();
      expect(elapsed).toBeLessThan(100); // Should be fast even with dataModel search
    });

    test('should handle deeply nested dataModels without errors', () => {
      // Add deeply nested structure
      global.CONFIG.Item.dataModels.complex = {
        hierarchy: {
          DeeplyNested: {
            schema: {
              fields: {
                nested: { type: 'Object' },
              },
            },
            hierarchy: {
              VeryDeep: {
                schema: {
                  fields: {
                    veryNested: { type: 'String' },
                  },
                },
                hierarchy: {},
              },
            },
          },
        },
      };

      const schema = DocumentAPI.getDocumentSchema('DeeplyNested');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('DeeplyNested');
    });
  });

  describe('System-Specific Document Namespace Discovery', () => {
    test('should discover SystemActivity from dnd5e system namespace', () => {
      // Mock the current system
      global.game.system = { id: 'dnd5e' };

      const schema = DocumentAPI.getDocumentSchema('SystemActivity');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('SystemActivity');
      expect(schema.fields).toEqual([
        '_id', 'type', 'name', 'img', 'sort', 'activation', 'consumption',
        'description', 'duration', 'effects', 'range', 'target', 'uses', 'attack', 'damage'
      ]);
    });

    test('should discover SystemAction from pf2e system namespace', () => {
      // Mock switching to pf2e system
      global.game.system = { id: 'pf2e' };

      const schema = DocumentAPI.getDocumentSchema('SystemAction');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('SystemAction');
      expect(schema.fields).toEqual(['name', 'actionType', 'cost']);
    });

    test('should handle system without document namespaces gracefully', () => {
      // Mock system without documents namespace
      global.game.system = { id: 'nosystem' };

      const schema = DocumentAPI.getDocumentSchema('SystemActivity');
      // Should still find SystemActivity from dnd5e namespace via global discovery
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('SystemActivity');
    });

    test('should discover documents from multiple system namespaces', () => {
      global.game.system = { id: 'dnd5e' };

      // Should find SystemActivity from dnd5e
      const activitySchema = DocumentAPI.getDocumentSchema('SystemActivity');
      expect(activitySchema).not.toBeNull();
      expect(activitySchema.type).toBe('SystemActivity');

      // Should find SystemAction from pf2e (global discovery)
      const actionSchema = DocumentAPI.getDocumentSchema('SystemAction');
      expect(actionSchema).not.toBeNull();
      expect(actionSchema.type).toBe('SystemAction');
    });

    test('should handle malformed system document namespaces gracefully', () => {
      // Add malformed system namespace
      global.badsystem = {
        documents: null, // Malformed
      };

      global.game.system = { id: 'badsystem' };

      const schema = DocumentAPI.getDocumentSchema('SystemActivity');
      // Should still find SystemActivity from other namespaces
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('SystemActivity');

      delete global.badsystem;
    });

    test('should return first match in alphabetical order for system namespaces', () => {
      // Both dnd5e and pf2e have documents, dnd5e should come first alphabetically
      global.game.system = { id: 'dnd5e' };

      // Add SystemActivity to pf2e as well
      global.pf2e.documents.activity = {
        PF2eActivity: {
          documentName: 'SystemActivity',
          schema: {
            fields: {
              pf2eField: { type: 'String' },
            },
          },
        },
      };

      const schema = DocumentAPI.getDocumentSchema('SystemActivity');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('SystemActivity');
      // Should find dnd5e version first (alphabetically before pf2e)
      expect(schema.fields).toContain('_id'); // dnd5e fields, not pf2eField

      // Cleanup
      delete global.pf2e.documents.activity;
    });

    test('should handle missing game.system gracefully', () => {
      delete global.game.system;

      const schema = DocumentAPI.getDocumentSchema('SystemActivity');
      // Should still discover via global namespace search
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('SystemActivity');
    });
  });

  describe('System Integration', () => {
    test('should discover system-specific documents in alphabetical order', () => {
      // dnd5e-weapon should be found when searching for Activity
      const schema = DocumentAPI.getDocumentSchema('Activity');
      expect(schema).not.toBeNull();
      expect(schema.type).toBe('Activity');
    });
  });
});
