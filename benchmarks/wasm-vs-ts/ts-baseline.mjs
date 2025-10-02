/**
 * TypeScript baseline implementations for WASM comparison
 * Pure JS/TS implementations without WASM
 */

import { createHash } from 'node:crypto';

/**
 * JCS canonicalization (TypeScript)
 */
export function canonicalize_json(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize_json).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => JSON.stringify(k) + ':' + canonicalize_json(value[k]));
  return '{' + entries.join(',') + '}';
}

/**
 * URL normalization (TypeScript)
 */
export function normalize_url(input) {
  const u = new URL(input);
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();

  // Remove default ports
  const isHttps = u.protocol === 'https:';
  const isHttp = u.protocol === 'http:';
  if ((isHttps && u.port === '443') || (isHttp && u.port === '80')) {
    u.port = '';
  }

  // Remove fragment
  u.hash = '';

  return u.toString();
}

/**
 * Selector normalization (TypeScript)
 */
export function normalize_selector(input) {
  return input.trim().split(/\s+/).join(' ');
}

/**
 * JCS SHA-256 hash (TypeScript)
 */
export function jcs_sha256(input) {
  const canonical = typeof input === 'string' ? input : canonicalize_json(input);
  const hash = createHash('sha256').update(canonical, 'utf8').digest();
  return hash.toString('base64url');
}
