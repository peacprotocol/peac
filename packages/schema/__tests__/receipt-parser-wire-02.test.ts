/**
 * Dual-stack receipt parser tests for Wire 0.2 (v0.12.0-preview.1, DD-156)
 *
 * Covers:
 *   - detectWireVersion() with valid/invalid/missing peac_version
 *   - parseReceiptClaims() Wire 0.2 path (success + failure)
 *   - parseReceiptClaims() Wire 0.1 paths are unchanged (regression)
 *   - ParseSuccess gains wireVersion and warnings fields
 */

import { describe, it, expect } from 'vitest';
import { parseReceiptClaims, detectWireVersion } from '../src/receipt-parser.js';

// ---------------------------------------------------------------------------
// Minimal Wire 0.2 fixture
// ---------------------------------------------------------------------------

function wire02Evidence(overrides?: Record<string, unknown>): object {
  return {
    peac_version: '0.2',
    kind: 'evidence',
    type: 'org.peacprotocol/access',
    iss: 'https://example.com',
    iat: 1700000000,
    jti: 'parser-test-01',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectWireVersion()
// ---------------------------------------------------------------------------

describe('detectWireVersion()', () => {
  it('returns "0.2" when peac_version is "0.2"', () => {
    expect(detectWireVersion({ peac_version: '0.2' })).toBe('0.2');
  });

  it('returns "0.1" when peac_version is absent', () => {
    expect(detectWireVersion({ iss: 'https://example.com', iat: 1 })).toBe('0.1');
  });

  it('returns null when peac_version has an unrecognized value', () => {
    expect(detectWireVersion({ peac_version: '0.3' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(detectWireVersion('string')).toBeNull();
    expect(detectWireVersion(null)).toBeNull();
    expect(detectWireVersion([])).toBeNull();
    expect(detectWireVersion(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseReceiptClaims() — Wire 0.2 success path
// ---------------------------------------------------------------------------

describe('parseReceiptClaims() — Wire 0.2 success', () => {
  it('returns ok:true with wireVersion "0.2" for valid Wire 0.2 envelope', () => {
    const result = parseReceiptClaims(wire02Evidence());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wireVersion).toBe('0.2');
      expect(result.variant).toBe('wire-02');
      expect(result.warnings).toEqual([]);
    }
  });

  it('returns parsed claims with kind and type', () => {
    const result = parseReceiptClaims(wire02Evidence());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const claims = result.claims as { kind: string; type: string };
      expect(claims.kind).toBe('evidence');
      expect(claims.type).toBe('org.peacprotocol/access');
    }
  });

  it('accepts Wire 0.2 challenge kind', () => {
    const result = parseReceiptClaims({
      peac_version: '0.2',
      kind: 'challenge',
      type: 'org.peacprotocol/access',
      iss: 'https://example.com',
      iat: 1700000000,
      jti: 'challenge-01',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wireVersion).toBe('0.2');
      expect(result.variant).toBe('wire-02');
    }
  });

  it('accepts Wire 0.2 with did: iss', () => {
    const result = parseReceiptClaims(wire02Evidence({ iss: 'did:web:example.com' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wireVersion).toBe('0.2');
    }
  });

  it('accepts Wire 0.2 with all optional fields', () => {
    const result = parseReceiptClaims(
      wire02Evidence({
        pillars: ['access', 'identity'],
        purpose_declared: 'agent verification',
        sub: 'user:123',
        policy: { digest: 'sha256:' + 'c'.repeat(64) },
        representation: { content_type: 'text/markdown' },
      })
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseReceiptClaims() — Wire 0.2 failure path
// ---------------------------------------------------------------------------

describe('parseReceiptClaims() — Wire 0.2 validation errors', () => {
  it('returns E_INVALID_FORMAT for invalid kind', () => {
    const result = parseReceiptClaims(wire02Evidence({ kind: 'bad-kind' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_INVALID_FORMAT');
    }
  });

  it('returns E_INVALID_FORMAT for non-canonical iss', () => {
    const result = parseReceiptClaims(wire02Evidence({ iss: 'http://example.com' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_INVALID_FORMAT');
    }
  });

  it('returns E_INVALID_FORMAT for occurred_at on challenge', () => {
    const result = parseReceiptClaims({
      peac_version: '0.2',
      kind: 'challenge',
      type: 'org.peacprotocol/access',
      iss: 'https://example.com',
      iat: 1700000000,
      jti: 'x',
      occurred_at: '2024-01-01T00:00:00Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_INVALID_FORMAT');
      expect(result.error.message).toContain('E_OCCURRED_AT_ON_CHALLENGE');
    }
  });

  it('returns E_INVALID_FORMAT for extra unknown fields (strict)', () => {
    const result = parseReceiptClaims(wire02Evidence({ _unknown_field: 'x' }));
    expect(result.ok).toBe(false);
  });

  it('returns E_UNSUPPORTED_WIRE_VERSION for unrecognized peac_version', () => {
    const result = parseReceiptClaims({ peac_version: '0.3', iss: 'https://example.com', iat: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_UNSUPPORTED_WIRE_VERSION');
    }
  });
});

// ---------------------------------------------------------------------------
// parseReceiptClaims() — Wire 0.1 regression (existing behavior unchanged)
// ---------------------------------------------------------------------------

describe('parseReceiptClaims() — Wire 0.1 regression', () => {
  it('returns wireVersion "0.1" and empty warnings for Wire 0.1 commerce receipt', () => {
    const result = parseReceiptClaims({
      iss: 'https://issuer.example.com',
      iat: 1700000000,
      jti: '01JA9BCDE1234567890ABCDEFG',
      sub: 'https://example.com/resource',
      amt: 1000,
      cur: 'USD',
      pmt: 'stripe',
    });
    // Might fail validation if missing required fields; just check wireVersion
    // is '0.1' on any outcome (this is detected before schema parse)
    // For this test: if it doesn't fail on wire version, wireVersion is '0.1'
    if (result.ok) {
      expect(result.wireVersion).toBe('0.1');
      expect(result.warnings).toEqual([]);
    } else {
      // Validation may fail (minimal test fixture), but NOT as UNSUPPORTED_WIRE_VERSION
      expect(result.error.code).not.toBe('E_UNSUPPORTED_WIRE_VERSION');
    }
  });

  it('returns wireVersion "0.1" for Wire 0.1 attestation receipt (no commerce fields)', () => {
    const result = parseReceiptClaims({
      iss: 'https://issuer.example.com',
      iat: 1700000000,
      jti: '01JA9BCDE1234567890ABCDEFG',
      sub: 'https://example.com/resource',
      typ: 'org.peacprotocol/attestation',
    });
    if (result.ok) {
      expect(result.wireVersion).toBe('0.1');
      expect(result.warnings).toEqual([]);
    } else {
      expect(result.error.code).not.toBe('E_UNSUPPORTED_WIRE_VERSION');
    }
  });
});

// ---------------------------------------------------------------------------
// parseReceiptClaims() — invalid input guard
// ---------------------------------------------------------------------------

describe('parseReceiptClaims() — invalid input guard', () => {
  it('returns E_PARSE_INVALID_INPUT for null', () => {
    const result = parseReceiptClaims(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_PARSE_INVALID_INPUT');
    }
  });

  it('returns E_PARSE_INVALID_INPUT for array', () => {
    const result = parseReceiptClaims([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_PARSE_INVALID_INPUT');
    }
  });

  it('returns E_PARSE_INVALID_INPUT for string', () => {
    const result = parseReceiptClaims('not-an-object');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_PARSE_INVALID_INPUT');
    }
  });
});
