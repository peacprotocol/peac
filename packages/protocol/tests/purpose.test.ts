/**
 * Tests for PEAC Protocol purpose functionality (v0.9.24+)
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { decode } from '@peac/crypto';
import { issue } from '../src/issue';
import {
  getPurposeHeader,
  setPurposeAppliedHeader,
  setPurposeReasonHeader,
  setVaryPurposeHeader,
} from '../src/headers';
import type { PEACReceiptClaims } from '@peac/schema';

describe('Purpose in issue() (v0.9.24+)', () => {
  const baseOptions = {
    iss: 'https://api.example.com',
    aud: 'https://app.example.com',
    amt: 9999,
    cur: 'USD',
    rail: 'stripe',
    reference: 'cs_123456',
    asset: 'USD',
    env: 'test' as const,
    evidence: { session_id: 'cs_123456' },
    kid: '2025-01-15T10:30:00Z',
  };

  describe('purpose_declared', () => {
    it('should include purpose_declared as array for single purpose', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
        purpose: 'train',
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_declared).toEqual(['train']);
    });

    it('should include purpose_declared as array for multiple purposes', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
        purpose: ['train', 'search', 'inference'],
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_declared).toEqual(['train', 'search', 'inference']);
    });

    it('should accept vendor-prefixed purpose tokens', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
        purpose: ['train', 'cf:ai_crawler'],
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_declared).toEqual(['train', 'cf:ai_crawler']);
    });

    it('should omit purpose_declared if not provided', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_declared).toBeUndefined();
    });

    it('should reject invalid purpose tokens', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          ...baseOptions,
          privateKey,
          purpose: 'TRAIN', // uppercase not allowed
        })
      ).rejects.toThrow('Invalid purpose tokens: TRAIN');
    });

    it('should reject multiple invalid tokens', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          ...baseOptions,
          privateKey,
          purpose: ['train', 'BAD!', '123invalid'],
        })
      ).rejects.toThrow('Invalid purpose tokens');
    });

    it('should reject explicit undeclared token', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          ...baseOptions,
          privateKey,
          purpose: 'undeclared',
        })
      ).rejects.toThrow("Explicit 'undeclared' is not a valid purpose token (internal-only)");
    });

    it('should reject undeclared in array', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          ...baseOptions,
          privateKey,
          purpose: ['train', 'undeclared'],
        })
      ).rejects.toThrow("Explicit 'undeclared' is not a valid purpose token (internal-only)");
    });
  });

  describe('purpose_enforced', () => {
    it('should include purpose_enforced when provided', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
        purpose: ['train', 'search'],
        purpose_enforced: 'train',
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_enforced).toBe('train');
    });

    it('should accept all canonical purposes', async () => {
      const { privateKey } = await generateKeypair();
      const canonical = ['train', 'search', 'user_action', 'inference', 'index'] as const;

      for (const purpose of canonical) {
        const result = await issue({
          ...baseOptions,
          privateKey,
          purpose: purpose,
          purpose_enforced: purpose,
        });

        const decoded = decode<PEACReceiptClaims>(result.jws);
        expect(decoded.payload.purpose_enforced).toBe(purpose);
      }
    });

    it('should reject non-canonical purpose_enforced', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          ...baseOptions,
          privateKey,
          purpose: 'cf:ai_crawler',
          purpose_enforced: 'cf:ai_crawler' as any, // vendor token not canonical
        })
      ).rejects.toThrow('purpose_enforced must be a canonical purpose');
    });

    it('should reject legacy purposes for purpose_enforced', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          ...baseOptions,
          privateKey,
          purpose: 'crawl',
          purpose_enforced: 'crawl' as any, // legacy token, not canonical
        })
      ).rejects.toThrow('purpose_enforced must be a canonical purpose');
    });
  });

  describe('purpose_reason', () => {
    it('should include purpose_reason when provided', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
        purpose: 'train',
        purpose_enforced: 'train',
        purpose_reason: 'allowed',
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_reason).toBe('allowed');
    });

    it('should accept all valid purpose reasons', async () => {
      const { privateKey } = await generateKeypair();
      const reasons = [
        'allowed',
        'constrained',
        'denied',
        'downgraded',
        'undeclared_default',
        'unknown_preserved',
      ] as const;

      for (const reason of reasons) {
        const result = await issue({
          ...baseOptions,
          privateKey,
          purpose: 'train',
          purpose_enforced: 'train',
          purpose_reason: reason,
        });

        const decoded = decode<PEACReceiptClaims>(result.jws);
        expect(decoded.payload.purpose_reason).toBe(reason);
      }
    });

    it('should reject invalid purpose_reason', async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          ...baseOptions,
          privateKey,
          purpose: 'train',
          purpose_enforced: 'train',
          purpose_reason: 'invalid_reason' as any,
        })
      ).rejects.toThrow('Invalid purpose_reason: invalid_reason');
    });
  });

  describe('complete purpose flow', () => {
    it('should include all purpose fields when provided', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
        purpose: ['train', 'search'],
        purpose_enforced: 'train',
        purpose_reason: 'constrained',
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_declared).toEqual(['train', 'search']);
      expect(decoded.payload.purpose_enforced).toBe('train');
      expect(decoded.payload.purpose_reason).toBe('constrained');
    });

    it('should handle user_action purpose correctly', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
        purpose: 'user_action',
        purpose_enforced: 'user_action',
        purpose_reason: 'allowed',
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_declared).toEqual(['user_action']);
      expect(decoded.payload.purpose_enforced).toBe('user_action');
    });

    it('should preserve unknown vendor tokens in purpose_declared', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        ...baseOptions,
        privateKey,
        purpose: ['train', 'acme:custom_purpose', 'vendor:x'],
        purpose_enforced: 'train',
        purpose_reason: 'unknown_preserved',
      });

      const decoded = decode<PEACReceiptClaims>(result.jws);
      expect(decoded.payload.purpose_declared).toContain('acme:custom_purpose');
      expect(decoded.payload.purpose_declared).toContain('vendor:x');
    });
  });
});

describe('Purpose Header Utilities (v0.9.24+)', () => {
  describe('getPurposeHeader', () => {
    it('should parse single purpose from header', () => {
      const headers = new Headers();
      headers.set('PEAC-Purpose', 'train');

      const purposes = getPurposeHeader(headers);
      expect(purposes).toEqual(['train']);
    });

    it('should parse multiple purposes from header', () => {
      const headers = new Headers();
      headers.set('PEAC-Purpose', 'train, search, inference');

      const purposes = getPurposeHeader(headers);
      expect(purposes).toEqual(['train', 'search', 'inference']);
    });

    it('should normalize to lowercase', () => {
      const headers = new Headers();
      headers.set('PEAC-Purpose', 'TRAIN, Search');

      const purposes = getPurposeHeader(headers);
      expect(purposes).toEqual(['train', 'search']);
    });

    it('should trim whitespace', () => {
      const headers = new Headers();
      headers.set('PEAC-Purpose', '  train  ,  search  ');

      const purposes = getPurposeHeader(headers);
      expect(purposes).toEqual(['train', 'search']);
    });

    it('should deduplicate tokens', () => {
      const headers = new Headers();
      headers.set('PEAC-Purpose', 'train, train, search');

      const purposes = getPurposeHeader(headers);
      expect(purposes).toEqual(['train', 'search']);
    });

    it('should return empty array if header missing', () => {
      const headers = new Headers();

      const purposes = getPurposeHeader(headers);
      expect(purposes).toEqual([]);
    });

    it('should handle vendor-prefixed tokens', () => {
      const headers = new Headers();
      headers.set('PEAC-Purpose', 'train, cf:ai_crawler');

      const purposes = getPurposeHeader(headers);
      expect(purposes).toEqual(['train', 'cf:ai_crawler']);
    });
  });

  describe('setPurposeAppliedHeader', () => {
    it('should set PEAC-Purpose-Applied header', () => {
      const headers = new Headers();
      setPurposeAppliedHeader(headers, 'train');

      expect(headers.get('PEAC-Purpose-Applied')).toBe('train');
    });

    it('should overwrite existing header', () => {
      const headers = new Headers();
      headers.set('PEAC-Purpose-Applied', 'search');
      setPurposeAppliedHeader(headers, 'train');

      expect(headers.get('PEAC-Purpose-Applied')).toBe('train');
    });
  });

  describe('setPurposeReasonHeader', () => {
    it('should set PEAC-Purpose-Reason header', () => {
      const headers = new Headers();
      setPurposeReasonHeader(headers, 'allowed');

      expect(headers.get('PEAC-Purpose-Reason')).toBe('allowed');
    });

    it('should set undeclared_default reason', () => {
      const headers = new Headers();
      setPurposeReasonHeader(headers, 'undeclared_default');

      expect(headers.get('PEAC-Purpose-Reason')).toBe('undeclared_default');
    });
  });

  describe('setVaryPurposeHeader', () => {
    it('should set Vary: PEAC-Purpose', () => {
      const headers = new Headers();
      setVaryPurposeHeader(headers);

      expect(headers.get('Vary')).toBe('PEAC-Purpose');
    });

    it('should append to existing Vary header', () => {
      const headers = new Headers();
      headers.set('Vary', 'Accept');
      setVaryPurposeHeader(headers);

      expect(headers.get('Vary')).toBe('Accept, PEAC-Purpose');
    });

    it('should not duplicate if already present', () => {
      const headers = new Headers();
      headers.set('Vary', 'PEAC-Purpose');
      setVaryPurposeHeader(headers);

      expect(headers.get('Vary')).toBe('PEAC-Purpose');
    });
  });
});
