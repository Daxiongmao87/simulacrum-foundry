// SPDX-License-Identifier: MIT
import { validator, ValidationUtils, validators } from '../../scripts/utils/validation.js';

describe('ValidationEngine additional branches', () => {
  test('array validator: required, length, and itemValidator branches', () => {
    let r = validators.array(undefined, { required: true });
    expect(r.isValid).toBe(false);
    r = validators.array([1,2], { minLength: 3 });
    expect(r.isValid).toBe(false);
    r = validators.array([1,2,3,4], { maxLength: 2 });
    expect(r.isValid).toBe(false);
    const itemValidator = (x) => ({ isValid: x % 2 === 0, errors: x % 2 ? [{ field: 'value', message: 'odd', value: x }] : [], data: { value: x } });
    r = validators.array([2,3], { itemValidator });
    expect(r.isValid).toBe(false);
  });

  test('object validator: required object and nested schema', () => {
    let r = validators.object(null, { required: true });
    expect(r.isValid).toBe(false);
    r = validators.object({ a: '1', b: 2 });
    expect(r.isValid).toBe(true);
  });

  test('objectId validator: invalid and valid formats', () => {
    let r = validators.objectId('short');
    expect(r.isValid).toBe(false);
    r = validators.objectId('ABCDEFGHIJKLMNOP');
    expect(r.isValid).toBe(true);
  });

  test('date validator: required, min/max bounds', () => {
    let r = validators.date(undefined, { required: true });
    expect(r.isValid).toBe(false);
    const now = Date.now();
    r = validators.date(now, { min: now + 10 });
    expect(r.isValid).toBe(false);
    r = validators.date(now, { max: now - 10 });
    expect(r.isValid).toBe(false);
  });

  test('sanitize helpers cover string, html, filename, path', async () => {
    const s = await validator.sanitize(' hi ', 'string');
    expect(s).toBe('hi');
    const html = validator.sanitizeHTML('<script>alert(1)</script><div onclick="x">ok</div>');
    expect(html).not.toMatch(/script/);
    expect(html).toMatch(/data-invalid/);
    const fname = validator.sanitizeFilename('bad:name*?<>.txt');
    expect(fname).not.toMatch(/[:*<>?]/);
    const path = validator.sanitizePath('../a//b/');
    expect(path).toMatch(/^\.?.?a\/b$/);
  });

  test('validateFields covers unknown validator and required', () => {
    const schema = { a: { type: 'missing', required: false }, b: { type: 'string', required: true } };
    const r = validator.validateFields({}, schema);
    expect(r.isValid).toBe(false);
  });

  test('ValidationUtils.validateParams full object flow valid', () => {
    const schema = { type: 'object', required: ['a'], properties: { a: { type: 'string' }, b: { type: 'number' } } };
    const res = ValidationUtils.validateParams({ a: 'x', b: 2 }, schema);
    expect(res.valid).toBe(true);
  });
});
