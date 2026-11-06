const axios = require('axios');
const Problem = require('api-problem');

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
