/**
 * Game System Mock Fixtures
 * Based on real D&D 5e and Pathfinder 2e system configurations from reference/
 */

/**
 * D&D 5e System Mock Configuration
 * Based on reference/dnd5e/system.json
 */
export const DND5E_SYSTEM = {
  name: 'D&D 5e',
  id: 'dnd5e',
  config: {
    Document: {
      documentTypes: {
        ActiveEffect: 'ActiveEffect',
        Actor: 'Actor',
        ChatMessage: 'ChatMessage',
        Item: 'Item',
        JournalEntry: 'JournalEntry',
        JournalEntryPage: 'JournalEntryPage',
        RegionBehavior: 'RegionBehavior',
        RollTable: 'RollTable',
        Scene: 'Scene'
      }
    },
    ActiveEffect: {
      documentClass: class MockActiveEffect {
        static get documentName() { return 'ActiveEffect'; }
        static get schema() {
          return {
            fields: { label: {}, icon: {}, disabled: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() { return {}; }
      }
    },
    Actor: {
      documentClass: class MockActor {
        static get documentName() { return 'Actor'; }
        static get schema() {
          return {
            fields: { 
              name: {}, 
              img: {}, 
              type: {}, 
              'system.attributes.hp': {},
              'system.details.biography': {}
            },
            has: jest.fn((field) => field === 'system'),
            getField: jest.fn(() => ({
              fields: { 
                attributes: { fields: { hp: {} } },
                details: { fields: { biography: {} } }
              }
            }))
          };
        }
        static get hierarchy() { 
          return { 
            items: { documentName: 'Item' },
            effects: { documentName: 'ActiveEffect' }
          }; 
        }
      }
    },
    Item: {
      documentClass: class MockItem {
        static get documentName() { return 'Item'; }
        static get schema() {
          return {
            fields: { 
              name: {}, 
              img: {}, 
              type: {}, 
              description: {},
              'system.rarity': {},
              'system.price': {}
            },
            has: jest.fn((field) => field === 'system'),
            getField: jest.fn(() => ({
              fields: { 
                rarity: {},
                price: { fields: { value: {}, denomination: {} } }
              }
            }))
          };
        }
        static get hierarchy() { 
          return {
            effects: { documentName: 'ActiveEffect' }
          }; 
        }
      }
    },
    JournalEntry: {
      documentClass: class MockJournalEntry {
        static get documentName() { return 'JournalEntry'; }
        static get schema() {
          return {
            fields: { name: {}, content: {}, folder: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() {
          return {
            pages: { documentName: 'JournalEntryPage' }
          };
        }
      }
    },
    JournalEntryPage: {
      documentClass: class MockJournalEntryPage {
        static get documentName() { return 'JournalEntryPage'; }
        static get schema() {
          return {
            fields: { name: {}, text: { fields: { content: {} } }, type: {} },
            has: jest.fn((field) => field === 'text')
          };
        }
        static get hierarchy() { return {}; }
      }
    },
    RollTable: {
      documentClass: class MockRollTable {
        static get documentName() { return 'RollTable'; }
        static get schema() {
          return {
            fields: { name: {}, description: {}, formula: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() {
          return {
            results: { documentName: 'TableResult' }
          };
        }
      }
    },
    Scene: {
      documentClass: class MockScene {
        static get documentName() { return 'Scene'; }
        static get schema() {
          return {
            fields: { name: {}, img: {}, width: {}, height: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() {
          return {
            tokens: { documentName: 'Token' },
            lights: { documentName: 'AmbientLight' },
            sounds: { documentName: 'AmbientSound' }
          };
        }
      }
    }
  }
};

/**
 * Pathfinder 2e System Mock Configuration  
 * Based on reference/pf2e/static/system.json
 * Uses mostly core FoundryVTT document types
 */
export const PF2E_SYSTEM = {
  name: 'Pathfinder 2e',
  id: 'pf2e',
  config: {
    Document: {
      documentTypes: {
        Actor: 'Actor',
        Item: 'Item', 
        JournalEntry: 'JournalEntry',
        RegionBehavior: 'RegionBehavior',
        RollTable: 'RollTable',
        Scene: 'Scene',
        Macro: 'Macro'
      }
    },
    Actor: {
      documentClass: class MockPF2eActor {
        static get documentName() { return 'Actor'; }
        static get schema() {
          return {
            fields: { 
              name: {}, 
              img: {}, 
              type: {}, 
              'system.attributes.hp': {},
              'system.details.level': {},
              'system.traits.languages': {}
            },
            has: jest.fn((field) => field === 'system'),
            getField: jest.fn(() => ({
              fields: { 
                attributes: { fields: { hp: {} } },
                details: { fields: { level: {} } },
                traits: { fields: { languages: {} } }
              }
            }))
          };
        }
        static get hierarchy() { 
          return { 
            items: { documentName: 'Item' }
          }; 
        }
      }
    },
    Item: {
      documentClass: class MockPF2eItem {
        static get documentName() { return 'Item'; }
        static get schema() {
          return {
            fields: { 
              name: {}, 
              img: {}, 
              type: {}, 
              'system.level.value': {},
              'system.traits.rarity': {},
              'system.rules': {}
            },
            has: jest.fn((field) => field === 'system'),
            getField: jest.fn(() => ({
              fields: { 
                level: { fields: { value: {} } },
                traits: { fields: { rarity: {} } },
                rules: {}
              }
            }))
          };
        }
        static get hierarchy() { return {}; }
      }
    },
    JournalEntry: {
      documentClass: class MockPF2eJournalEntry {
        static get documentName() { return 'JournalEntry'; }
        static get schema() {
          return {
            fields: { name: {}, content: {}, folder: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() {
          return {
            pages: { documentName: 'JournalEntryPage' }
          };
        }
      }
    },
    RollTable: {
      documentClass: class MockPF2eRollTable {
        static get documentName() { return 'RollTable'; }
        static get schema() {
          return {
            fields: { name: {}, description: {}, formula: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() {
          return {
            results: { documentName: 'TableResult' }
          };
        }
      }
    },
    Scene: {
      documentClass: class MockPF2eScene {
        static get documentName() { return 'Scene'; }
        static get schema() {
          return {
            fields: { name: {}, img: {}, width: {}, height: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() {
          return {
            tokens: { documentName: 'Token' },
            lights: { documentName: 'AmbientLight' }
          };
        }
      }
    },
    Macro: {
      documentClass: class MockPF2eMacro {
        static get documentName() { return 'Macro'; }
        static get schema() {
          return {
            fields: { name: {}, type: {}, command: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() { return {}; }
      }
    }
  }
};

/**
 * Minimal Core System Mock Configuration
 * Uses only basic FoundryVTT document types for testing edge cases
 */
export const MINIMAL_SYSTEM = {
  name: 'Minimal Core',
  id: 'minimal',
  config: {
    Document: {
      documentTypes: {
        Actor: 'Actor',
        Item: 'Item',
        JournalEntry: 'JournalEntry'
      }
    },
    Actor: {
      documentClass: class MockMinimalActor {
        static get documentName() { return 'Actor'; }
        static get schema() {
          return {
            fields: { name: {}, img: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() { return {}; }
      }
    },
    Item: {
      documentClass: class MockMinimalItem {
        static get documentName() { return 'Item'; }
        static get schema() {
          return {
            fields: { name: {}, description: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() { return {}; }
      }
    },
    JournalEntry: {
      documentClass: class MockMinimalJournalEntry {
        static get documentName() { return 'JournalEntry'; }
        static get schema() {
          return {
            fields: { name: {}, content: {} },
            has: jest.fn(() => false)
          };
        }
        static get hierarchy() { return {}; }
      }
    }
  }
};

/**
 * Edge Case System Mock Configuration  
 * Tests malformed/empty system configurations
 */
export const EDGE_CASE_SYSTEM = {
  name: 'Edge Case System',
  id: 'edge-case',
  config: {
    Document: {
      documentTypes: {}
    }
  }
};

/**
 * All available game system configurations for parameterized testing
 */
export const ALL_GAME_SYSTEMS = [
  DND5E_SYSTEM,
  PF2E_SYSTEM,
  MINIMAL_SYSTEM,
  EDGE_CASE_SYSTEM
];

/**
 * Get system configuration by name
 */
export function getSystemConfig(systemName) {
  return ALL_GAME_SYSTEMS.find(system => system.name === systemName)?.config || null;
}

/**
 * Get system document types by name
 */
export function getSystemDocumentTypes(systemName) {
  const config = getSystemConfig(systemName);
  return config ? Object.keys(config.Document.documentTypes) : [];
}