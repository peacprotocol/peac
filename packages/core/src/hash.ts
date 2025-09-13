/**
 * Normative policy hash implementation per v0.9.12.4
 * RFC 8785 JCS + URL normalization rules
 */

import { createHash } from 'node:crypto';

export interface PolicyInputs {
  [key: string]: unknown;
}

/**
 * Canonicalize policy inputs using RFC 8785 JCS + URL normalization
 * Returns deterministic hash for policy comparison
 */
export function canonicalPolicyHash(inputs: PolicyInputs): string {
  const normalized = normalizeInputs(inputs);
  const canonical = jsonCanonicalStringify(normalized);
  return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

/**
 * Normalize policy inputs with URL normalization rules
 */
function normalizeInputs(inputs: PolicyInputs): PolicyInputs {
  const result: PolicyInputs = {};

  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'string' && isUrl(value)) {
      result[key] = normalizeUrl(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = normalizeInputs(value as PolicyInputs);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string' && isUrl(item)
          ? normalizeUrl(item)
          : typeof item === 'object' && item !== null
            ? normalizeInputs(item as PolicyInputs)
            : item
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * URL normalization per v0.9.12.4 spec:
 * - scheme/host lowercased
 * - drop default ports (http:80, https:443)
 * - resolve dot-segments
 * - decode only unreserved percent-encodings
 * - preserve trailing slash
 * - do not reorder query params
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Lowercase scheme and host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    // Decode only unreserved characters in pathname
    parsed.pathname = decodeUnreservedOnly(parsed.pathname);

    // Resolve dot segments
    parsed.pathname = resolveDotSegments(parsed.pathname);

    return parsed.toString();
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}

/**
 * Decode only unreserved percent-encodings (A-Z a-z 0-9 - . _ ~)
 * Never decode reserved characters like / ? # etc
 */
function decodeUnreservedOnly(str: string): string {
  return str.replace(/%([0-9A-Fa-f]{2})/g, (match, hex) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    // Only decode unreserved characters
    if (/[A-Za-z0-9\-._~]/.test(char)) {
      return char;
    }
    // Keep percent-encoded for reserved/other characters
    return match;
  });
}

/**
 * Resolve dot segments per RFC 3986
 */
function resolveDotSegments(path: string): string {
  const segments = path.split('/');
  const output: string[] = [];

  for (const segment of segments) {
    if (segment === '..') {
      if (output.length > 0) {
        output.pop();
      }
    } else if (segment !== '.' && segment !== '') {
      output.push(segment);
    }
  }

  // Preserve leading and trailing slashes
  let result = output.join('/');
  if (path.startsWith('/')) {
    result = '/' + result;
  }
  if (path.endsWith('/') && !result.endsWith('/')) {
    result += '/';
  }

  return result || '/';
}

/**
 * Simple URL detection
 */
function isUrl(str: string): boolean {
  return /^https?:\/\//.test(str);
}

/**
 * JSON Canonical Serialization per RFC 8785
 */
function jsonCanonicalStringify(obj: unknown): string {
  if (obj === null) {
    return 'null';
  }

  if (typeof obj === 'boolean') {
    return obj ? 'true' : 'false';
  }

  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    return obj.toString();
  }

  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => jsonCanonicalStringify(item));
    return '[' + items.join(',') + ']';
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj as object).sort();
    const pairs = keys.map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return JSON.stringify(key) + ':' + jsonCanonicalStringify(value);
    });
    return '{' + pairs.join(',') + '}';
  }

  throw new Error(`Cannot canonicalize value of type ${typeof obj}`);
}
