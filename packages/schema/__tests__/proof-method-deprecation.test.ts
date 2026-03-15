/**
 * ProofMethodSchema deprecation contract tests
 *
 * Validates that the deprecated ProofMethodSchema, ProofMethod type,
 * and PROOF_METHODS array remain functional and importable from the
 * package barrel through v0.12.x. Imports use the barrel to prove
 * public surface availability (not internal module paths).
 */

import { describe, it, expect } from 'vitest';
import { ProofMethodSchema, PROOF_METHODS } from '../src/index';

describe('ProofMethodSchema deprecation contract', () => {
  it('is exported from barrel', () => {
    expect(ProofMethodSchema).toBeDefined();
    expect(PROOF_METHODS).toBeDefined();
  });

  it('parses all 4 valid transport-binding methods at runtime', () => {
    const expected = ['http-message-signature', 'dpop', 'mtls', 'jwk-thumbprint'] as const;
    for (const method of expected) {
      expect(ProofMethodSchema.parse(method)).toBe(method);
    }
  });

  it('rejects values not in the transport-binding enum', () => {
    expect(() => ProofMethodSchema.parse('ed25519-cert-chain')).toThrow();
    expect(() => ProofMethodSchema.parse('custom')).toThrow();
    expect(() => ProofMethodSchema.parse('')).toThrow();
    expect(() => ProofMethodSchema.parse(123)).toThrow();
    expect(() => ProofMethodSchema.parse(null)).toThrow();
    expect(() => ProofMethodSchema.parse(undefined)).toThrow();
  });

  it('PROOF_METHODS array matches schema enum values exactly', () => {
    expect(PROOF_METHODS).toEqual(['http-message-signature', 'dpop', 'mtls', 'jwk-thumbprint']);
    expect(PROOF_METHODS).toHaveLength(4);
  });

  it('PROOF_METHODS values all round-trip through schema', () => {
    for (const method of PROOF_METHODS) {
      expect(ProofMethodSchema.parse(method)).toBe(method);
    }
  });

  it('safeParse returns success for valid values and failure for invalid', () => {
    const valid = ProofMethodSchema.safeParse('dpop');
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toBe('dpop');
    }

    const invalid = ProofMethodSchema.safeParse('nonexistent');
    expect(invalid.success).toBe(false);
  });
});
