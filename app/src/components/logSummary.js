/**
 * Helpers that describe data for log output without writing the data itself.
 * Submission data can hold personal information, so by default logs carry the
 * shape of a payload (field names, types, sizes) and not its values.
 */

const MAX_KEYS = 50;

/**
 * @function describeShape
 * Describes the structure of a value: object keys (recursively, to a limited
 * depth), array lengths and primitive types, but never primitive values.
 * @param {*} value Value to describe
 * @param {number} [depth] How many levels of nested objects to describe
 * @returns {*} A description safe to log
 */
const describeShape = (value, depth = 2) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value !== 'object') return typeof value;
  const keys = Object.keys(value);
  if (depth <= 0) return `object(${keys.length} keys)`;
  const out = {};
  for (const key of keys.slice(0, MAX_KEYS)) {
    out[key] = describeShape(value[key], depth - 1);
  }
  if (keys.length > MAX_KEYS) out['...'] = `${keys.length - MAX_KEYS} more keys`;
  return out;
};

/**
 * @function sizeOf
 * Approximate size in bytes of a value once serialized to JSON.
 * @param {*} value Value to measure
 * @returns {number|undefined} Size in bytes, undefined when it can not be serialized
 */
const sizeOf = (value) => {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '');
  } catch (e) {
    return undefined;
  }
};

/**
 * @function loggable
 * Returns the value itself when it is small, otherwise only its shape, so a
 * large payload can never flood the log.
 * @param {*} value Value to log
 * @param {number} [maxBytes] Largest serialized size that is logged in full
 * @returns {*} The value, or a description of it
 */
const loggable = (value, maxBytes = 4096) => {
  const size = sizeOf(value);
  if (size !== undefined && size <= maxBytes) return value;
  return { truncated: true, bytes: size, shape: describeShape(value) };
};

module.exports = { describeShape, loggable, sizeOf };
