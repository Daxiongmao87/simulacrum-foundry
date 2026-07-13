import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ValidationEngine,
  ValidationResult,
  ValidationUtils,
  validators,
} from '../../scripts/utils/validation.js';

test('required strings fail closed and valid strings are normalized', () => {
  const missing = validators.string('', { required: true });
  assert.equal(missing.isValid, false);
  assert.match(missing.errors[0].message, /required/u);

  const valid = validators.string('  campaign  ', { required: true, maxLength: 20 });
  assert.equal(valid.isValid, true);
  assert.equal(valid.data.value, 'campaign');
});

test('integer validation rejects fractional and out-of-range values', () => {
  assert.equal(validators.integer(1.5).isValid, false);
  assert.equal(validators.integer(0, { min: 1 }).isValid, false);
  assert.equal(validators.integer(4, { min: 1, max: 5 }).data.value, 4);
});

test('validation result JSON omits mutable internal data', () => {
  const result = new ValidationResult();
  result.addError('name', 'invalid', '<unsafe>');
  assert.deepEqual(result.toJSON(), {
    isValid: false,
    errorCount: 1,
    warningCount: 0,
    errors: [{ field: 'name', message: 'invalid', value: '<unsafe>' }],
    warnings: [],
  });
});

test('JSON-schema compatibility rejects missing required parameters', () => {
  const result = ValidationUtils.validateParams(
    {},
    {
      type: 'object',
      required: ['documentId'],
      properties: { documentId: { type: 'string' } },
    }
  );
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /documentId/u);
});

test('sanitizers normalize filenames and traversal-like paths', async () => {
  const engine = new ValidationEngine();
  assert.equal(await engine.sanitize(' bad/name?.json ', 'filename'), 'bad_name_.json');
  assert.equal(await engine.sanitize('./world//actors/', 'path'), 'world/actors');
});
