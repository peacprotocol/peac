/**
 * JSON Canonicalization Scheme (RFC 8785)
 * Deterministic JSON serialization for cryptographic hashing
 *
 * PROTOCOL DECISION: JavaScript `undefined` Handling
 * ===================================================
 *
 * RFC 8785 canonicalizes JSON values, and `undefined` is NOT a JSON value.
 * This implementation adopts "JS-ergonomic" semantics that match JSON.stringify:
 *
 * 1. **Object properties with undefined values are OMITTED**
 *    - `canonicalize({a: 1, b: undefined})` -> `{"a":1}`
 *    - Matches: `JSON.stringify({a: 1, b: undefined})` -> `{"a":1}`
 *
 * 2. **Array elements that are undefined become null**
 *    - `canonicalize([1, undefined, 3])` -> `[1,null,3]`
 *    - Matches: `JSON.stringify([1, undefined, 3])` -> `[1,null,3]`
 *
 * 3. **Top-level undefined THROWS**
 *    - `canonicalize(undefined)` -> throws Error
 *    - Rationale: No valid JSON representation exists
 *
 * CROSS-LANGUAGE INTEROPERABILITY WARNING:
 * =========================================
 * Cross-language producers MUST NOT rely on "undefined" semantics. To achieve
 * identical hashes across implementations, explicitly encode `null` in arrays
 * and omit keys in objects. Other language implementations (Go, Rust, Python)
 * will never produce `undefined` since it's JavaScript-specific.
 *
 * Guidelines:
 * - Producers MUST emit explicit `null` or omit keys; do NOT rely on coercion
 * - Verifiers SHOULD sanitize inputs before hashing (remove undefined properties)
 * - The canonical output is identical whether you pass `{a: undefined}` or `{}`
 *
 * This behavior is NORMATIVE for PEAC hashing and MUST NOT change without
 * a wire format version bump.
 */

/**
 * Canonicalize a JSON value according to RFC 8785.
 *
 * @param obj - The value to canonicalize. Must be a valid JSON type (null, boolean,
 *              number, string, array, object). Functions and Symbols throw.
 * @returns Canonical JSON string with sorted keys and no whitespace.
 * @throws Error if the value cannot be canonicalized (undefined at top level,
 *         non-finite numbers, functions, symbols).
 *
 * @example
 * ```ts
 * canonicalize({ b: 2, a: 1 })  // '{"a":1,"b":2}'
 * canonicalize([1, null, "x"])   // '[1,null,"x"]'
 * ```
 */
export function canonicalize(obj: unknown): string {
  if (obj === null) {
    return 'null';
  }

  if (typeof obj === 'boolean') {
    return obj ? 'true' : 'false';
  }

  if (typeof obj === 'number') {
    // RFC 8785 number serialization (no trailing zeros, no exponential for small numbers)
    if (!Number.isFinite(obj)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    if (Object.is(obj, -0)) {
      return '0';
    }
    // Use JSON.stringify for proper number formatting per RFC 8785
    const str = JSON.stringify(obj);
    // Ensure no exponential notation for integers
    if (Number.isInteger(obj) && str.includes('e')) {
      return obj.toString();
    }
    return str;
  }

  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    // PROTOCOL DECISION: undefined in arrays becomes null (matches JSON.stringify)
    // See module-level documentation for cross-language interoperability notes.
    const elements = obj.map((el) => (el === undefined ? 'null' : canonicalize(el)));
    return `[${elements.join(',')}]`;
  }

  if (typeof obj === 'object') {
    // Sort keys lexicographically by UTF-16 code unit (RFC 8785 requirement)
    const keys = Object.keys(obj).sort();
    const pairs: string[] = [];
    for (const key of keys) {
      const value = (obj as Record<string, unknown>)[key];
      // PROTOCOL DECISION: Skip undefined values (matches JSON.stringify)
      // See module-level documentation for cross-language interoperability notes.
      if (value === undefined) {
        continue;
      }
      pairs.push(`${JSON.stringify(key)}:${canonicalize(value)}`);
    }
    return `{${pairs.join(',')}}`;
  }

  throw new Error(`Cannot canonicalize type: ${typeof obj}`);
}

/**
 * Canonicalize and encode as UTF-8 bytes
 */
export function canonicalizeBytes(obj: unknown): Uint8Array {
  const canonical = canonicalize(obj);
  return new TextEncoder().encode(canonical);
}

/**
 * Compute JCS+SHA-256 hash of an object
 */
export async function jcsHash(obj: unknown): Promise<string> {
  const bytes = canonicalizeBytes(obj);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
