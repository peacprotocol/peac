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
export const JsonPrimitiveSchema = z.union([
  z.string(),
  JsonNumberSchema,
  z.boolean(),
  z.null(),
]);

/**
 * Plain object schema (internal) - validates object is plain before recursive validation
 */
const PlainObjectSchema = z
  .unknown()
  .refine(isPlainObject, {
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
