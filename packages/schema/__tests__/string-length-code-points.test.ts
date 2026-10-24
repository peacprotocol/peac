/**
 * String length bounds count Unicode code points.
 *
 * A character outside the Basic Multilingual Plane is one code point and two
 * UTF-16 code units. At a bound of N, N such characters are accepted and
 * N + 1 are rejected.
 */

import { describe, it, expect } from 'vitest';
import { CustodyEntrySchema } from '../src/index.js';
import { Wire02ClaimsSchema } from '../src/wire-02-envelope.js';

// U+20000, a CJK Unified Ideographs Extension B character (non-BMP)
const NON_BMP = '\u{20000}';

function nonBmp(count: number): string {
  return NON_BMP.repeat(count);
}

function custody(action: string, custodian = 'org-a'): object {
  return { custodian, action, timestamp: '2026-03-14T12:00:00Z' };
}

function evidence(overrides: Record<string, unknown>): object {
  return {
    peac_version: '0.2',
    kind: 'evidence',
    type: 'org.peacprotocol/access',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'test-jti-01',
    ...overrides,
  };
}

describe('string length bounds with non-BMP characters', () => {
  it('uses a character that is one code point and two UTF-16 code units', () => {
    expect(NON_BMP.length).toBe(2);
    expect([...NON_BMP]).toHaveLength(1);
  });

  describe('provenance custody entry action (max 128)', () => {
    it('accepts 128 code points', () => {
      expect(CustodyEntrySchema.safeParse(custody(nonBmp(128))).success).toBe(true);
    });

    it('rejects 129 code points', () => {
      expect(CustodyEntrySchema.safeParse(custody(nonBmp(129))).success).toBe(false);
    });
  });

  describe('provenance custody entry custodian (max 256)', () => {
    it('accepts 256 code points', () => {
      expect(CustodyEntrySchema.safeParse(custody('received', nonBmp(256))).success).toBe(true);
    });

    it('rejects 257 code points', () => {
      expect(CustodyEntrySchema.safeParse(custody('received', nonBmp(257))).success).toBe(false);
    });
  });

  describe('receipt envelope jti (max 256)', () => {
    it('accepts 256 code points', () => {
      expect(Wire02ClaimsSchema.safeParse(evidence({ jti: nonBmp(256) })).success).toBe(true);
    });

    it('rejects 257 code points', () => {
      expect(Wire02ClaimsSchema.safeParse(evidence({ jti: nonBmp(257) })).success).toBe(false);
    });
  });

  describe('receipt envelope sub (max 2048)', () => {
    it('accepts 2048 code points', () => {
      expect(Wire02ClaimsSchema.safeParse(evidence({ sub: nonBmp(2048) })).success).toBe(true);
    });

    it('rejects 2049 code points', () => {
      expect(Wire02ClaimsSchema.safeParse(evidence({ sub: nonBmp(2049) })).success).toBe(false);
    });
  });

  describe('receipt envelope purpose_declared (max 256)', () => {
    it('accepts 256 code points', () => {
      expect(
        Wire02ClaimsSchema.safeParse(evidence({ purpose_declared: nonBmp(256) })).success
      ).toBe(true);
    });

    it('rejects 257 code points', () => {
      expect(
        Wire02ClaimsSchema.safeParse(evidence({ purpose_declared: nonBmp(257) })).success
      ).toBe(false);
    });
  });
});
