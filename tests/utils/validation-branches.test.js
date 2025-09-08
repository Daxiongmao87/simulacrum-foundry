// SPDX-License-Identifier: MIT
import { ValidationUtils } from '../../scripts/utils/validation.js';

describe('ValidationUtils branch coverage', () => {
  test('missing required fields are reported', () => {
    const schema = { type: 'object', required: ['a','b'], properties: { a: { type: 'string' }, b: { type: 'number' } } };
    const res = ValidationUtils.validateParams({ a: 'ok' }, schema);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/Missing required parameter: b/);
  });

  test('wrong types are reported only when present', () => {
    const schema = { type: 'object', properties: { s: { type: 'string' }, n: { type: 'number' }, o: { type: 'object' }, b: { type: 'boolean' } } };
    const res = ValidationUtils.validateParams({ s: 1, n: 'x', o: null, b: 'no' }, schema);
    expect(res.valid).toBe(false);
    const msg = res.errors.join(' | ');
    expect(msg).toMatch(/s must be a string/);
    expect(msg).toMatch(/n must be a number/);
    expect(msg).toMatch(/o must be an object/);
    expect(msg).toMatch(/b must be a boolean/);
  });
});

