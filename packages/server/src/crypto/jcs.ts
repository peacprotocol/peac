/**
 * Minimal JSON Canonicalization Scheme (JCS) implementation.
 * Produces a stable JSON string:
 *  - Objects: keys sorted lexicographically, no extra whitespace
 *  - Arrays: elements canonicalized in order
 *  - Primitives: JSON-encoded
 * Notes:
 *  - Functions/symbols/bigint are not JSON; render as null
 *  - Dates/Maps/Sets should be pre-normalized by callers
 */
export function canonicalize(input: unknown): string {
  if (input === null || input === undefined) return 'null';

  const t = typeof input;
  if (t === 'number' || t === 'boolean' || t === 'string') {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return '[' + input.map(canonicalize).join(',') + ']';
  }

  if (t === 'object') {
    const obj = input as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(JSON.stringify(k) + ':' + canonicalize(obj[k]));
    }
    return '{' + parts.join(',') + '}';
  }

  return 'null';
}
