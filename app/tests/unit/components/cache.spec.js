const { createCache, makeKey } = require('../../../src/components/cache');

describe('makeKey', () => {
  it('is stable regardless of object key order', () => {
    expect(makeKey('a', { x: 1, y: 2 })).toBe(makeKey('a', { y: 2, x: 1 }));
  });

  it('differs when any part differs and never contains the parts', () => {
    expect(makeKey('a', 'secret1')).not.toBe(makeKey('a', 'secret2'));
    expect(makeKey('a', 'secret1')).not.toContain('secret1');
  });
});

describe('createCache', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('loads once and serves a hit until the ttl expires', async () => {
    const cache = createCache({ ttlMs: 1000, maxEntries: 5 });
    const loader = jest.fn().mockResolvedValue('v');

    expect((await cache.wrap('k', loader)).status).toBe('miss');
    const hit = await cache.wrap('k', loader);
    expect(hit).toMatchObject({ value: 'v', status: 'hit' });
    expect(loader).toBeCalledTimes(1);

    jest.advanceTimersByTime(1001);
    expect((await cache.wrap('k', loader)).status).toBe('miss');
    expect(loader).toBeCalledTimes(2);
  });

  it('shares one load between concurrent callers', async () => {
    const cache = createCache({ ttlMs: 1000, maxEntries: 5 });
    let resolve;
    const loader = jest.fn(() => new Promise((r) => (resolve = r)));

    const first = cache.wrap('k', loader);
    const second = cache.wrap('k', loader);
    await Promise.resolve();
    resolve('v');

    expect((await first).status).toBe('miss');
    expect(await second).toMatchObject({ value: 'v', status: 'shared' });
    expect(loader).toBeCalledTimes(1);
  });

  it('does not cache failures and lets the next call retry', async () => {
    const cache = createCache({ ttlMs: 1000, maxEntries: 5 });
    const loader = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('v');

    await expect(cache.wrap('k', loader)).rejects.toThrow('boom');
    expect((await cache.wrap('k', loader)).status).toBe('miss');
    expect(cache.stats()).toMatchObject({ errors: 1, misses: 1, inflight: 0 });
  });

  it('evicts the least recently used entry beyond maxEntries', async () => {
    const cache = createCache({ ttlMs: 1000, maxEntries: 2 });
    await cache.wrap('a', async () => 1);
    await cache.wrap('b', async () => 2);
    cache.get('a'); // a is now most recent
    await cache.wrap('c', async () => 3);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.stats().evictions).toBe(1);
  });

  it.each([
    [0, 5],
    [1000, 0],
  ])('is disabled with ttlMs=%s maxEntries=%s', async (ttlMs, maxEntries) => {
    const cache = createCache({ ttlMs, maxEntries });
    const loader = jest.fn().mockResolvedValue('v');

    expect((await cache.wrap('k', loader)).status).toBe('bypass');
    await cache.wrap('k', loader);
    expect(loader).toBeCalledTimes(2);
    expect(cache.size()).toBe(0);
  });
});
