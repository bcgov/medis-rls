const crypto = require('crypto');

const getLogger = require('./log');
const log = getLogger(module.filename);

/**
 * @function makeKey
 * Builds a fixed-length cache key from any number of parts. The parts are
 * hashed, so secrets (such as API keys) can be part of a key without ever being
 * stored in, or logged from, the cache. Object parts are serialized with their
 * keys sorted so that equivalent objects produce the same key.
 * @param {...*} parts Values that together identify a cached entry
 * @returns {string} A sha256 hex digest
 */
const makeKey = (...parts) => {
  const normalize = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, normalize(value[k])])
      );
    }
    return value;
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(parts.map(normalize)))
    .digest('hex');
};

/**
 * @function createCache
 * Creates an in-process cache with a time-to-live, a maximum number of entries
 * (least recently used entries are evicted first) and sharing of in-flight
 * loads, so concurrent requests for the same key trigger only one load.
 *
 * The cache is per process. When the service runs several replicas, each one
 * has its own cache. Failed loads are never cached.
 *
 * @param {object} options
 * @param {string} [options.name] Name used in log output
 * @param {number} options.ttlMs Time to live in milliseconds. 0 or less disables the cache
 * @param {number} options.maxEntries Maximum entries kept. 0 or less disables the cache
 * @returns {object} cache with wrap, get, set, delete, clear, size and stats
 */
const createCache = ({ name = 'cache', ttlMs, maxEntries } = {}) => {
  const ttl = Number(ttlMs);
  const max = Number(maxEntries);
  const enabled = Number.isFinite(ttl) && ttl > 0 && Number.isFinite(max) && max > 0;

  const entries = new Map(); // key -> { value, expiresAt, storedAt }; Map order is recency order
  const inflight = new Map(); // key -> Promise of a load in progress
  const stats = { hits: 0, misses: 0, shared: 0, errors: 0, evictions: 0, bypassed: 0 };

  const isFresh = (entry) => entry.expiresAt > Date.now();

  const evict = () => {
    if (entries.size <= max) return;
    // Drop expired entries first, then the least recently used ones.
    for (const [key, entry] of entries) {
      if (!isFresh(entry)) entries.delete(key);
    }
    while (entries.size > max) {
      entries.delete(entries.keys().next().value);
      stats.evictions++;
    }
  };

  const api = {
    /** Whether caching is turned on. When off, wrap always calls the loader. */
    enabled,

    /** Returns a fresh entry's value, or undefined. Refreshes its recency. */
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (!isFresh(entry)) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },

    set(key, value) {
      if (!enabled) return;
      entries.delete(key);
      entries.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ttl });
      evict();
    },

    delete: (key) => entries.delete(key),

    clear() {
      entries.clear();
    },

    size: () => entries.size,

    stats: () => ({ ...stats, size: entries.size, inflight: inflight.size }),

    /**
     * Returns the cached value for the key, or calls the loader, caches what it
     * returns and shares that one call with concurrent callers of the same key.
     * @param {string} key Cache key (see makeKey)
     * @param {function} loader Async function producing the value
     * @returns {Promise<{value: *, status: string, ageMs: number}>} status is one of
     *   'hit', 'miss' (this call loaded it), 'shared' (waited on another call's
     *   load) or 'bypass' (caching disabled). ageMs is the age of a hit.
     */
    async wrap(key, loader) {
      if (!enabled) {
        stats.bypassed++;
        return { value: await loader(), status: 'bypass', ageMs: 0 };
      }

      const entry = entries.get(key);
      if (entry && isFresh(entry)) {
        entries.delete(key);
        entries.set(key, entry);
        stats.hits++;
        return { value: entry.value, status: 'hit', ageMs: Date.now() - entry.storedAt };
      }
      if (entry) entries.delete(key);

      const pending = inflight.get(key);
      if (pending) {
        stats.shared++;
        return { value: await pending, status: 'shared', ageMs: 0 };
      }

      const load = Promise.resolve().then(loader);
      inflight.set(key, load);
      try {
        const value = await load;
        api.set(key, value);
        stats.misses++;
        return { value, status: 'miss', ageMs: 0 };
      } catch (err) {
        stats.errors++;
        throw err;
      } finally {
        inflight.delete(key);
      }
    },
  };

  log.info(`Cache "${name}" ${enabled ? `enabled (ttl ${ttl}ms, max ${max} entries)` : 'disabled'}`, { function: 'createCache', cache: name });
  return api;
};

module.exports = { createCache, makeKey };
