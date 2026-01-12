/**
 * @peac/mappings-ucp - Verification tests
 */

import { describe, it, expect } from 'vitest';
import { parseDetachedJws, findSigningKey } from '../src/verify.js';
import { ErrorCodes } from '../src/errors.js';
import type { UcpProfile } from '../src/types.js';

describe('parseDetachedJws', () => {
  it('parses valid ES256 detached JWS', () => {
    // Valid detached JWS with ES256
    const header = { alg: 'ES256', kid: 'test-key-001' };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU'; // Placeholder

    const jws = `${headerB64}..${signature}`;
    const result = parseDetachedJws(jws);

    expect(result.header.alg).toBe('ES256');
    expect(result.header.kid).toBe('test-key-001');
    expect(result.is_unencoded_payload).toBe(false);
  });

  it('parses detached JWS with b64=false', () => {
    const header = { alg: 'ES256', kid: 'test-key-001', b64: false, crit: ['b64'] };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;
    const result = parseDetachedJws(jws);

    expect(result.header.b64).toBe(false);
    expect(result.header.crit).toContain('b64');
    expect(result.is_unencoded_payload).toBe(true);
  });

  it('rejects non-detached JWS (has payload)', () => {
    const header = { alg: 'ES256', kid: 'test-key-001' };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const payloadB64 = 'eyJ0ZXN0IjoidmFsdWUifQ'; // {"test":"value"}
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}.${payloadB64}.${signature}`;

    expect(() => parseDetachedJws(jws)).toThrow();
  });

  it('rejects missing two-part JWS', () => {
    expect(() => parseDetachedJws('header.signature')).toThrow();
  });

  it('rejects unsupported algorithm', () => {
    const header = { alg: 'RS256', kid: 'test-key-001' };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;

    expect(() => parseDetachedJws(jws)).toThrow();
  });

  it('rejects missing kid', () => {
    const header = { alg: 'ES256' };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;

    expect(() => parseDetachedJws(jws)).toThrow();
  });

  it('rejects b64=false without crit', () => {
    const header = { alg: 'ES256', kid: 'test-key-001', b64: false };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;

    expect(() => parseDetachedJws(jws)).toThrow();
  });

  it('rejects b64=false with crit not containing b64', () => {
    const header = { alg: 'ES256', kid: 'test-key-001', b64: false, crit: ['b64', 'unknown'] };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;

    // Should reject because 'unknown' is not understood
    expect(() => parseDetachedJws(jws)).toThrow(/Unknown critical header parameters/);
  });

  it('rejects unknown crit headers (JOSE crit semantics)', () => {
    // Per JOSE rules: if crit exists, every entry MUST be understood
    const header = { alg: 'ES256', kid: 'test-key-001', crit: ['x-custom'] };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;

    expect(() => parseDetachedJws(jws)).toThrow(/Unknown critical header parameters.*x-custom/);
  });

  it('rejects multiple unknown crit headers', () => {
    const header = { alg: 'ES256', kid: 'test-key-001', crit: ['unknown1', 'unknown2'] };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;

    expect(() => parseDetachedJws(jws)).toThrow(
      /Unknown critical header parameters.*unknown1.*unknown2/
    );
  });

  it('accepts ES384 algorithm', () => {
    const header = { alg: 'ES384', kid: 'test-key-001' };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;
    const result = parseDetachedJws(jws);

    expect(result.header.alg).toBe('ES384');
  });

  it('accepts ES512 algorithm', () => {
    const header = { alg: 'ES512', kid: 'test-key-001' };
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    const signature = 'dGVzdC1zaWduYXR1cmU';

    const jws = `${headerB64}..${signature}`;
    const result = parseDetachedJws(jws);

    expect(result.header.alg).toBe('ES512');
  });

  // Edge case tests for strict header validation
  describe('strict header validation', () => {
    it('rejects crit that is not an array', () => {
      // crit: "b64" (string, not array)
      const header = { alg: 'ES256', kid: 'test-key-001', crit: 'b64' };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;

      expect(() => parseDetachedJws(jws)).toThrow(/crit header must be an array/);
    });

    it('rejects crit that is an object', () => {
      const header = { alg: 'ES256', kid: 'test-key-001', crit: { b64: true } };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;

      expect(() => parseDetachedJws(jws)).toThrow(/crit header must be an array/);
    });

    it('rejects crit array containing non-strings', () => {
      // crit: ['b64', 123] - contains a number
      const header = { alg: 'ES256', kid: 'test-key-001', crit: ['b64', 123] };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;

      expect(() => parseDetachedJws(jws)).toThrow(/crit array must contain only strings/);
    });

    it('rejects crit array containing null', () => {
      const header = { alg: 'ES256', kid: 'test-key-001', crit: ['b64', null] };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;

      expect(() => parseDetachedJws(jws)).toThrow(/crit array must contain only strings/);
    });

    it('rejects crit array with duplicate entries', () => {
      const header = { alg: 'ES256', kid: 'test-key-001', crit: ['b64', 'b64'] };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;

      expect(() => parseDetachedJws(jws)).toThrow(/crit array contains duplicates.*b64/);
    });

    it('rejects b64 that is not a boolean (string)', () => {
      const header = { alg: 'ES256', kid: 'test-key-001', b64: 'false' };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;

      expect(() => parseDetachedJws(jws)).toThrow(/b64 header must be a boolean/);
    });

    it('rejects b64 that is not a boolean (number)', () => {
      const header = { alg: 'ES256', kid: 'test-key-001', b64: 0 };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;

      expect(() => parseDetachedJws(jws)).toThrow(/b64 header must be a boolean/);
    });

    it('accepts b64=true (explicit standard JWS)', () => {
      const header = { alg: 'ES256', kid: 'test-key-001', b64: true };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;
      const result = parseDetachedJws(jws);

      expect(result.header.b64).toBe(true);
      expect(result.is_unencoded_payload).toBe(false); // b64=true means standard encoding
    });

    it('accepts empty crit array (edge case)', () => {
      const header = { alg: 'ES256', kid: 'test-key-001', crit: [] };
      const headerB64 = btoa(JSON.stringify(header))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const signature = 'dGVzdC1zaWduYXR1cmU';

      const jws = `${headerB64}..${signature}`;
      const result = parseDetachedJws(jws);

      expect(result.header.crit).toEqual([]);
    });
  });
});

describe('findSigningKey', () => {
  const mockProfile: UcpProfile = {
    version: '2026-01-11',
    business_id: 'business_123',
    signing_keys: [
      {
        kty: 'EC',
        crv: 'P-256',
        kid: 'key-001',
        x: 'test-x',
        y: 'test-y',
        alg: 'ES256',
      },
      {
        kty: 'EC',
        crv: 'P-384',
        kid: 'key-002',
        x: 'test-x-2',
        y: 'test-y-2',
        alg: 'ES384',
      },
    ],
  };

  it('finds key by kid', () => {
    const key = findSigningKey(mockProfile, 'key-001');
    expect(key).toBeDefined();
    expect(key?.kid).toBe('key-001');
    expect(key?.crv).toBe('P-256');
  });

  it('finds second key by kid', () => {
    const key = findSigningKey(mockProfile, 'key-002');
    expect(key).toBeDefined();
    expect(key?.kid).toBe('key-002');
    expect(key?.crv).toBe('P-384');
  });

  it('returns undefined for unknown kid', () => {
    const key = findSigningKey(mockProfile, 'unknown-key');
    expect(key).toBeUndefined();
  });
});
