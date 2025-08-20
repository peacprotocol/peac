/**
 * Agreement Store Tests
 * 
 * Comprehensive tests for the in-memory agreement store service.
 */

import { agreementStore } from '../../src/agreements/store';
import { Agreement } from '@peacprotocol/schema';

describe('Agreement Store', () => {
  const createMockAgreement = (): Agreement => ({
    id: 'agr_test123',
    fingerprint: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    protocol_version: '0.9.6',
    status: 'valid',
    created_at: '2024-01-01T00:00:00Z',
    proposal: {
      purpose: 'Test purpose',
      consent: { required: true, mechanism: 'api' },
      attribution: { required: false },
      pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
      terms: { text: 'Test terms' }
    }
  });

  const createInvalidAgreement = (): Agreement => ({
    id: 'agr_invalid123',
    fingerprint: 'abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
    protocol_version: '0.9.6',
    status: 'invalid',
    reason: 'expired',
    created_at: '2024-01-01T00:00:00Z',
    proposal: {
      purpose: 'Test purpose invalid',
      consent: { required: true, mechanism: 'api' },
      attribution: { required: false },
      pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
      terms: { text: 'Test terms' }
    }
  });

  beforeEach(() => {
    agreementStore.clear();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve agreements', () => {
      const mockAgreement = createMockAgreement();
      agreementStore.set(mockAgreement.id, mockAgreement);
      
      const retrieved = agreementStore.get(mockAgreement.id);
      expect(retrieved).toEqual(mockAgreement);
    });

    it('should return undefined for non-existent agreements', () => {
      const result = agreementStore.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should check if agreement exists', () => {
      const mockAgreement = createMockAgreement();
      agreementStore.set(mockAgreement.id, mockAgreement);
      
      expect(agreementStore.has(mockAgreement.id)).toBe(true);
      expect(agreementStore.has('nonexistent')).toBe(false);
    });

    it('should delete agreements', () => {
      const mockAgreement = createMockAgreement();
      agreementStore.set(mockAgreement.id, mockAgreement);
      
      const deleted = agreementStore.delete(mockAgreement.id);
      expect(deleted).toBe(true);
      expect(agreementStore.has(mockAgreement.id)).toBe(false);
      
      const deletedAgain = agreementStore.delete(mockAgreement.id);
      expect(deletedAgain).toBe(false);
    });

    it('should clear all agreements', () => {
      const mockAgreement = createMockAgreement();
      const invalidAgreement = createInvalidAgreement();
      
      agreementStore.set(mockAgreement.id, mockAgreement);
      agreementStore.set(invalidAgreement.id, invalidAgreement);
      
      agreementStore.clear();
      
      expect(agreementStore.get(mockAgreement.id)).toBeUndefined();
      expect(agreementStore.get(invalidAgreement.id)).toBeUndefined();
    });
  });

  describe('Query Operations', () => {
    it('should get all agreements', () => {
      const mockAgreement = createMockAgreement();
      const invalidAgreement = createInvalidAgreement();
      
      agreementStore.set(mockAgreement.id, mockAgreement);
      agreementStore.set(invalidAgreement.id, invalidAgreement);
      
      const all = agreementStore.getAll();
      
      expect(all).toHaveLength(2);
      expect(all).toContainEqual(mockAgreement);
      expect(all).toContainEqual(invalidAgreement);
    });

    it('should filter agreements by status', () => {
      const mockAgreement = createMockAgreement();
      const invalidAgreement = createInvalidAgreement();
      
      agreementStore.set(mockAgreement.id, mockAgreement);
      agreementStore.set(invalidAgreement.id, invalidAgreement);
      
      const valid = agreementStore.getByStatus('valid');
      const invalid = agreementStore.getByStatus('invalid');
      
      expect(valid).toHaveLength(1);
      expect(valid[0]).toEqual(mockAgreement);
      
      expect(invalid).toHaveLength(1);
      expect(invalid[0]).toEqual(invalidAgreement);
    });

    it('should get valid agreements only', () => {
      const mockAgreement = createMockAgreement();
      const invalidAgreement = createInvalidAgreement();
      
      agreementStore.set(mockAgreement.id, mockAgreement);
      agreementStore.set(invalidAgreement.id, invalidAgreement);
      
      const valid = agreementStore.getValidAgreements();
      
      expect(valid).toHaveLength(1);
      expect(valid[0]).toEqual(mockAgreement);
    });
  });

  describe('Status Updates', () => {
    it('should update agreement status', () => {
      const mockAgreement = createMockAgreement();
      agreementStore.set(mockAgreement.id, mockAgreement);
      
      const updated = agreementStore.updateStatus(mockAgreement.id, 'invalid', 'revoked');
      
      expect(updated).toBe(true);
      
      const agreement = agreementStore.get(mockAgreement.id);
      expect(agreement!.status).toBe('invalid');
      expect(agreement!.reason).toBe('revoked');
    });

    it('should fail to update non-existent agreement', () => {
      const updated = agreementStore.updateStatus('nonexistent', 'invalid');
      expect(updated).toBe(false);
    });

    it('should update status without reason', () => {
      const mockAgreement = createMockAgreement();
      agreementStore.set(mockAgreement.id, mockAgreement);
      
      const updated = agreementStore.updateStatus(mockAgreement.id, 'invalid');
      
      expect(updated).toBe(true);
      
      const agreement = agreementStore.get(mockAgreement.id);
      expect(agreement!.status).toBe('invalid');
    });
  });

  describe('Statistics', () => {
    it('should return stats for empty store', () => {
      const stats = agreementStore.getStats();
      
      expect(stats).toEqual({
        total: 0,
        valid: 0,
        invalid: 0,
        active_valid: 0
      });
    });

    it('should return accurate statistics', () => {
      const mockAgreement = createMockAgreement();
      const invalidAgreement = createInvalidAgreement();
      
      agreementStore.set(mockAgreement.id, mockAgreement);
      agreementStore.set(invalidAgreement.id, invalidAgreement);
      
      const stats = agreementStore.getStats();
      
      expect(stats).toEqual({
        total: 2,
        valid: 1,
        invalid: 1,
        active_valid: 1
      });
    });
  });
});