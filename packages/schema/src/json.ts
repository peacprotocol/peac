/**
 * JSON-safe validation schemas
 *
 * Provides Zod schemas that guarantee JSON roundtrip safety:
 * - Rejects NaN, Infinity, -Infinity (not valid JSON numbers)
 * - Rejects undefined (dropped by JSON.stringify)
 * - Rejects non-plain objects (Date, Map, Set, class instances)
 * - Rejects functions, symbols, bigints
 */

import { z } from 'zod';
import type { JsonValue, JsonObject, JsonArray } from '@peac/kernel';

/**
 * Check if value is a plain object (not Date, Map, Set, class instance, etc.)
 *
 * A plain object has prototype of Object.prototype or null.
 * This rejects Date, Map, Set, Array, and class instances even when
 * they have zero enumerable properties (which would pass z.record()).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * JSON number schema - rejects NaN and Infinity
 *
 * JSON.stringify(NaN) === "null" and JSON.stringify(Infinity) === "null"
 * which silently corrupts data. We reject these at validation time.
 */
const JsonNumberSchema = z.number().finite();

/**
 * JSON primitive schema - string, finite number, boolean, null
 */
export const JsonPrimitiveSchema = z.union([z.string(), JsonNumberSchema, z.boolean(), z.null()]);

/**
 * Plain object schema (internal) - validates object is plain before recursive validation
 */
const PlainObjectSchema = z.unknown().refine(isPlainObject, {
  message: 'Expected plain object, received non-plain object (Date, Map, Set, or class instance)',
});

/**
 * JSON value schema - recursive type for any valid JSON value
 *
 * Validates:
 * - Primitives: string, finite number, boolean, null
 * - Arrays: containing valid JSON values
 * - Objects: plain objects with string keys and valid JSON values
 *
 * Rejects:
 * - undefined (dropped by JSON.stringify)
 * - NaN, Infinity, -Infinity (become null in JSON)
 * - BigInt (throws in JSON.stringify)
 * - Date (becomes ISO string - implicit conversion)
 * - Map, Set (become {} in JSON)
 * - Functions, Symbols (dropped by JSON.stringify)
 * - Class instances (prototype chain lost)
 */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema),
    // Plain object check then record validation
    PlainObjectSchema.transform((obj) => obj as Record<string, unknown>).pipe(
      z.record(JsonValueSchema)
    ),
  ])
) as z.ZodType<JsonValue>;

/**
 * JSON object schema - plain object with string keys and JSON values
 *
 * Rejects non-plain objects (Date, Map, Set, class instances).
 */
export const JsonObjectSchema: z.ZodType<JsonObject> = PlainObjectSchema.transform(
  (obj) => obj as Record<string, unknown>
).pipe(z.record(JsonValueSchema)) as z.ZodType<JsonObject>;

/**
 * JSON array schema - array of JSON values
 */
export const JsonArraySchema: z.ZodType<JsonArray> = z.array(JsonValueSchema);

/**
 * Default limits for JSON evidence validation
 *
 * These are conservative defaults to prevent DoS attacks via deeply nested
 * or excessively large JSON structures.
 */
export const JSON_EVIDENCE_LIMITS = {
  /** Maximum nesting depth (default: 32) */
  maxDepth: 32,
  /** Maximum array length (default: 10,000) */
  maxArrayLength: 10_000,
  /** Maximum object keys (default: 1,000) */
  maxObjectKeys: 1_000,
  /** Maximum string length in bytes (default: 65,536 = 64KB) */
  maxStringLength: 65_536,
} as const;

/**
 * Limits for JSON evidence validation
 */
export interface JsonEvidenceLimits {
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
}

/**
 * Result of JSON safety validation
 */
export type JsonSafetyResult =
  | { ok: true }
  | { ok: false; error: string; path: (string | number)[] };

/**
 * Iterative JSON safety validator
 *
 * Validates that a value is JSON-safe without using recursion, preventing
 * stack overflow on deeply nested structures. Uses an explicit stack for
 * traversal and WeakSet for cycle detection.
 *
 * Rejects:
 * - Cycles (object references itself directly or indirectly)
 * - Non-plain objects (Date, Map, Set, class instances)
 * - Non-finite numbers (NaN, Infinity, -Infinity)
 * - undefined, BigInt, functions, symbols
 * - Structures exceeding depth/size limits
 *
 * @param value - Value to validate
 * @param limits - Optional limits (defaults to JSON_EVIDENCE_LIMITS)
 * @returns Result indicating success or failure with error details
 */
export function assertJsonSafeIterative(
  value: unknown,
  limits: JsonEvidenceLimits = {}
): JsonSafetyResult {
  const maxDepth = limits.maxDepth ?? JSON_EVIDENCE_LIMITS.maxDepth;
  const maxArrayLength = limits.maxArrayLength ?? JSON_EVIDENCE_LIMITS.maxArrayLength;
  const maxObjectKeys = limits.maxObjectKeys ?? JSON_EVIDENCE_LIMITS.maxObjectKeys;
  const maxStringLength = limits.maxStringLength ?? JSON_EVIDENCE_LIMITS.maxStringLength;

  // Track visited objects for cycle detection
  const visited = new WeakSet<object>();

  // Stack of items to process: [value, path, depth]
  const stack: Array<[unknown, (string | number)[], number]> = [[value, [], 0]];

  while (stack.length > 0) {
    const [current, path, depth] = stack.pop()!;

    // Check depth limit
    if (depth > maxDepth) {
      return {
        ok: false,
        error: `Maximum depth exceeded (limit: ${maxDepth})`,
        path,
      };
    }

    // Handle null (valid JSON)
    if (current === null) {
      continue;
    }

    // Handle primitives
    const type = typeof current;

    if (type === 'string') {
      if ((current as string).length > maxStringLength) {
        return {
          ok: false,
          error: `String exceeds maximum length (limit: ${maxStringLength})`,
          path,
        };
      }
      continue;
    }

    if (type === 'number') {
      if (!Number.isFinite(current as number)) {
        return {
          ok: false,
          error: `Non-finite number: ${current}`,
          path,
        };
      }
      continue;
    }

    if (type === 'boolean') {
      continue;
    }

    // Reject non-JSON types
    if (type === 'undefined') {
      return { ok: false, error: 'undefined is not valid JSON', path };
    }

    if (type === 'bigint') {
      return { ok: false, error: 'BigInt is not valid JSON', path };
    }

    if (type === 'function') {
      return { ok: false, error: 'Function is not valid JSON', path };
    }

    if (type === 'symbol') {
      return { ok: false, error: 'Symbol is not valid JSON', path };
    }

    // Handle objects (arrays and plain objects)
    if (type === 'object') {
      const obj = current as object;

      // Cycle detection
      if (visited.has(obj)) {
        return { ok: false, error: 'Cycle detected in object graph', path };
      }
      visited.add(obj);

      // Handle arrays
      if (Array.isArray(obj)) {
        if (obj.length > maxArrayLength) {
          return {
            ok: false,
            error: `Array exceeds maximum length (limit: ${maxArrayLength})`,
            path,
          };
        }
        // Push array elements to stack in reverse order for correct traversal
        for (let i = obj.length - 1; i >= 0; i--) {
          stack.push([obj[i], [...path, i], depth + 1]);
        }
        continue;
      }

      // Check for non-plain objects (Date, Map, Set, class instances, etc.)
      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) {
        const constructorName = obj.constructor?.name ?? 'unknown';
        return {
          ok: false,
          error: `Non-plain object (${constructorName}) is not valid JSON`,
          path,
        };
      }

      // Handle plain objects
      const keys = Object.keys(obj);
      if (keys.length > maxObjectKeys) {
        return {
          ok: false,
          error: `Object exceeds maximum key count (limit: ${maxObjectKeys})`,
          path,
        };
      }
      // Push object values to stack
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i];
        stack.push([(obj as Record<string, unknown>)[key], [...path, key], depth + 1]);
      }
      continue;
    }

    // Shouldn't reach here, but reject unknown types
    return { ok: false, error: `Unknown type: ${type}`, path };
  }

  return { ok: true };
}
