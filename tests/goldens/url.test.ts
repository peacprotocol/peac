/**
 * Cross-Runtime Golden Tests for URL Normalization
 *
 * Ensures consistent URL canonicalization across all runtimes
 */

import { describe, test, expect } from 'vitest';
import { normalizeUrl } from '../../core/src/wasm.js';

describe('URL Normalization', () => {
  test('removes default HTTPS port', async () => {
    const input = 'https://example.com:443/path';
    const expected = 'https://example.com/path';

    const result = await normalizeUrl(input);
    expect(result).toBe(expected);
  });

  test('removes default HTTP port', async () => {
    const input = 'http://example.com:80/path';
    const expected = 'http://example.com/path';

    const result = await normalizeUrl(input);
    expect(result).toBe(expected);
  });

  test('preserves non-default ports', async () => {
    const input = 'https://example.com:8443/path';
    const expected = 'https://example.com:8443/path';

    const result = await normalizeUrl(input);
    expect(result).toBe(expected);
  });

  test('removes fragment', async () => {
    const input = 'https://example.com/path#fragment';
    const expected = 'https://example.com/path';

    const result = await normalizeUrl(input);
    expect(result).toBe(expected);
  });

  test('lowercases scheme and host', async () => {
    const input = 'HTTPS://EXAMPLE.COM/Path';
    const expected = 'https://example.com/Path';

    const result = await normalizeUrl(input);
    expect(result).toBe(expected);
  });

  test('preserves query parameters', async () => {
    const input = 'https://example.com/path?b=2&a=1';
    // Note: WHATWG URL may reorder params, but PEAC normalization preserves order
    const result = await normalizeUrl(input);

    expect(result).toContain('?');
    expect(result).toContain('a=1');
    expect(result).toContain('b=2');
  });

  test('golden: complex URL', async () => {
    const input = 'HTTPS://EXAMPLE.COM:443/path/to/resource?key=value&foo=bar#section';
    const expected = 'https://example.com/path/to/resource?key=value&foo=bar';

    const result = await normalizeUrl(input);
    expect(result).toBe(expected);
  });

  test('golden: root path', async () => {
    const input = 'https://example.com/';
    const expected = 'https://example.com/';

    const result = await normalizeUrl(input);
    expect(result).toBe(expected);
  });

  test('golden: no path', async () => {
    const input = 'https://example.com';
    const expected = 'https://example.com/';

    const result = await normalizeUrl(input);
    expect(result).toBe(expected);
  });

  test('handles encoded characters', async () => {
    const input = 'https://example.com/path%20with%20spaces';

    const result = await normalizeUrl(input);

    // URL normalization preserves or normalizes encoding
    expect(result).toContain('example.com');
    expect(result).toContain('path');
  });

  test('handles international domain names', async () => {
    const input = 'https://münchen.de/path';

    const result = await normalizeUrl(input);

    // Punycode conversion may occur
    expect(result).toContain('https://');
    expect(result).toContain('/path');
  });
});

describe('Cross-Runtime URL Stability', () => {
  test('deterministic normalization', async () => {
    const input = 'https://example.com:443/PATH?z=1&a=2#hash';

    const result1 = await normalizeUrl(input);
    const result2 = await normalizeUrl(input);

    expect(result1).toBe(result2);
  });

  test('golden: multiple normalizations', async () => {
    const urls = [
      'https://example.com:443/',
      'HTTPS://EXAMPLE.COM/',
      'https://example.com/#',
      'https://example.com',
    ];

    // All should normalize to the same URL
    const results = await Promise.all(urls.map((u) => normalizeUrl(u)));

    const expected = 'https://example.com/';
    results.forEach((result) => {
      expect(result).toBe(expected);
    });
  });
});
