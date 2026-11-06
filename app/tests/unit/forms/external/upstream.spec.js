const Problem = require('api-problem');
const { getMockRes } = require('@jest-mock/express');

const upstream = require('../../../../src/forms/external/upstream');

const axiosError = (overrides = {}) => Object.assign(new Error(overrides.message || 'upstream failed'), { isAxiosError: true }, overrides);

describe('upstream.getWithRetry', () => {
  it('returns the first successful response without retrying', async () => {
    const client = { get: jest.fn().mockResolvedValue({ data: 'ok' }) };

    const result = await upstream.getWithRetry(client, 'http://chefs/forms', { retryDelayMs: 0 });

    expect(result).toEqual({ data: 'ok' });
    expect(client.get).toBeCalledTimes(1);
  });

  it('retries on timeouts and 5xx responses up to the attempt limit', async () => {
    const client = {
      get: jest
        .fn()
        .mockRejectedValueOnce(axiosError({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' }))
        .mockRejectedValueOnce(axiosError({ response: { status: 503 } }))
        .mockResolvedValue({ data: 'ok' }),
    };

    const result = await upstream.getWithRetry(client, 'http://chefs/forms', { maxAttempts: 3, retryDelayMs: 0 });

    expect(result).toEqual({ data: 'ok' });
    expect(client.get).toBeCalledTimes(3);
  });

  it('gives up after the attempt limit and rethrows the last error', async () => {
    const err = axiosError({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' });
    const client = { get: jest.fn().mockRejectedValue(err) };

    await expect(upstream.getWithRetry(client, 'http://chefs/forms', { maxAttempts: 3, retryDelayMs: 0 })).rejects.toBe(err);
    expect(client.get).toBeCalledTimes(3);
  });

  it('does not retry upstream 4xx responses', async () => {
    const err = axiosError({ response: { status: 401 } });
    const client = { get: jest.fn().mockRejectedValue(err) };

    await expect(upstream.getWithRetry(client, 'http://chefs/forms', { maxAttempts: 3, retryDelayMs: 0 })).rejects.toBe(err);
    expect(client.get).toBeCalledTimes(1);
  });

  it('does not retry non-upstream errors', async () => {
    const err = new Error('database exploded');
    const client = { get: jest.fn().mockRejectedValue(err) };

    await expect(upstream.getWithRetry(client, 'http://chefs/forms', { maxAttempts: 3, retryDelayMs: 0 })).rejects.toBe(err);
    expect(client.get).toBeCalledTimes(1);
  });
});

describe('upstream.toUpstreamProblem', () => {
  it('maps timeouts to 504', () => {
    const problem = upstream.toUpstreamProblem(axiosError({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' }));

    expect(problem).toBeInstanceOf(Problem);
    expect(problem.status).toBe(504);
    expect(problem.retryAfter).toBe(upstream.UPSTREAM_RETRY_AFTER_SECONDS);
  });

  it('maps upstream responses and connection failures to 502', () => {
    expect(upstream.toUpstreamProblem(axiosError({ response: { status: 500, statusText: 'Internal Server Error' } })).status).toBe(502);
    expect(upstream.toUpstreamProblem(axiosError({ code: 'ECONNREFUSED' })).status).toBe(502);
  });

  it('ignores errors that are not from an upstream call', () => {
    expect(upstream.toUpstreamProblem(new Error('nope'))).toBeUndefined();
    expect(upstream.toUpstreamProblem(undefined)).toBeUndefined();
  });
});

describe('upstream.errorHandler', () => {
  it('answers upstream timeouts with 504 and a Retry-After header', () => {
    const { res } = getMockRes();
    const next = jest.fn();

    upstream.errorHandler(axiosError({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' }), {}, res, next);

    expect(next).not.toBeCalled();
    expect(res.set).toBeCalledWith('Retry-After', String(upstream.UPSTREAM_RETRY_AFTER_SECONDS));
    expect(res.writeHead).toBeCalledWith(504, expect.anything());
  });

  it('answers other upstream failures with 502 and a Retry-After header', () => {
    const { res } = getMockRes();
    const next = jest.fn();

    upstream.errorHandler(axiosError({ response: { status: 502 } }), {}, res, next);

    expect(next).not.toBeCalled();
    expect(res.set).toBeCalledWith('Retry-After', String(upstream.UPSTREAM_RETRY_AFTER_SECONDS));
    expect(res.writeHead).toBeCalledWith(502, expect.anything());
  });

  it('passes non-upstream errors to the next handler untouched', () => {
    const { res } = getMockRes();
    const next = jest.fn();
    const err = new Error('database exploded');

    upstream.errorHandler(err, {}, res, next);

    expect(next).toBeCalledWith(err);
    expect(res.writeHead).not.toBeCalled();
  });
});
