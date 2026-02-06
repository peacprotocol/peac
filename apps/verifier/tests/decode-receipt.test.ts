/**
 * Decode Receipt Tests
 */

import { describe, it, expect } from 'vitest';
import { decodeReceipt } from '../src/lib/decode-receipt.js';
import { sign, generateKeypair } from '@peac/crypto';

describe('decodeReceipt', () => {
  it('should decode a valid JWS', async () => {
    const { privateKey } = await generateKeypair();
    const claims = {
      iss: 'https://test.example.com',
      aud: 'https://aud.example.com',
      iat: 1000,
      exp: 2000,
      rid: 'test-id',
    };
    const jws = await sign(claims, privateKey, 'test-kid');

    const decoded = decodeReceipt(jws);
    expect(decoded).not.toBeNull();
    expect(decoded!.header.kid).toBe('test-kid');
    expect(decoded!.payload.iss).toBe('https://test.example.com');
    expect(decoded!.parts).toBe(3);
  });

  it('should return null for empty string', () => {
    expect(decodeReceipt('')).toBeNull();
  });

  it('should return null for non-JWS string', () => {
    expect(decodeReceipt('not-a-jws')).toBeNull();
  });

  it('should return null for incomplete JWS (only 2 parts)', () => {
    expect(decodeReceipt('part1.part2')).toBeNull();
  });

  it('should return null for malformed base64url', () => {
    expect(decodeReceipt('!!!.@@@.###')).toBeNull();
  });
});
