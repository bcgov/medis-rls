const { describeShape, loggable, sizeOf } = require('../../../src/components/logSummary');

describe('describeShape', () => {
  it('lists keys and types but never values', () => {
    const shape = describeShape({ name: 'Jane Doe', age: 42, tags: ['a', 'b'], nested: { ssn: '123' } });
    expect(shape).toEqual({ name: 'string', age: 'number', tags: 'array(2)', nested: { ssn: 'string' } });
    expect(JSON.stringify(shape)).not.toContain('Jane');
    expect(JSON.stringify(shape)).not.toContain('123');
  });

  it('stops at the requested depth', () => {
    expect(describeShape({ a: { b: { c: 1 } } }, 1)).toEqual({ a: 'object(1 keys)' });
  });

  it('caps the number of keys', () => {
    const big = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, i]));
    const shape = describeShape(big);
    expect(Object.keys(shape)).toHaveLength(51);
    expect(shape['...']).toBe('30 more keys');
  });

  it('handles null and primitives', () => {
    expect(describeShape(null)).toBe('null');
    expect(describeShape('x')).toBe('string');
  });
});

describe('loggable', () => {
  it('returns small values unchanged', () => {
    expect(loggable({ formId: 'abc' })).toEqual({ formId: 'abc' });
  });

  it('replaces large values with their shape and size', () => {
    const result = loggable({ data: 'x'.repeat(5000) }, 100);
    expect(result.truncated).toBe(true);
    expect(result.bytes).toBe(sizeOf({ data: 'x'.repeat(5000) }));
    expect(result.shape).toEqual({ data: 'string' });
  });
});
