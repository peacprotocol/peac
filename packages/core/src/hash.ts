/**
 * Normative policy hash implementation per v0.9.14+
 * RFC 8785 JCS + URL normalization rules
 *
 * v0.9.15: Uses WASM for deterministic cross-runtime hashing
 *
 * Canonicalization rules:
 * - Scheme/host: lowercase
 * - Ports: drop default (80 for HTTP, 443 for HTTPS)
 * - Paths: resolve dot-segments, percent-encode
 * - Query: preserve original order, normalize encoding
 * - Fragments: drop entirely
 * - JSON: JCS recursive key sorting
 */

import { jcsSha256, normalizeUrl as wasmNormalizeUrl } from '../../core/src/wasm.js';

export interface PolicyInputs {
  [key: string]: unknown;
}

// helper: base64url without padding
function b64url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// helper: stable percent-encoding with upper-case hex
function pctEncodeRFC3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

// URL canonicalization (scheme/host lowercased, default port removed, query sorted)
function canonicalizeUrl(input: string): string {
  const u = new URL(input);
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();

  // drop default ports
  const isHttps = u.protocol === 'https:';
  const isHttp = u.protocol === 'http:';
  if ((isHttps && u.port === '443') || (isHttp && u.port === '80')) u.port = '';

  // path: resolve dot segments via URL, then re-encode segments
  const segments = u.pathname.split('/').map((seg) => pctEncodeRFC3986(decodeURIComponent(seg)));
  // preserve leading slash; collapse duplicate slashes
  u.pathname = segments.join('/').replace(/\/{2,}/g, '/');

  // query: preserve original order but normalize encoding
  const qp = Array.from(u.searchParams.entries()).map(
    ([k, v]) => `${pctEncodeRFC3986(k)}=${pctEncodeRFC3986(v)}`
  );
  u.search = qp.length ? `?${qp.join('&')}` : '';

  // drop fragment
  u.hash = '';

  return u.toString();
}

// JSON Canonicalization (JCS) - sort keys recursively
function jcs(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(jcs).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => JSON.stringify(k) + ':' + jcs(value[k]));
  return '{' + entries.join(',') + '}';
}

/**
 * Canonicalize policy inputs using RFC 8785 JCS + URL normalization
 * Returns deterministic hash for policy comparison
 *
 * v0.9.15: Uses WASM for cross-runtime determinism
 */
export async function canonicalPolicyHash(input: any): Promise<string> {
  // clone to avoid mutating caller
  const obj = JSON.parse(JSON.stringify(input));

  // normalize all URLs in the object recursively
  await normalizeUrlsInObject(obj);

  // Use WASM JCS + SHA-256 for deterministic hashing
  return await jcsSha256(obj);
}

// recursively normalize URLs in any object structure (uses WASM)
async function normalizeUrlsInObject(obj: any): Promise<void> {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string' && isUrl(obj[i])) {
        obj[i] = await wasmNormalizeUrl(obj[i]);
      } else if (typeof obj[i] === 'object') {
        await normalizeUrlsInObject(obj[i]);
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && isUrl(value)) {
        obj[key] = await wasmNormalizeUrl(value);
      } else if (typeof value === 'object') {
        await normalizeUrlsInObject(value);
      }
    }
  }
}

// helper to detect URLs
function isUrl(str: string): boolean {
  return typeof str === 'string' && /^https?:\/\//.test(str);
}
