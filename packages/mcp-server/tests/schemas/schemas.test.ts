import { describe, it, expect } from 'vitest';
import { VerifyInputSchema, VerifyOutputSchema } from '../../src/schemas/verify.js';
import { InspectInputSchema, InspectOutputSchema } from '../../src/schemas/inspect.js';
import { DecodeInputSchema, DecodeOutputSchema } from '../../src/schemas/decode.js';

const META = { serverVersion: '0.10.12', policyHash: 'abc123', protocolVersion: '2025-11-25' };

describe('schemas', () => {
  describe('VerifyInputSchema', () => {
    it('accepts minimal input', () => {
      const result = VerifyInputSchema.safeParse({ jws: 'a.b.c' });
      expect(result.success).toBe(true);
    });

    it('accepts full input', () => {
      const result = VerifyInputSchema.safeParse({
        jws: 'a.b.c',
        public_key_base64url: 'abc',
        issuer: 'https://example.com',
        audience: 'https://client.example.com',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing jws', () => {
      const result = VerifyInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects non-string jws', () => {
      const result = VerifyInputSchema.safeParse({ jws: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('VerifyOutputSchema', () => {
    it('accepts success output', () => {
      const result = VerifyOutputSchema.safeParse({
        _meta: META,
        ok: true,
        variant: 'commerce',
        checks: [{ name: 'signature', passed: true }],
        claimsSummary: { iss: 'https://example.com' },
        keySource: 'inline',
      });
      expect(result.success).toBe(true);
    });

    it('accepts failure output', () => {
      const result = VerifyOutputSchema.safeParse({
        _meta: META,
        ok: false,
        code: 'E_INVALID_SIGNATURE',
        message: 'bad sig',
        checks: [{ name: 'signature', passed: false, message: 'bad sig' }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('InspectInputSchema', () => {
    it('accepts minimal input', () => {
      const result = InspectInputSchema.safeParse({ jws: 'a.b.c' });
      expect(result.success).toBe(true);
    });

    it('defaults full_claims to false', () => {
      const result = InspectInputSchema.parse({ jws: 'a.b.c' });
      expect(result.full_claims).toBe(false);
    });
  });

  describe('InspectOutputSchema', () => {
    it('accepts valid output', () => {
      const result = InspectOutputSchema.safeParse({
        _meta: META,
        header: { typ: 'peac-receipt/0.1', alg: 'EdDSA' },
        payloadMeta: { variant: 'commerce', issuer: 'https://example.com' },
        redacted: false,
        verified: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('DecodeInputSchema', () => {
    it('accepts valid input', () => {
      expect(DecodeInputSchema.safeParse({ jws: 'a.b.c' }).success).toBe(true);
    });

    it('rejects empty object', () => {
      expect(DecodeInputSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('DecodeOutputSchema', () => {
    it('accepts valid output', () => {
      const result = DecodeOutputSchema.safeParse({
        _meta: META,
        header: { typ: 'peac-receipt/0.1' },
        payload: { iss: 'https://example.com' },
        verified: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects verified: true', () => {
      const result = DecodeOutputSchema.safeParse({
        _meta: META,
        header: {},
        payload: {},
        verified: true,
      });
      expect(result.success).toBe(false);
    });
  });
});
