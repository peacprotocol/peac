/**
 * Format Claims Tests
 */

import { describe, it, expect } from 'vitest';
import { formatTimestamp, formatExpiry, formatClaims } from '../src/lib/format-claims.js';

describe('formatTimestamp', () => {
  it('should format a Unix timestamp as ISO string', () => {
    expect(formatTimestamp(1704067200)).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should handle zero', () => {
    expect(formatTimestamp(0)).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('formatExpiry', () => {
  const now = 1000;

  it('should show "Expired" for past timestamps', () => {
    expect(formatExpiry(999, now)).toBe('Expired');
  });

  it('should show seconds remaining', () => {
    expect(formatExpiry(1030, now)).toBe('30s remaining');
  });

  it('should show minutes remaining', () => {
    expect(formatExpiry(1600, now)).toBe('10m remaining');
  });

  it('should show hours remaining', () => {
    expect(formatExpiry(4600, now)).toBe('1h remaining');
  });

  it('should show days remaining', () => {
    expect(formatExpiry(87400, now)).toBe('1d remaining');
  });
});

describe('formatClaims', () => {
  it('should format standard claims', () => {
    const claims = formatClaims({
      iss: 'https://issuer.example.com',
      aud: 'https://audience.example.com',
      iat: 1704067200,
      exp: 1704070800,
      rid: 'test-rid',
    });

    expect(claims).toHaveLength(5);
    expect(claims[0]).toEqual({
      label: 'Issuer',
      value: 'https://issuer.example.com',
      type: 'url',
    });
    expect(claims[1]).toEqual({
      label: 'Audience',
      value: 'https://audience.example.com',
      type: 'url',
    });
    expect(claims[4]).toEqual({ label: 'Receipt ID', value: 'test-rid', type: 'standard' });
  });

  it('should format purpose_declared as list', () => {
    const claims = formatClaims({
      purpose_declared: ['research', 'analysis'],
    });

    const purposeClaim = claims.find((c) => c.label === 'Purpose');
    expect(purposeClaim).toBeDefined();
    expect(purposeClaim!.value).toBe('research, analysis');
    expect(purposeClaim!.type).toBe('list');
  });

  it('should format unknown claims as JSON', () => {
    const claims = formatClaims({
      custom_field: { nested: true },
    });

    expect(claims).toHaveLength(1);
    expect(claims[0].label).toBe('custom_field');
    expect(claims[0].type).toBe('json');
  });

  it('should handle empty payload', () => {
    expect(formatClaims({})).toEqual([]);
  });

  it('should include sub when present', () => {
    const claims = formatClaims({ sub: 'user-123' });
    expect(claims[0]).toEqual({ label: 'Subject', value: 'user-123', type: 'standard' });
  });
});
