/**
 * Fingerprint Utility Tests
 * 
 * Tests for deterministic agreement fingerprinting.
 */

import { computeAgreementFingerprint, isValidFingerprint, compareFingerprints } from '../../src/utils/fingerprint';

describe('Fingerprint Utilities', () => {
  const sampleProposal = {
    purpose: 'Test fingerprint',
    consent: { required: true, mechanism: 'api' },
    attribution: { required: false },
    pricing_policy: { price: '1000', duration: 3600, usage: 'inference' as const },
    terms: { text: 'Test terms' }
  };

  describe('computeAgreementFingerprint', () => {
    it('should generate a 64-character hex fingerprint', () => {
      const fingerprint = computeAgreementFingerprint(sampleProposal);
      
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be deterministic - same input produces same output', () => {
      const fingerprint1 = computeAgreementFingerprint(sampleProposal);
      const fingerprint2 = computeAgreementFingerprint(sampleProposal);
      
      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should produce different fingerprints for different inputs', () => {
      const proposal2 = { ...sampleProposal, purpose: 'Different purpose' };
      
      const fingerprint1 = computeAgreementFingerprint(sampleProposal);
      const fingerprint2 = computeAgreementFingerprint(proposal2);
      
      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should exclude volatile fields from fingerprint calculation', () => {
      const proposalWithVolatile = {
        ...sampleProposal,
        status: 'valid',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };
      
      const fingerprint1 = computeAgreementFingerprint(sampleProposal);
      const fingerprint2 = computeAgreementFingerprint(proposalWithVolatile as any);
      
      expect(fingerprint1).toBe(fingerprint2);
    });
  });

  describe('isValidFingerprint', () => {
    it('should return true for valid 64-character hex strings', () => {
      const validFingerprint = 'a'.repeat(64);
      expect(isValidFingerprint(validFingerprint)).toBe(true);
    });

    it('should return false for invalid lengths', () => {
      expect(isValidFingerprint('a'.repeat(63))).toBe(false);
      expect(isValidFingerprint('a'.repeat(65))).toBe(false);
    });

    it('should return false for non-hex characters', () => {
      const invalidFingerprint = 'g' + 'a'.repeat(63);
      expect(isValidFingerprint(invalidFingerprint)).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(isValidFingerprint(null as any)).toBe(false);
      expect(isValidFingerprint(123 as any)).toBe(false);
    });
  });

  describe('compareFingerprints', () => {
    const validFingerprint1 = 'a'.repeat(64);
    const validFingerprint2 = 'b'.repeat(64);

    it('should return true for identical fingerprints', () => {
      expect(compareFingerprints(validFingerprint1, validFingerprint1)).toBe(true);
    });

    it('should return false for different fingerprints', () => {
      expect(compareFingerprints(validFingerprint1, validFingerprint2)).toBe(false);
    });

    it('should return false for invalid fingerprints', () => {
      expect(compareFingerprints('invalid', validFingerprint1)).toBe(false);
      expect(compareFingerprints(validFingerprint1, 'invalid')).toBe(false);
    });
  });
});