/**
 * Issuer Configuration Schema Tests (v0.11.3+, DD-148)
 */
import { describe, it, expect } from 'vitest';
import {
  RevokedKeyEntrySchema,
  RevokedKeysArraySchema,
  REVOCATION_REASONS,
  validateRevokedKeys,
  findRevokedKey,
} from '../src/issuer-config';

describe('RevokedKeyEntrySchema', () => {
  it('should validate a complete revoked key entry', () => {
    const entry = {
      kid: 'key-2026-01',
      revoked_at: '2026-02-28T12:00:00Z',
      reason: 'key_compromise',
    };
    const result = RevokedKeyEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('should validate entry without reason (optional)', () => {
    const entry = {
      kid: 'key-2026-01',
      revoked_at: '2026-02-28T12:00:00Z',
    };
    const result = RevokedKeyEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('should reject entry with empty kid', () => {
    const entry = {
      kid: '',
      revoked_at: '2026-02-28T12:00:00Z',
    };
    const result = RevokedKeyEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it('should reject entry with invalid datetime', () => {
    const entry = {
      kid: 'key-2026-01',
      revoked_at: 'not-a-date',
    };
    const result = RevokedKeyEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it('should reject entry with invalid reason', () => {
    const entry = {
      kid: 'key-2026-01',
      revoked_at: '2026-02-28T12:00:00Z',
      reason: 'unknown_reason',
    };
    const result = RevokedKeyEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it('should reject entry with extra fields (strict)', () => {
    const entry = {
      kid: 'key-2026-01',
      revoked_at: '2026-02-28T12:00:00Z',
      extra: 'not-allowed',
    };
    const result = RevokedKeyEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it('should validate all RFC 5280 CRLReason values', () => {
    for (const reason of REVOCATION_REASONS) {
      const entry = {
        kid: `key-${reason}`,
        revoked_at: '2026-02-28T12:00:00Z',
        reason,
      };
      const result = RevokedKeyEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    }
  });
});

describe('RevokedKeysArraySchema', () => {
  it('should validate an empty array', () => {
    const result = RevokedKeysArraySchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it('should validate array with multiple entries', () => {
    const entries = [
      { kid: 'key-001', revoked_at: '2026-01-15T00:00:00Z', reason: 'superseded' as const },
      { kid: 'key-002', revoked_at: '2026-02-01T00:00:00Z', reason: 'key_compromise' as const },
    ];
    const result = RevokedKeysArraySchema.safeParse(entries);
    expect(result.success).toBe(true);
  });

  it('should reject array exceeding 100 entries', () => {
    const entries = Array.from({ length: 101 }, (_, i) => ({
      kid: `key-${i}`,
      revoked_at: '2026-02-28T12:00:00Z',
    }));
    const result = RevokedKeysArraySchema.safeParse(entries);
    expect(result.success).toBe(false);
  });
});

describe('validateRevokedKeys', () => {
  it('should return ok for valid array', () => {
    const result = validateRevokedKeys([{ kid: 'key-001', revoked_at: '2026-01-15T00:00:00Z' }]);
    expect(result.ok).toBe(true);
  });

  it('should return error for invalid data', () => {
    const result = validateRevokedKeys([{ kid: '', revoked_at: 'invalid' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it('should return error for non-array', () => {
    const result = validateRevokedKeys('not-an-array');
    expect(result.ok).toBe(false);
  });
});

describe('findRevokedKey', () => {
  const revokedKeys = [
    {
      kid: 'key-revoked-001',
      revoked_at: '2026-01-15T00:00:00Z',
      reason: 'key_compromise' as const,
    },
    { kid: 'key-revoked-002', revoked_at: '2026-02-01T00:00:00Z', reason: 'superseded' as const },
  ];

  it('should find a revoked key by kid', () => {
    const result = findRevokedKey(revokedKeys, 'key-revoked-001');
    expect(result).not.toBeNull();
    expect(result!.kid).toBe('key-revoked-001');
    expect(result!.reason).toBe('key_compromise');
  });

  it('should return null for non-revoked kid', () => {
    const result = findRevokedKey(revokedKeys, 'key-active-001');
    expect(result).toBeNull();
  });

  it('should return null for empty array', () => {
    const result = findRevokedKey([], 'any-key');
    expect(result).toBeNull();
  });
});
