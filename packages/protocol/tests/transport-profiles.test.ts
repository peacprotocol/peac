/**
 * Transport Profiles Tests
 *
 * Tests for PEAC transport profile parsing per TRANSPORT-PROFILES.md
 */

import { describe, it, expect } from 'vitest';
import {
  parseHeaderProfile,
  parsePointerProfile,
  parseBodyProfile,
  parseTransportProfile,
} from '../src/transport-profiles.js';

describe('Transport Profiles', () => {
  describe('Header Profile', () => {
    it('should parse valid JWS compact serialization', () => {
      const jws = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature123';
      const result = parseHeaderProfile(jws);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.profile).toBe('header');
        expect(result.result.receipt).toBe(jws);
      }
    });

    it('should reject missing header', () => {
      const result = parseHeaderProfile(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('missing');
      }
    });

    it('should reject empty header', () => {
      const result = parseHeaderProfile('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
      }
    });

    it('should reject multiple headers (array)', () => {
      const result = parseHeaderProfile(['jws1', 'jws2']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('Multiple');
      }
    });

    it('should reject invalid JWS (wrong segment count)', () => {
      const result = parseHeaderProfile('only.two');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('malformed_receipt');
        expect(result.message).toContain('3 segments');
      }
    });

    it('should reject JWS with empty segment', () => {
      const result = parseHeaderProfile('header..signature');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('malformed_receipt');
        expect(result.message).toContain('empty');
      }
    });

    it('should reject JWS with invalid characters', () => {
      const result = parseHeaderProfile('header.pay!load.signature');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('malformed_receipt');
        expect(result.message).toContain('invalid characters');
      }
    });
  });

  describe('Pointer Profile', () => {
    const validDigest = '7d8f3c2b1a9e4d5f6c7b8a9e0d1f2c3b4a5e6f7d8c9b0a1e2f3d4c5b6a7e8f9d';
    const validUrl = 'https://receipts.example.com/abc123';
    const validHeader = `sha256="${validDigest}", url="${validUrl}"`;

    it('should parse valid pointer header', () => {
      const result = parsePointerProfile(validHeader);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.profile).toBe('pointer');
        expect(result.result.digestAlg).toBe('sha256');
        expect(result.result.digestValue).toBe(validDigest);
        expect(result.result.url).toBe(validUrl);
      }
    });

    it('should reject missing header', () => {
      const result = parsePointerProfile(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
      }
    });

    it('should reject multiple headers (array)', () => {
      const result = parsePointerProfile([validHeader, validHeader]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('Multiple');
      }
    });

    it('should reject missing sha256 parameter', () => {
      const result = parsePointerProfile(`url="${validUrl}"`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('missing sha256');
      }
    });

    it('should reject missing url parameter', () => {
      const result = parsePointerProfile(`sha256="${validDigest}"`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('missing url');
      }
    });

    it('should reject invalid digest (wrong length)', () => {
      const result = parsePointerProfile(`sha256="abc123", url="${validUrl}"`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('64 lowercase hex');
      }
    });

    it('should reject invalid digest (uppercase)', () => {
      const uppercaseDigest = validDigest.toUpperCase();
      const result = parsePointerProfile(`sha256="${uppercaseDigest}", url="${validUrl}"`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('64 lowercase hex');
      }
    });

    it('should reject non-HTTPS URL', () => {
      const result = parsePointerProfile(`sha256="${validDigest}", url="http://example.com"`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('pointer_fetch_blocked');
        expect(result.message).toContain('HTTPS');
      }
    });

    it('should reject invalid URL', () => {
      const result = parsePointerProfile(`sha256="${validDigest}", url="not-a-url"`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('not a valid URL');
      }
    });

    // Strictness tests (v0.10.8+)
    describe('Strictness', () => {
      it('should reject duplicate parameters', () => {
        const header = `sha256="${validDigest}", sha256="${validDigest}", url="${validUrl}"`;
        const result = parsePointerProfile(header);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('invalid_transport');
          expect(result.message).toContain('duplicate parameter');
          expect(result.message).toContain('sha256');
        }
      });

      it('should reject unknown parameters', () => {
        const header = `sha256="${validDigest}", url="${validUrl}", extra="value"`;
        const result = parsePointerProfile(header);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('invalid_transport');
          expect(result.message).toContain('unknown parameter');
          expect(result.message).toContain('extra');
        }
      });

      it('should reject multiple unknown parameters (reports first)', () => {
        const header = `sha256="${validDigest}", url="${validUrl}", foo="1", bar="2"`;
        const result = parsePointerProfile(header);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('invalid_transport');
          expect(result.message).toContain('unknown parameter');
          expect(result.message).toContain('foo');
        }
      });

      // Forward-compatibility: ext_* keys
      it('should allow ext_* keys for forward-compatibility', () => {
        const header = `sha256="${validDigest}", url="${validUrl}", ext_custom="value"`;
        const result = parsePointerProfile(header);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.result.digestValue).toBe(validDigest);
          expect(result.result.url).toBe(validUrl);
          // Extension keys are captured separately
          expect(result.result.extensions).toEqual({ ext_custom: 'value' });
        }
      });

      it('should allow multiple ext_* keys', () => {
        const header = `sha256="${validDigest}", url="${validUrl}", ext_foo="1", ext_bar="2"`;
        const result = parsePointerProfile(header);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.result.profile).toBe('pointer');
          expect(result.result.extensions).toEqual({ ext_foo: '1', ext_bar: '2' });
        }
      });

      it('should not include extensions field when no ext_* keys present', () => {
        const result = parsePointerProfile(validHeader);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.result.extensions).toBeUndefined();
        }
      });

      it('should reject non-ext_* unknown parameters even when ext_* is present', () => {
        const header = `sha256="${validDigest}", url="${validUrl}", ext_ok="yes", bad="no"`;
        const result = parsePointerProfile(header);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain('unknown parameter');
          expect(result.message).toContain('bad');
        }
      });
    });
  });

  describe('Body Profile', () => {
    it('should parse single receipt (peac_receipt)', () => {
      const body = { peac_receipt: 'jws.receipt.here' };
      const result = parseBodyProfile(body);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.profile).toBe('body');
        expect(result.result.receipts).toEqual(['jws.receipt.here']);
      }
    });

    it('should parse multiple receipts (peac_receipts)', () => {
      const body = { peac_receipts: ['jws1', 'jws2', 'jws3'] };
      const result = parseBodyProfile(body);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.profile).toBe('body');
        expect(result.result.receipts).toEqual(['jws1', 'jws2', 'jws3']);
      }
    });

    it('should prefer peac_receipts over peac_receipt', () => {
      const body = { peac_receipt: 'single', peac_receipts: ['array1', 'array2'] };
      const result = parseBodyProfile(body);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.receipts).toEqual(['array1', 'array2']);
      }
    });

    it('should reject non-object body', () => {
      const result = parseBodyProfile('not an object');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
      }
    });

    it('should reject null body', () => {
      const result = parseBodyProfile(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
      }
    });

    it('should reject empty peac_receipts array', () => {
      const body = { peac_receipts: [] };
      const result = parseBodyProfile(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('empty');
      }
    });

    it('should reject empty peac_receipt string', () => {
      const body = { peac_receipt: '' };
      const result = parseBodyProfile(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('empty');
      }
    });

    it('should reject non-string peac_receipt', () => {
      const body = { peac_receipt: 123 };
      const result = parseBodyProfile(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('must be a string');
      }
    });

    it('should reject non-array peac_receipts', () => {
      const body = { peac_receipts: 'not an array' };
      const result = parseBodyProfile(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('must be an array');
      }
    });

    it('should reject missing receipt fields', () => {
      const body = { other: 'value' };
      const result = parseBodyProfile(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('must contain');
      }
    });
  });

  describe('Auto-detect (parseTransportProfile)', () => {
    it('should prefer header profile over others', () => {
      const context = {
        headers: {
          'peac-receipt': 'header.jws.here',
          'peac-receipt-pointer': 'sha256="abc", url="https://x.com"',
        },
        body: { peac_receipt: 'body.jws.here' },
      };
      const result = parseTransportProfile(context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.profile).toBe('header');
      }
    });

    it('should prefer pointer profile over body', () => {
      const validDigest = '7d8f3c2b1a9e4d5f6c7b8a9e0d1f2c3b4a5e6f7d8c9b0a1e2f3d4c5b6a7e8f9d';
      const context = {
        headers: {
          'peac-receipt-pointer': `sha256="${validDigest}", url="https://x.com"`,
        },
        body: { peac_receipt: 'body.jws.here' },
      };
      const result = parseTransportProfile(context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.profile).toBe('pointer');
      }
    });

    it('should fall back to body profile', () => {
      const context = {
        headers: {},
        body: { peac_receipt: 'body.jws.here' },
      };
      const result = parseTransportProfile(context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.profile).toBe('body');
      }
    });

    it('should return error when no profile detected', () => {
      const context = {
        headers: {},
      };
      const result = parseTransportProfile(context);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('invalid_transport');
        expect(result.message).toContain('No transport profile');
      }
    });
  });
});
