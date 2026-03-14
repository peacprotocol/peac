/**
 * Wire 0.2 Extension Validation (envelope-level superRefine helper)
 *
 * Validates the extensions record inside Wire02ClaimsSchema.superRefine():
 *   1. Extension key grammar validation
 *   2. Recursive plain-JSON-value guard (rejects non-JSON-safe values)
 *   3. Known extension group schema validation
 *   4. Byte-budget enforcement (DD-173.4)
 *
 * NORMATIVE: Extension group values MUST be plain JSON values all the
 * way down (objects, arrays, strings, finite numbers, booleans, null).
 * Arbitrary JavaScript objects (functions, Symbols, Dates, BigInt,
 * objects with toJSON(), circular references, non-finite numbers, etc.)
 * are not a supported input class and are rejected at the validation
 * boundary via E_EXTENSION_NON_JSON_VALUE. This ensures cross-language
 * portability and reproducible byte-budget measurement.
 *
 * MEASUREMENT BASIS: Byte budgets are measured as the UTF-8 byte length
 * of ECMAScript JSON.stringify() output on plain JSON data. This is
 * explicitly ECMAScript-defined, not language-neutral canonical JSON.
 * Equivalent objects with different member order can yield different
 * byte counts; if cross-language reproducibility is needed in the
 * future, a canonical JSON profile (e.g., JCS / RFC 8785) can be
 * adopted via a future DD without changing the budget constants.
 * See EXTENSION_BUDGET in @peac/kernel for the full specification.
 *
 * Schema does NOT emit warnings (unknown_extension_preserved belongs
 * in @peac/protocol.verifyLocal(), Layer 3).
 *
 * Layer 1 (@peac/schema): pure Zod validation, zero I/O (DD-141).
 */

import { z } from 'zod';
import { EXTENSION_BUDGET, ERROR_CODES as KERNEL_ERROR_CODES } from '@peac/kernel';
import { ERROR_CODES } from '../errors.js';
import { isValidExtensionKey } from './grammar.js';
import { EXTENSION_SCHEMA_MAP } from './schema-map.js';

// ---------------------------------------------------------------------------
// UTF-8 byte measurement (browser-safe, no Buffer dependency)
// ---------------------------------------------------------------------------

/** Shared TextEncoder instance (Layer 1 safe: no I/O, no fetch) */
const textEncoder = new TextEncoder();

/**
 * Measure UTF-8 byte length of a JSON-serialized value.
 *
 * Returns Infinity if serialization fails (circular references, BigInt,
 * etc.). Callers treat Infinity as over-budget, which produces a clear
 * E_EXTENSION_SIZE_EXCEEDED error.
 */
function jsonUtf8ByteLength(value: unknown): number {
  try {
    return textEncoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return Infinity;
  }
}

// ---------------------------------------------------------------------------
// Recursive plain-JSON-value guard
// ---------------------------------------------------------------------------

/**
 * Maximum recursion depth for the plain-JSON guard. Prevents stack
 * overflow on pathologically deep but structurally valid JSON trees.
 * 64 levels deep is far beyond any reasonable extension group shape.
 */
const MAX_JSON_GUARD_DEPTH = 64;

/**
 * Recursively check whether a value is a plain JSON value.
 *
 * A plain JSON value is one of:
 *   - null
 *   - boolean
 *   - finite number (NaN, Infinity, -Infinity rejected)
 *   - string
 *   - plain array where every element is a plain JSON value
 *   - plain object (prototype === Object.prototype or null, no toJSON)
 *     where every own enumerable value is a plain JSON value
 *
 * Rejects:
 *   - Functions, Symbols, BigInt, undefined
 *   - Non-finite numbers (NaN, Infinity, -Infinity)
 *   - Date, RegExp, Map, Set, TypedArray, Error, Promise
 *   - Objects with toJSON() methods (non-reproducible serialization)
 *   - Any object with a non-plain prototype
 *   - Circular references (detected via depth limit + seen set)
 *
 * @param value - Value to check
 * @param depth - Current recursion depth (bounded by MAX_JSON_GUARD_DEPTH)
 * @param seen - WeakSet for circular reference detection
 * @returns true if the value is a plain JSON value all the way down
 */
function isPlainJsonValueRecursive(value: unknown, depth: number, seen: WeakSet<object>): boolean {
  // Depth guard: reject pathologically deep structures
  if (depth > MAX_JSON_GUARD_DEPTH) return false;

  // Primitives
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(value as number);
  if (t === 'function' || t === 'symbol' || t === 'bigint' || t === 'undefined') return false;

  // Must be an object type from here
  if (t !== 'object') return false;
  const obj = value as object;

  // Reference cycle / shared-reference detection.
  // Intentionally rejects shared-but-acyclic subobjects (same JS reference
  // appearing in two places). JSON has no concept of object identity;
  // extensions must be JSON trees, not arbitrary JS object graphs. If the
  // same object appears twice, JSON.stringify would serialize it twice
  // (inflating byte count), and the data model is ambiguous. Rejecting
  // shared references ensures the extension tree matches a true JSON tree.
  if (seen.has(obj)) return false;
  seen.add(obj);

  // Array: recursively check every element
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (!isPlainJsonValueRecursive(obj[i], depth + 1, seen)) return false;
    }
    return true;
  }

  // Must be a plain object (no exotic prototype, no toJSON)
  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) return false;
  if (typeof (obj as Record<string, unknown>).toJSON === 'function') return false;

  // Recursively check every own enumerable value
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (!isPlainJsonValueRecursive((obj as Record<string, unknown>)[key], depth + 1, seen)) {
      return false;
    }
  }

  return true;
}

/**
 * Check whether a value is a plain JSON value all the way down.
 *
 * This is the public entry point for the recursive guard. It initializes
 * the depth counter and circular-reference detection set.
 *
 * @param value - Value to check
 * @returns true if the entire value tree is plain JSON
 */
function isPlainJsonValue(value: unknown): boolean {
  return isPlainJsonValueRecursive(value, 0, new WeakSet());
}

// ---------------------------------------------------------------------------
// Envelope-level extension validation
// ---------------------------------------------------------------------------

/**
 * Validate extensions record in Wire02ClaimsSchema.superRefine().
 *
 * Steps:
 *   1. Validate extension key grammar
 *   2. Recursive guard: reject non-plain-JSON values (E_EXTENSION_NON_JSON_VALUE)
 *   3. Validate known extension groups against their Zod schemas
 *   4. Unconditional byte-budget enforcement (DD-173.4)
 *
 * @param extensions - The extensions record from Wire 0.2 claims
 * @param ctx - Zod refinement context
 */
export function validateKnownExtensions(
  extensions: Record<string, unknown> | undefined,
  ctx: z.RefinementCtx
): void {
  if (extensions === undefined) return;

  const keys = Object.keys(extensions);

  for (const key of keys) {
    // Step 1: Validate extension key grammar
    if (!isValidExtensionKey(key)) {
      ctx.addIssue({
        code: 'custom',
        message: ERROR_CODES.E_INVALID_EXTENSION_KEY,
        path: ['extensions', key],
      });
      continue;
    }

    // Step 2: Recursive plain-JSON guard
    if (!isPlainJsonValue(extensions[key])) {
      ctx.addIssue({
        code: 'custom',
        message: KERNEL_ERROR_CODES.E_EXTENSION_NON_JSON_VALUE,
        path: ['extensions', key],
      });
      continue;
    }

    // Step 3: Validate known extension groups against their schemas
    const schema = EXTENSION_SCHEMA_MAP.get(key);
    if (schema !== undefined) {
      const result = schema.safeParse(extensions[key]);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        const issuePath: PropertyKey[] = firstIssue?.path ?? [];
        ctx.addIssue({
          code: 'custom',
          message: firstIssue?.message ?? 'Invalid extension value',
          path: ['extensions', key, ...issuePath],
        });
      }
    }
  }

  // Step 4: Byte-budget enforcement (DD-173.4, unconditional)
  const totalBytes = jsonUtf8ByteLength(extensions);
  if (totalBytes > EXTENSION_BUDGET.maxTotalBytes) {
    ctx.addIssue({
      code: 'custom',
      message: KERNEL_ERROR_CODES.E_EXTENSION_SIZE_EXCEEDED,
      path: ['extensions'],
    });
    return;
  }

  for (const key of keys) {
    const groupBytes = jsonUtf8ByteLength(extensions[key]);
    if (groupBytes > EXTENSION_BUDGET.maxGroupBytes) {
      ctx.addIssue({
        code: 'custom',
        message: KERNEL_ERROR_CODES.E_EXTENSION_SIZE_EXCEEDED,
        path: ['extensions', key],
      });
    }
  }
}

// Exported for testing only
export { isPlainJsonValue as _isPlainJsonValue };
