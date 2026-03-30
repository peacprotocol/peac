import { describe, it, expect } from 'vitest';
import {
  generatePKCEChallenge,
  computeS256Challenge,
  validatePKCEVerifier,
} from '../../src/auth/pkce';

describe('generatePKCEChallenge()', () => {
  it('produces a verifier of valid length (43-128 chars)', async () => {
    const result = await generatePKCEChallenge();
    expect(result.verifier.length).toBeGreaterThanOrEqual(43);
    expect(result.verifier.length).toBeLessThanOrEqual(128);
  });

  it('produces a base64url challenge (no +, /, or = chars)', async () => {
    const result = await generatePKCEChallenge();
    expect(result.challenge).not.toMatch(/[+/=]/);
    expect(result.challenge.length).toBeGreaterThan(0);
  });

  it('always uses S256 method', async () => {
    const result = await generatePKCEChallenge();
    expect(result.method).toBe('S256');
  });

  it('produces unique verifiers on successive calls', async () => {
    const a = await generatePKCEChallenge();
    const b = await generatePKCEChallenge();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it('verifier contains only RFC 7636 unreserved characters', async () => {
    const result = await generatePKCEChallenge();
    expect(result.verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });
});

describe('computeS256Challenge()', () => {
  it('produces correct SHA-256 for known input', async () => {
    // RFC 7636 Appendix B test vector
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await computeS256Challenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('throws E_PKCE_INVALID_VERIFIER for too-short verifier', async () => {
    await expect(computeS256Challenge('short')).rejects.toThrow(/PKCE verifier length/);
    try {
      await computeS256Challenge('short');
    } catch (e: unknown) {
      expect((e as { code: string }).code).toBe('E_PKCE_INVALID_VERIFIER');
    }
  });

  it('throws E_PKCE_INVALID_VERIFIER for too-long verifier', async () => {
    const long = 'a'.repeat(129);
    await expect(computeS256Challenge(long)).rejects.toThrow(/PKCE verifier length/);
  });

  it('throws for verifier with invalid characters', async () => {
    const invalid = 'a'.repeat(43).slice(0, 42) + '!';
    await expect(computeS256Challenge(invalid)).rejects.toThrow(/unreserved set/);
  });
});

describe('validatePKCEVerifier()', () => {
  it('accepts valid verifier', () => {
    const valid = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(() => validatePKCEVerifier(valid)).not.toThrow();
  });

  it('accepts verifier at minimum length (43 chars)', () => {
    expect(() => validatePKCEVerifier('a'.repeat(43))).not.toThrow();
  });

  it('accepts verifier at maximum length (128 chars)', () => {
    expect(() => validatePKCEVerifier('a'.repeat(128))).not.toThrow();
  });

  it('rejects verifier below minimum length', () => {
    expect(() => validatePKCEVerifier('a'.repeat(42))).toThrow(/PKCE verifier length/);
  });

  it('rejects verifier above maximum length', () => {
    expect(() => validatePKCEVerifier('a'.repeat(129))).toThrow(/PKCE verifier length/);
  });

  it('rejects verifier with spaces', () => {
    const withSpace = 'a'.repeat(42) + ' ';
    expect(() => validatePKCEVerifier(withSpace)).toThrow(/unreserved set/);
  });

  it('accepts all RFC 7636 unreserved characters', () => {
    // [A-Z] [a-z] [0-9] - . _ ~
    const allUnreserved = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm-._~01234567';
    expect(allUnreserved.length).toBeGreaterThanOrEqual(43);
    expect(() => validatePKCEVerifier(allUnreserved)).not.toThrow();
  });
});
