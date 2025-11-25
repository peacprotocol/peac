/**
 * JSON Canonicalization Scheme (RFC 8785)
 * Deterministic JSON serialization for cryptographic hashing
 */

/**
 * Canonicalize a JSON value according to RFC 8785
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
    const elements = obj.map(canonicalize);
    return `[${elements.join(',')}]`;
  }

  if (typeof obj === 'object') {
    // Sort keys lexicographically by UTF-16 code unit
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${canonicalize(value)}`;
    });
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
