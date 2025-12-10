/**
 * Tests for ValidationErrorHandler utility
 */
import { ValidationErrorHandler } from '../../scripts/utils/validation-errors.js';

describe('ValidationErrorHandler', () => {
    beforeEach(() => {
        global.CONFIG = {
            Actor: {
                documentClass: {
                    schema: {
                        fields: {
                            name: { constructor: { name: 'StringField' }, required: true },
                            type: { constructor: { name: 'StringField' }, choices: ['character', 'npc'] },
                        }
                    }
                }
            }
        };
    });

    afterEach(() => {
        delete global.CONFIG;
    });

    describe('parseFoundryValidationError', () => {
        it('should return null for non-validation errors', () => {
            const error = new Error('Regular error');
            const result = ValidationErrorHandler.parseFoundryValidationError(error);
            expect(result).toBeNull();
        });

        it('should parse DataModelValidationError with getAllFailures', () => {
            const error = new Error('Validation failed');
            error.name = 'DataModelValidationError';
            error.getAllFailures = () => ({
                'name': { message: 'name is required', invalidValue: undefined },
                'type': { message: 'not a valid choice', invalidValue: 'invalid' }
            });

            const result = ValidationErrorHandler.parseFoundryValidationError(error);
            expect(result).not.toBeNull();
            expect(result.type).toBe('VALIDATION_ERROR');
            expect(result.details).toHaveProperty('name');
            expect(result.details).toHaveProperty('type');
        });

        it('should fallback to message parsing when getAllFailures fails', () => {
            const error = new Error('Document validation errors:\n  name: is required');
            error.name = 'DataModelValidationError';
            error.getAllFailures = () => { throw new Error('Method failed'); };

            const result = ValidationErrorHandler.parseFoundryValidationError(error);
            expect(result).not.toBeNull();
            expect(result.type).toBe('VALIDATION_ERROR');
        });

        it('should fallback to message parsing when getAllFailures not available', () => {
            const error = new Error('Document validation errors:\n  name: is required');
            error.name = 'DataModelValidationError';

            const result = ValidationErrorHandler.parseFoundryValidationError(error);
            expect(result).not.toBeNull();
            expect(result.details).toHaveProperty('name');
        });
    });

    describe('processFoundryFailures', () => {
        it('should process failure objects correctly', () => {
            const failures = {
                'name': { message: 'required', invalidValue: null, fallback: 'default' },
                'pages.0.name': { message: 'cannot be blank', dropped: true }
            };

            const result = ValidationErrorHandler.processFoundryFailures(failures);
            expect(result.name.field).toBe('name');
            expect(result.name.error).toBe('required');
            expect(result.name.invalidValue).toBe(null);
            expect(result.name.fallback).toBe('default');
            expect(result['pages.0.name'].dropped).toBe(true);
        });

        it('should handle empty failures', () => {
            const result = ValidationErrorHandler.processFoundryFailures({});
            expect(result).toEqual({});
        });
    });

    describe('extractValidationDetails', () => {
        it('should parse error message with multiple fields', () => {
            const error = new Error('Document validation errors:\n  name: is required\n  type: invalid choice');

            const result = ValidationErrorHandler.extractValidationDetails(error);
            expect(Object.keys(result).length).toBeGreaterThanOrEqual(1);
        });

        it('should handle nested field paths', () => {
            const error = new Error('Document errors:\n  pages: validation failed\n    0: nested error');

            const result = ValidationErrorHandler.extractValidationDetails(error);
            expect(Object.keys(result).length).toBeGreaterThan(0);
        });

        it('should skip header lines', () => {
            const error = new Error('validation errors:\n\n  name: error');

            const result = ValidationErrorHandler.extractValidationDetails(error);
            expect(result).toHaveProperty('name');
        });
    });

    describe('generateSuggestions', () => {
        it('should generate suggestions for validation details', () => {
            const details = {
                'name': { field: 'name', error: 'is required', invalidValue: undefined },
                'type': { field: 'type', error: 'not a valid choice', invalidValue: 'bad' }
            };

            const suggestions = ValidationErrorHandler.generateSuggestions(details);
            expect(suggestions.length).toBe(2);
            expect(suggestions[0].field).toBe('name');
        });

        it('should return empty array for empty details', () => {
            const suggestions = ValidationErrorHandler.generateSuggestions({});
            expect(suggestions).toEqual([]);
        });
    });

    describe('createFieldSuggestion', () => {
        it('should handle required field errors', () => {
            const detail = { error: 'may not be undefined', invalidValue: undefined };
            const suggestion = ValidationErrorHandler.createFieldSuggestion('name', detail);

            expect(suggestion.action).toContain('Provide a value');
            expect(suggestion.action).toContain('name');
        });

        it('should handle ID field errors', () => {
            const detail = { error: 'must be a valid 16-character alphanumeric ID', invalidValue: 'bad' };
            const suggestion = ValidationErrorHandler.createFieldSuggestion('_id', detail);

            expect(suggestion.action).toContain('foundry.utils.randomID()');
            expect(suggestion.example).toBe('foundry.utils.randomID()');
        });

        it('should handle type errors', () => {
            const detail = { error: 'must be string type', invalidValue: 123 };
            const suggestion = ValidationErrorHandler.createFieldSuggestion('value', detail);

            expect(suggestion.action).toContain('correct data type');
        });

        it('should handle choice errors', () => {
            const detail = { error: 'is not a valid choice', invalidValue: 'invalid', fallback: 'character' };
            const suggestion = ValidationErrorHandler.createFieldSuggestion('type', detail);

            expect(suggestion.action).toContain('valid choice');
            expect(suggestion.example).toBe('character');
        });

        it('should handle invalid value errors', () => {
            const detail = { error: 'value is invalid', invalidValue: 'bad_value' };
            const suggestion = ValidationErrorHandler.createFieldSuggestion('field', detail);

            expect(suggestion.action).toContain('Check');
            expect(suggestion.action).toContain('valid');
        });

        it('should handle generic errors', () => {
            const detail = { error: 'some unknown error' };
            const suggestion = ValidationErrorHandler.createFieldSuggestion('field', detail);

            expect(suggestion.action).toContain('Fix validation error');
        });
    });

    describe('getFieldExample', () => {
        it('should return name example for name fields', () => {
            expect(ValidationErrorHandler.getFieldExample('name')).toBe('"Example Name"');
            expect(ValidationErrorHandler.getFieldExample('displayName')).toBe('"Example Name"');
        });

        it('should return type example for type fields', () => {
            expect(ValidationErrorHandler.getFieldExample('type')).toBe('"text"');
        });

        it('should return content example for content fields', () => {
            expect(ValidationErrorHandler.getFieldExample('content')).toBe('"<p>Example content</p>"');
        });

        it('should return title example for title fields', () => {
            expect(ValidationErrorHandler.getFieldExample('title')).toBe('"Example Title"');
        });

        it('should return image example for image fields', () => {
            expect(ValidationErrorHandler.getFieldExample('img')).toBe('"icons/example.png"');
            expect(ValidationErrorHandler.getFieldExample('image')).toBe('"icons/example.png"');
        });

        it('should return generic example for unknown fields', () => {
            expect(ValidationErrorHandler.getFieldExample('unknown')).toBe('"example_value"');
        });
    });

    describe('getTypeExample', () => {
        it('should return examples for different types', () => {
            expect(ValidationErrorHandler.getTypeExample('must be string')).toBe('"string_value"');
            expect(ValidationErrorHandler.getTypeExample('must be number')).toBe('42');
            expect(ValidationErrorHandler.getTypeExample('must be boolean')).toBe('true');
            expect(ValidationErrorHandler.getTypeExample('must be array')).toBe('[]');
            expect(ValidationErrorHandler.getTypeExample('must be object')).toBe('{}');
            expect(ValidationErrorHandler.getTypeExample('unknown type')).toBe('"example_value"');
        });
    });

    describe('createToolErrorResponse', () => {
        it('should handle validation errors', () => {
            const error = new Error('Validation failed');
            error.name = 'DataModelValidationError';
            error.getAllFailures = () => ({
                'name': { message: 'is required' }
            });

            const response = ValidationErrorHandler.createToolErrorResponse(error, 'create', 'Actor');

            expect(response.error.type).toBe('VALIDATION_ERROR');
            expect(response.display).toContain('Validation Error');
        });

        it('should include document ID for updates', () => {
            const error = new Error('Validation failed');
            error.name = 'DataModelValidationError';
            error.getAllFailures = () => ({ 'name': { message: 'error' } });

            const response = ValidationErrorHandler.createToolErrorResponse(error, 'update', 'Actor', 'abc123');

            expect(response.content).toContain('Actor:abc123');
        });

        it('should handle non-validation errors', () => {
            const error = new Error('Network error');

            const response = ValidationErrorHandler.createToolErrorResponse(error, 'create', 'Actor');

            expect(response.error.type).toBe('CREATE_FAILED');
            expect(response.content).toContain('Network error');
        });
    });

    describe('getDocumentTypeInstructions', () => {
        it('should add ID error instructions', () => {
            const suggestions = [{ issue: '16-character alphanumeric ID' }];
            const result = ValidationErrorHandler.getDocumentTypeInstructions('Actor', suggestions);

            expect(result).toContain('randomID()');
        });

        it('should add required field instructions', () => {
            const suggestions = [{ issue: 'may not be undefined' }];
            const result = ValidationErrorHandler.getDocumentTypeInstructions('Actor', suggestions);

            expect(result).toContain('required fields');
        });

        it('should add choice error instructions', () => {
            const suggestions = [{ issue: 'not a valid choice' }];
            const result = ValidationErrorHandler.getDocumentTypeInstructions('Actor', suggestions);

            expect(result).toContain('choice fields');
        });

        it('should add JournalEntry-specific instructions', () => {
            const suggestions = [{ field: 'pages.0.name', issue: 'error' }];
            const result = ValidationErrorHandler.getDocumentTypeInstructions('JournalEntry', suggestions);

            expect(result).toContain('JournalEntry pages');
        });

        it('should add Actor-specific instructions', () => {
            const result = ValidationErrorHandler.getDocumentTypeInstructions('Actor', []);
            expect(result).toContain('Actors');
        });

        it('should add Item-specific instructions', () => {
            const result = ValidationErrorHandler.getDocumentTypeInstructions('Item', []);
            expect(result).toContain('Items');
        });
    });

    describe('enhanceWithSchemaAnalysis', () => {
        it('should enhance suggestions with schema information', () => {
            const suggestions = [{
                field: 'name',
                issue: 'is required',
                action: 'Provide a value',
                example: null,
                invalidValue: undefined
            }];

            const result = ValidationErrorHandler.enhanceWithSchemaAnalysis(suggestions, 'Actor');
            expect(result[0]).toHaveProperty('schemaAnalysis');
            expect(result[0]).toHaveProperty('correctionMethod');
        });
    });

    describe('createEnhancedAIContext', () => {
        it('should create enhanced context with schema information', () => {
            const details = { 'name': { field: 'name', error: 'required' } };
            const suggestions = [{
                field: 'name',
                action: 'Provide value',
                schemaExample: '"Example"',
                schemaAnalysis: { fieldType: 'StringField' },
                issue: 'is required'
            }];

            const result = ValidationErrorHandler.createEnhancedAIContext(details, suggestions, 'Actor');
            expect(result).toContain('Actor validation failed');
            expect(result).toContain('name');
        });

        it('should fall back to example when schemaExample missing', () => {
            const details = { 'type': { field: 'type', error: 'invalid' } };
            const suggestions = [{
                field: 'type',
                action: 'Fix type',
                example: '"character"',
                issue: 'invalid value'
            }];

            const result = ValidationErrorHandler.createEnhancedAIContext(details, suggestions, 'Actor');
            expect(result).toContain('type');
        });
    });

    describe('createAIContext', () => {
        it('should create AI context for validation errors', () => {
            const details = { 'name': { field: 'name', error: 'required' } };
            const suggestions = [{
                field: 'name',
                action: 'Provide value for name',
                example: '"Test"',
                issue: 'is required'
            }];

            const result = ValidationErrorHandler.createAIContext(details, suggestions);
            expect(result).toContain('validation failed');
            expect(result).toContain('Required fixes');
        });

        it('should include ID error instructions', () => {
            const details = { '_id': { field: '_id', error: '16-character alphanumeric ID' } };
            const suggestions = [{
                field: '_id',
                action: 'Generate ID',
                issue: '16-character alphanumeric ID required'
            }];

            const result = ValidationErrorHandler.createAIContext(details, suggestions);
            expect(result).toContain('randomID()');
        });

        it('should include suggested values', () => {
            const details = { 'type': { field: 'type', error: 'invalid' } };
            const suggestions = [{
                field: 'type',
                action: 'Fix type',
                suggestedValue: 'character',
                issue: 'not valid'
            }];

            const result = ValidationErrorHandler.createAIContext(details, suggestions);
            expect(result).toContain('suggested');
        });
    });
});

