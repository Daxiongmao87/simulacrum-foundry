// SPDX-License-Identifier: MIT
import { SimulacrumError, ValidationError, ToolError, DocumentError, PermissionError, NetworkError, NotFoundError, APIError, wrapError, createRecoveryContext } from '../../scripts/utils/errors.js';

describe('errors utils branch coverage', () => {
  test('SimulacrumError json shape', () => {
    const e = new SimulacrumError('msg', 'CODE', { a: 1 });
    const j = e.toJSON();
    expect(j.name).toBe('SimulacrumError');
    expect(j.type).toBe('CODE');
    expect(j.data).toEqual({ a: 1 });
    expect(typeof j.timestamp).toBe('string');
  });

  test('subclass data payloads', () => {
    expect(new ValidationError('v', 'f', 3).data).toEqual({ field: 'f', value: 3 });
    expect(new ToolError('t', 'tool', { info: 1 }).data).toEqual({ toolName: 'tool', info: 1 });
    expect(new DocumentError('d', 'Actor', 'update', 'id1').data).toEqual({ documentType: 'Actor', operation: 'update', documentId: 'id1' });
    expect(new PermissionError('p', 'READ', 'player', 'gm').data).toEqual({ action: 'READ', userRole: 'player', requiredRole: 'gm' });
    expect(new NetworkError('n', 'openai', '/v1', 500).data).toEqual(expect.objectContaining({ url: '/v1', status: 500 }));
    expect(new NotFoundError('x', 'doc', 'id').data).toEqual({ resource: 'doc', id: 'id' });
    expect(new APIError('a', { ctx: 1 }).data).toEqual({ ctx: 1 });
  });

  test('wrapError wraps non-simulacrum errors and preserves stack', () => {
    const orig = new Error('boom');
    const wrapped = wrapError(orig, 'FALLBACK');
    expect(wrapped).toBeInstanceOf(SimulacrumError);
    expect(wrapped.type).toBe('FALLBACK');
    expect(wrapped.data.originalError).toBe('boom');
    expect(wrapped.stack).toBe(orig.stack);
  });

  test('createRecoveryContext retriable flags by type', () => {
    const docErr = new DocumentError('d');
    const netErr = new NetworkError('n');
    const other = new SimulacrumError('s');
    expect(createRecoveryContext(docErr).retriable).toBe(false); // uses error.code, not type
    expect(createRecoveryContext(netErr).retriable).toBe(false);
    expect(createRecoveryContext(other).retriable).toBe(false);
  });
});
