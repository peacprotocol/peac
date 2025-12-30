/**
 * Result type utilities for adapter operations
 *
 * Enforces "never throws" invariant - all adapter functions return Result<T>.
 */

import type { AdapterError, AdapterErrorCode } from './types.js';

/**
 * Result type for adapter operations
 *
 * All adapter parsing/validation functions should return this type
 * instead of throwing exceptions. This makes error handling explicit
 * and predictable.
 *
 * @example
 * function parseEvent(input: unknown): Result<Event, AdapterError> {
 *   if (!input) {
 *     return adapterErr('input is required', 'missing_required_field');
 *   }
 *   return ok({ ... });
 * }
 */
export type Result<T, E = AdapterError> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create a generic error result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Create an adapter error result (convenience helper)
 *
 * @param message - Human-readable error message
 * @param code - Machine-readable error code
 * @param field - Optional field name that caused the error
 */
export function adapterErr(
  message: string,
  code: AdapterErrorCode,
  field?: string
): Result<never, AdapterError> {
  return err({ code, message, field });
}

/**
 * Check if result is ok (type guard)
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Check if result is error (type guard)
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Map over a successful result
 *
 * @example
 * const result = ok(5);
 * const doubled = map(result, x => x * 2); // ok(10)
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Map over an error result
 *
 * @example
 * const result = err({ message: 'oops' });
 * const mapped = mapErr(result, e => ({ ...e, prefix: 'Error: ' }));
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Chain results (flatMap/bind)
 *
 * @example
 * const parseNumber = (s: string): Result<number, string> => {
 *   const n = parseInt(s);
 *   return isNaN(n) ? err('not a number') : ok(n);
 * };
 *
 * const result = chain(ok('42'), parseNumber); // ok(42)
 */
export function chain<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Unwrap a result, throwing if it's an error
 *
 * Use sparingly - prefer explicit error handling.
 *
 * @throws The error value if result is an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value for errors
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}
