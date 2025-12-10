/**
 * Tests for SchemaValidator utility
 */
import { SchemaValidator } from '../../scripts/utils/schema-validator.js';

describe('SchemaValidator', () => {
    beforeEach(() => {
        global.CONFIG = {
            JournalEntry: {
                documentClass: {
                    schema: {
                        fields: {
                            name: {
                                constructor: { name: 'StringField' },
                                required: true,
                                nullable: false,
                                blank: false,
                            },
                            _id: {
                                constructor: { name: 'DocumentIdField' },
                                required: true,
                            },
                            flags: {
                                constructor: { name: 'ObjectField' },
                                required: false,
                            },
                        }
                    }
                }
            },
            Actor: {
                documentClass: {
                    schema: {
                        fields: {
                            name: {
                                constructor: { name: 'StringField' },
                                required: true,
                            },
                            hp: {
                                constructor: { name: 'NumberField' },
                                required: false,
                                min: 0,
                                max: 100,
                                integer: true,
                                positive: true,
                            },
                            type: {
                                constructor: { name: 'StringField' },
                                choices: ['character', 'npc', 'monster'],
                                required: true,
                            },
                            items: {
                                constructor: { name: 'EmbeddedCollectionField' },
                            },
                        }
                    }
                }
            },
            NoSchema: {
                documentClass: {}
            }
        };
    });

    afterEach(() => {
        delete global.CONFIG;
    });

    describe('getDocumentSchema', () => {
        it('should return schema info for valid document type', () => {
            const result = SchemaValidator.getDocumentSchema('JournalEntry');
            expect(result).not.toBeNull();
            expect(result.documentType).toBe('JournalEntry');
            expect(result.schema).toBeDefined();
            expect(result.fields).toBeDefined();
        });

        it('should return null for unknown document type', () => {
            const result = SchemaValidator.getDocumentSchema('UnknownType');
            expect(result).toBeNull();
        });

        it('should return null when document class has no schema', () => {
            const result = SchemaValidator.getDocumentSchema('NoSchema');
            expect(result).toBeNull();
        });
    });

    describe('extractFieldInfo', () => {
        it('should extract fields from schema', () => {
            const schema = global.CONFIG.Actor.documentClass.schema;
            const fields = SchemaValidator.extractFieldInfo(schema);
            expect(fields.name).toBeDefined();
            expect(fields.hp).toBeDefined();
            expect(fields.type).toBeDefined();
        });

        it('should handle empty schema', () => {
            const fields = SchemaValidator.extractFieldInfo({});
            expect(fields).toEqual({});
        });
    });

    describe('analyzeField', () => {
        it('should analyze StringField correctly', () => {
            const field = {
                constructor: { name: 'StringField' },
                required: true,
                nullable: false,
            };
            const analysis = SchemaValidator.analyzeField('name', field);
            expect(analysis.name).toBe('name');
            expect(analysis.type).toBe('StringField');
            expect(analysis.required).toBe(true);
        });

        it('should analyze NumberField with min/max', () => {
            const field = {
                constructor: { name: 'NumberField' },
                min: 0,
                max: 100,
                integer: true,
                positive: true,
            };
            const analysis = SchemaValidator.analyzeField('hp', field);
            expect(analysis.validation.min).toBe(0);
            expect(analysis.validation.max).toBe(100);
            expect(analysis.validation.integer).toBe(true);
            expect(analysis.validation.positive).toBe(true);
        });

        it('should analyze field with choices', () => {
            const field = {
                constructor: { name: 'StringField' },
                choices: ['a', 'b', 'c'],
            };
            const analysis = SchemaValidator.analyzeField('selection', field);
            expect(analysis.choices).toEqual(['a', 'b', 'c']);
        });

        it('should analyze field with blank=false', () => {
            const field = {
                constructor: { name: 'StringField' },
                blank: false,
            };
            const analysis = SchemaValidator.analyzeField('required_field', field);
            expect(analysis.validation.notBlank).toBe(true);
        });

        it('should analyze DocumentIdField', () => {
            const field = {
                constructor: { name: 'DocumentIdField' },
            };
            const analysis = SchemaValidator.analyzeField('_id', field);
            expect(analysis.type).toBe('DocumentIdField');
        });

        it('should analyze BooleanField', () => {
            const field = {
                constructor: { name: 'BooleanField' },
            };
            const analysis = SchemaValidator.analyzeField('active', field);
            expect(analysis.suggestions).toContain('Must be true or false');
        });

        it('should analyze EmbeddedCollectionField', () => {
            const field = {
                constructor: { name: 'EmbeddedCollectionField' },
            };
            const analysis = SchemaValidator.analyzeField('items', field);
            expect(analysis.suggestions).toContain('Array of embedded documents');
        });
    });

    describe('generateFieldExample', () => {
        it('should return initial value if set', () => {
            const fieldInfo = { initial: 'default_value' };
            const result = SchemaValidator.generateFieldExample(fieldInfo);
            expect(result).toBe('default_value');
        });

        it('should return first choice if available', () => {
            const fieldInfo = { choices: ['first', 'second'] };
            const result = SchemaValidator.generateFieldExample(fieldInfo);
            expect(result).toBe('first');
        });

        it('should return type-specific example for StringField', () => {
            const fieldInfo = { type: 'StringField' };
            const result = SchemaValidator.generateFieldExample(fieldInfo);
            expect(typeof result).toBe('string');
        });

        it('should return type-specific example for NumberField', () => {
            const fieldInfo = { type: 'NumberField', validation: { min: 5 } };
            const result = SchemaValidator.generateFieldExample(fieldInfo);
            expect(typeof result).toBe('number');
        });

        it('should return type-specific example for BooleanField', () => {
            const fieldInfo = { type: 'BooleanField' };
            const result = SchemaValidator.generateFieldExample(fieldInfo);
            expect(typeof result).toBe('boolean');
        });
    });

    describe('getFieldSuggestion', () => {
        it('should return suggestions for known document type', () => {
            const result = SchemaValidator.getFieldSuggestion(
                'Actor',
                'name',
                'may not be undefined',
                undefined
            );
            expect(result.field).toBe('name');
            expect(result.schemaAvailable).toBe(true);
        });

        it('should suggest randomID for DocumentIdField', () => {
            const result = SchemaValidator.getFieldSuggestion(
                'JournalEntry',
                '_id',
                '16-character alphanumeric',
                'invalid'
            );
            expect(result.correctionMethod).toContain('randomID');
        });

        it('should suggest choices for choice field', () => {
            const result = SchemaValidator.getFieldSuggestion(
                'Actor',
                'type',
                'not a valid choice',
                'invalid_type'
            );
            expect(result.correctionMethod).toContain('character');
        });

        it('should return basic suggestion for unknown document type', () => {
            const result = SchemaValidator.getFieldSuggestion(
                'UnknownType',
                'field',
                'some error',
                'value'
            );
            expect(result.schemaAvailable).toBe(false);
        });
    });
});
