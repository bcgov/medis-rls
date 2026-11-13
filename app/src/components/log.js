const config = require('config');
const jwt = require('jsonwebtoken');
const { parse } = require('path');
const Transport = require('winston-transport');
const { createLogger, format, transports } = require('winston');
const { logger } = require('express-winston');

/**
 * Class representing a winston transport writing to null
 * @extends Transport
 */
class NullTransport extends Transport {
  /**
   * Constructor
   * @param {object} opts Winston Transport options
   */
  constructor(opts) {
    super(opts);
  }

  /**
   * The transport logger
   * @param {object} _info Object to log
   * @param {function} callback Callback function
   */
  log(_info, callback) {
    callback();
  }
}

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /authorization|api[-_]?key|apikey|password|passwd|secret|token|cookie|credential/i;
const SENSITIVE_VALUE = /\b(Basic|Bearer)\s+[A-Za-z0-9\-._~+/]+=*/g;
const MAX_DEPTH = 8;

/**
 * Returns a copy of value with sensitive keys and Basic/Bearer credentials
 * masked. Never mutates the original, so live error objects are untouched.
 * @param {*} value Value to sanitize
 * @param {WeakSet} [seen] Objects already visited, to break cycles
 * @param {number} [depth] Current depth
 * @returns {*} Sanitized copy
 */
const redact = (value, seen = new WeakSet(), depth = 0) => {
  if (typeof value === 'string') return value.replace(SENSITIVE_VALUE, '$1 ' + REDACTED);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value) || depth >= MAX_DEPTH) return '[Circular or too deep]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, seen, depth + 1));
  const out = {};
  const keys = value instanceof Error ? ['name', 'message', 'stack', ...Object.keys(value)] : Object.keys(value);
  for (const key of keys) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(value[key], seen, depth + 1);
  }
  return out;
};

/** Winston format that masks credentials anywhere in a log entry. */
const redactFormat = format((info) => {
  // Mutate top level string keys only so winston's Symbol keys are preserved
  for (const key of Object.keys(info)) {
    if (key === 'level') continue;
    info[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(info[key]);
  }
  return info;
});

/**
 * Main Winston Logger
 * @returns {object} Winston Logger
 */
const log = createLogger({
  exitOnError: false,
  format: format.combine(
    format.errors({ stack: true }), // Force errors to show stacktrace
    redactFormat(), // Mask credentials (auth headers, api keys, tokens) before output
    format.timestamp(), // Add ISO timestamp to each entry
    format.json() // Force output to be in JSON format
  ),
  level: config.get('server.logLevel'),
});

if (process.env.NODE_ENV !== 'test') {
  log.add(new transports.Console({ handleExceptions: true }));
} else {
  log.add(new NullTransport());
}

if (config.has('server.logFile')) {
  log.add(
    new transports.File({
      filename: config.get('server.logFile'),
      handleExceptions: true,
    })
  );
}

/**
 * Returns a Winston Logger or Child Winston Logger
 * @param {string} [filename] Optional module filename path to annotate logs with
 * @returns {object} A child logger with appropriate metadata if `filename` is defined. Otherwise returns a standard logger.
 */
const getLogger = (filename) => {
  return filename ? log.child({ component: parse(filename).name }) : log;
};

/**
 * Returns an express-winston middleware function for http logging
 * @returns {function} An express-winston middleware function
 */
const httpLogger = logger({
  colorize: false,
  // Parses express information to insert into log output
  dynamicMeta: (req, res) => {
    const token = jwt.decode((req.get('authorization') || '').slice(7));
    return {
      azp: (token && token.azp) || undefined,
      contentLength: res.get('content-length'),
      requestContentLength: req.get('content-length'),
      requestId: req.requestId,
      formId: (req.auth && req.auth.user) || undefined,
      httpVersion: req.httpVersion,
      ip: req.ip,
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length ? req.query : undefined,
      responseTime: res.responseTime,
      statusCode: res.statusCode,
      userAgent: req.get('user-agent'),
      username: (token && token.idp_username) || undefined,
    };
  },
  expressFormat: true, // Use express style message strings
  level: 'http',
  meta: true, // Must be true for dynamicMeta to execute
  metaField: null, // Set to null for all attributes to be at top level object
  requestWhitelist: [], // Suppress default value output
  responseWhitelist: [], // Suppress default value output
  // Skip logging kube-probe requests
  skip: (req) => req.get('user-agent') && req.get('user-agent').includes('kube-probe'),
  winstonInstance: log,
});

module.exports = getLogger;
module.exports.httpLogger = httpLogger;
module.exports.NullTransport = NullTransport;
module.exports.redact = redact;
