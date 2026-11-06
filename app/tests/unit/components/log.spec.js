const config = require('config');

const getLogger = require('../../../src/components/log');
const httpLogger = require('../../../src/components/log').httpLogger;

describe('getLogger', () => {
  const assertLogger = (log) => {
    expect(log).toBeTruthy();
    expect(typeof log).toBe('object');
    expect(typeof log.pipe).toBe('function');
    expect(log.exitOnError).toBeFalsy();
    expect(log.format).toBeTruthy();
    expect(log.level).toBe(config.get('server.logLevel'));
    expect(log.transports).toHaveLength(1);
  };

  it('should return a winston logger', () => {
    const result = getLogger();
    assertLogger(result);
  });

  it('should return a child winston logger with metadata overrides', () => {
    const result = getLogger('test');
    assertLogger(result);
  });
});

describe('httpLogger', () => {
  it('should return a winston middleware function', () => {
    const result = httpLogger;

    expect(result).toBeTruthy();
    expect(typeof result).toBe('function');
    expect(result.length).toBe(3);
  });
});

describe('redact', () => {
  const { redact } = require('../../../src/components/log');

  it('masks credential keys at any depth without mutating the input', () => {
    const err = Object.assign(new Error('boom'), { config: { headers: { authorization: 'Basic abc123==', apikey: 'k:secret', Accept: 'json' } } });
    const result = redact(err);

    expect(result.message).toBe('boom');
    expect(result.config.headers.authorization).toBe('[REDACTED]');
    expect(result.config.headers.apikey).toBe('[REDACTED]');
    expect(result.config.headers.Accept).toBe('json');
    expect(err.config.headers.authorization).toBe('Basic abc123==');
  });

  it('masks Basic and Bearer credentials embedded in strings', () => {
    expect(redact('sent Authorization: Bearer eyJ.abc-d_e then Basic dXNlcjpwdw==')).not.toMatch(/eyJ|dXNlcjpwdw/);
  });

  it('handles circular references and non-objects', () => {
    const a = { name: 'a' };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
    expect(redact(5)).toBe(5);
    expect(redact(null)).toBeNull();
  });
});
