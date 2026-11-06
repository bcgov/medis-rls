const { DBError } = require('objection');

const DataConnection = require('../../../src/db/dataConnection');

describe('DataConnection.isDatabaseError', () => {
  it('recognises objection and knex database errors', () => {
    expect(DataConnection.isDatabaseError(new DBError({ nativeError: new Error('boom') }))).toBe(true);
    expect(DataConnection.isDatabaseError(Object.assign(new Error('Knex: Timeout acquiring a connection. The pool is probably full.'), { name: 'KnexTimeoutError' }))).toBe(true);
  });

  it('recognises pg connection failures', () => {
    expect(DataConnection.isDatabaseError(Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }))).toBe(true);
    expect(DataConnection.isDatabaseError(Object.assign(new Error('connection failure'), { code: '08006' }))).toBe(true);
    expect(DataConnection.isDatabaseError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(DataConnection.isDatabaseError(new Error('Connection terminated unexpectedly'))).toBe(true);
  });

  it('ignores upstream http and application errors', () => {
    expect(DataConnection.isDatabaseError(Object.assign(new Error('connect ECONNRESET'), { code: 'ECONNRESET', isAxiosError: true }))).toBe(false);
    expect(DataConnection.isDatabaseError(Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED', isAxiosError: true }))).toBe(false);
    expect(DataConnection.isDatabaseError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(DataConnection.isDatabaseError(undefined)).toBe(false);
  });
});
