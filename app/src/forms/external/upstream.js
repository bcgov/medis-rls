const axios = require('axios');
const config = require('config');
const Problem = require('api-problem');

const { createCache, makeKey } = require('../../components/cache');
const log = require('../../components/log')(module.filename);

/** Per-attempt timeout for a call to CHEFS, in milliseconds. */
const UPSTREAM_TIMEOUT_MS = 10000;
/** Maximum number of attempts (initial call plus retries) for a call to CHEFS. */
const UPSTREAM_MAX_ATTEMPTS = 3;
/** Base delay between attempts, doubled on each retry. */
const UPSTREAM_RETRY_DELAY_MS = 500;
/**
 * Value sent in the Retry-After header when the upstream call fails. Tells the
 * external caller not to keep hammering us: stop retrying for 500 seconds.
 */
const UPSTREAM_RETRY_AFTER_SECONDS = 500;

/**
 * @function isUpstreamError
 * Whether the error came from an outbound HTTP call (axios) rather than this
 * service or its database.
 */
const isUpstreamError = (err) => Boolean(err && (err.isAxiosError || axios.isAxiosError(err)));

/**
 * @function isUpstreamTimeout
 * Whether an axios error is a timeout (connect or response) rather than an
 * upstream response or a connection failure.
 */
const isUpstreamTimeout = (err) => Boolean(err && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message || '')));

/**
 * @function isRetryable
 * Only retry when the request never got an answer, or the upstream answered
 * with a server error. Client errors (4xx) will not change on a retry.
 */
const isRetryable = (err) => {
  if (!isUpstreamError(err)) return false;
  if (!err.response) return true;
  return err.response.status >= 500 || err.response.status === 429;
};

/** Only calls to this origin and path prefix are ever allowed. */
const CHEFS_API_BASE = 'https://submit.digital.gov.bc.ca/app/api/v1';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @function isValidFormId
 * CHEFS form ids are UUIDs. Rejecting anything else keeps user input from
 * altering the path of the upstream request.
 */
const isValidFormId = (formId) => typeof formId === 'string' && UUID_REGEX.test(formId);

/**
 * @function buildFormUrl
 * Builds a CHEFS URL for a form from validated parts. The form id is
 * validated and encoded, and query values are encoded by URLSearchParams.
 * @param {string} formId must be a UUID
 * @param {string} resource fixed path suffix, e.g. 'submissions'
 * @param {object} [query] query parameters
 * @throws {Error} when the form id is not a UUID
 */
const buildFormUrl = (formId, resource, query) => {
  if (!isValidFormId(formId)) throw new TypeError('Invalid form id');
  const url = new URL(`${CHEFS_API_BASE}/forms/${encodeURIComponent(formId)}/${resource}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
};

/** Throws unless the URL points inside the CHEFS API. */
const assertAllowedUrl = (url) => {
  const parsed = new URL(url);
  const base = new URL(CHEFS_API_BASE);
  if (parsed.origin !== base.origin || !parsed.pathname.startsWith(`${base.pathname}/`) || parsed.pathname.includes('..')) {
    throw new TypeError('Upstream URL is not allowed');
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @function createUpstreamClient
 * Builds an axios instance with a per-attempt timeout that sends the given
 * basic auth credentials on every request.
 * @param {string} username
 * @param {string} password
 * @param {object} [options]
 * @param {number} [options.timeout] Per-attempt timeout in milliseconds
 */
const createUpstreamClient = (username, password, options = {}) => {
  const basicAuthEncoded = Buffer.from(`${username}:${password}`).toString('base64');
  const instance = axios.create({ timeout: options.timeout ?? UPSTREAM_TIMEOUT_MS });
  instance.interceptors.request.use(
    (cfg) => {
      cfg.headers = { ...cfg.headers, authorization: `Basic ${basicAuthEncoded}` };
      return cfg;
    },
    (error) => Promise.reject(error)
  );
  return instance;
};

/**
 * @function getWithRetry
 * Performs a GET through the client, retrying a bounded number of times on
 * timeouts, connection failures and upstream 5xx responses.
 * @param {import('axios').AxiosInstance} client
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.maxAttempts] Total attempts, including the first
 * @param {number} [options.retryDelayMs] Base delay between attempts
 */
const getWithRetry = async (client, url, options = {}) => {
  assertAllowedUrl(url);
  const maxAttempts = Math.max(1, options.maxAttempts ?? UPSTREAM_MAX_ATTEMPTS);
  const retryDelayMs = options.retryDelayMs ?? UPSTREAM_RETRY_DELAY_MS;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.get(url);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isRetryable(err)) break;
      const delay = retryDelayMs * 2 ** (attempt - 1);
      log.warn(`Upstream request failed (attempt ${attempt} of ${maxAttempts}), retrying in ${delay}ms: ${err.message}`, {
        function: 'getWithRetry',
        url,
        status: err.response?.status,
        code: err.code,
      });
      if (delay > 0) await sleep(delay);
    }
  }
  throw lastError;
};

/**
 * Cache of successful CHEFS responses. In-process, so each replica has its own.
 * Configured with server.externalCache.ttlMs and server.externalCache.maxEntries;
 * a ttl of 0 turns it off.
 */
const upstreamCache = createCache({
  name: 'external-chefs',
  ttlMs: config.get('server.externalCache.ttlMs'),
  maxEntries: config.get('server.externalCache.maxEntries'),
});

/**
 * @function cachedGet
 * Fetches a CHEFS form resource, serving it from the cache when a fresh copy
 * exists and sharing one upstream call between concurrent identical requests.
 * Only the response body is cached, never per-user results, so callers must do
 * any user-specific filtering after this call. The credential is part of the
 * cache key (hashed), so a caller with a wrong secret can never be served data
 * cached for the right one.
 * @param {object} params
 * @param {string} params.formId CHEFS form UUID
 * @param {string} params.secret CHEFS API key secret for the form
 * @param {string} params.resource Path suffix such as 'submissions' or 'export'
 * @param {object} [params.query] Query parameters
 * @param {string} [params.requestId] Correlation id for log output
 * @returns {Promise<{data: *, cache: string, ageMs: number, durationMs: number}>}
 */
const cachedGet = async ({ formId, secret, resource, query, requestId }) => {
  const url = buildFormUrl(formId, resource, query);
  const key = makeKey('chefs', formId, resource, query || {}, secret);
  const started = Date.now();
  const meta = { function: 'cachedGet', requestId, formId, resource };
  try {
    const result = await upstreamCache.wrap(key, async () => {
      const response = await getWithRetry(createUpstreamClient(formId, secret), url);
      return response?.data;
    });
    const durationMs = Date.now() - started;
    log.info(`CHEFS ${resource} for form ${formId}: cache ${result.status} in ${durationMs}ms`, {
      ...meta,
      cache: result.status,
      cacheAgeMs: result.status === 'hit' ? result.ageMs : undefined,
      durationMs,
      records: Array.isArray(result.value) ? result.value.length : undefined,
      cacheStats: upstreamCache.stats(),
    });
    return { data: result.value, cache: result.status, ageMs: result.ageMs, durationMs };
  } catch (err) {
    log.warn(`CHEFS ${resource} for form ${formId} failed after ${Date.now() - started}ms: ${err.message}`, {
      ...meta,
      durationMs: Date.now() - started,
      status: err.response?.status,
      code: err.code,
      cacheStats: upstreamCache.stats(),
    });
    throw err;
  }
};

/**
 * @function toUpstreamProblem
 * Converts an axios error into a 504 (timeout) or 502 (any other upstream
 * failure) Problem carrying a Retry-After header.
 * @param {Error} err
 * @returns {Problem|undefined} undefined when the error is not an upstream error
 */
const toUpstreamProblem = (err) => {
  if (!isUpstreamError(err)) return undefined;

  const retryAfterDetail = `Stop retrying for ${UPSTREAM_RETRY_AFTER_SECONDS} seconds.`;
  const upstream = err.response ? { status: err.response.status, statusText: err.response.statusText } : { code: err.code };

  if (isUpstreamTimeout(err)) {
    return new Problem(504, 'Gateway Timeout', {
      detail: `The upstream CHEFS service did not respond within ${UPSTREAM_TIMEOUT_MS / 1000} seconds. ${retryAfterDetail}`,
      retryAfter: UPSTREAM_RETRY_AFTER_SECONDS,
      upstream,
    });
  }

  return new Problem(502, 'Bad Gateway', {
    detail: `The upstream CHEFS service returned an error. ${retryAfterDetail}`,
    retryAfter: UPSTREAM_RETRY_AFTER_SECONDS,
    upstream,
  });
};

/**
 * @function errorHandler
 * Express error handler for the external routes. Upstream (axios) failures are
 * answered here with a 502 or 504 and never reach the global handler, so a
 * flaky CHEFS call cannot cause a database pool reset. Everything else is
 * passed along unchanged.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, next) => {
  const problem = toUpstreamProblem(err);
  if (!problem) return next(err);

  log.warn(`Upstream request failed: ${err.message}`, {
    function: 'errorHandler',
    status: problem.status,
    upstreamStatus: err.response?.status,
    code: err.code,
  });
  res.set('Retry-After', String(UPSTREAM_RETRY_AFTER_SECONDS));
  problem.send(res);
};

module.exports = {
  CHEFS_API_BASE,
  assertAllowedUrl,
  buildFormUrl,
  cachedGet,
  upstreamCache,
  isValidFormId,
  UPSTREAM_TIMEOUT_MS,
  UPSTREAM_MAX_ATTEMPTS,
  UPSTREAM_RETRY_DELAY_MS,
  UPSTREAM_RETRY_AFTER_SECONDS,
  createUpstreamClient,
  errorHandler,
  getWithRetry,
  isRetryable,
  isUpstreamError,
  isUpstreamTimeout,
  toUpstreamProblem,
};
