import assert from 'node:assert/strict';
import test from 'node:test';

import { PermissionError, ValidationError } from '../../scripts/utils/errors.js';

test('typed errors retain machine-readable type and contextual data', () => {
  const error = new PermissionError('GM access required', 'create', 'PLAYER', 'GAMEMASTER');
  const serialized = error.toJSON();

  assert.equal(error.name, 'PermissionError');
  assert.equal(serialized.type, 'PERMISSION_ERROR');
  assert.deepEqual(serialized.data, {
    action: 'create',
    userRole: 'PLAYER',
    requiredRole: 'GAMEMASTER',
  });
  assert.match(serialized.timestamp, /^\d{4}-\d{2}-\d{2}T/u);
});

test('validation error preserves field and rejected value', () => {
  const error = new ValidationError('Bad identifier', 'id', '../unsafe');
  assert.deepEqual(error.data, { field: 'id', value: '../unsafe' });
});
