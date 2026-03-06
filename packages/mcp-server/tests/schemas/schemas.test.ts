import { describe, it, expect } from 'vitest';
import { VerifyInputSchema, VerifyOutputSchema } from '../../src/schemas/verify.js';
import { InspectInputSchema, InspectOutputSchema } from '../../src/schemas/inspect.js';
import { DecodeInputSchema, DecodeOutputSchema } from '../../src/schemas/decode.js';
import { IssueInputSchema, IssueOutputSchema } from '../../src/schemas/issue.js';
import { BundleInputSchema, BundleOutputSchema } from '../../src/schemas/bundle.js';

const META = { serverVersion: '0.11.2', policyHash: 'abc123', protocolVersion: '2025-11-25' };

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

  describe('IssueInputSchema', () => {
    it('accepts minimal input', () => {
      const result = IssueInputSchema.safeParse({
        kind: 'evidence',
        type: 'org.peacprotocol/payment',
      });
      expect(result.success).toBe(true);
    });

    it('accepts evidence with pillars and extensions', () => {
      const result = IssueInputSchema.safeParse({
        kind: 'evidence',
        type: 'org.peacprotocol/payment',
        pillars: ['commerce'],
        extensions: {
          'org.peacprotocol/commerce': {
            payment_rail: 'stripe',
            amount_minor: '1000',
            currency: 'USD',
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts challenge kind', () => {
      const result = IssueInputSchema.safeParse({
        kind: 'challenge',
        type: 'org.peacprotocol/payment_required',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing kind', () => {
      const result = IssueInputSchema.safeParse({
        type: 'org.peacprotocol/payment',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing type', () => {
      const result = IssueInputSchema.safeParse({
        kind: 'evidence',
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional fields', () => {
      const result = IssueInputSchema.safeParse({
        kind: 'evidence',
        type: 'org.peacprotocol/payment',
        sub: 'https://resource.example.com',
        pillars: ['access', 'commerce'],
        occurred_at: '2026-03-05T12:00:00Z',
        policy: {
          uri: 'https://example.com/.well-known/peac.txt',
          version: '1.0.0',
          digest: 'sha256:' + 'a'.repeat(64),
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('IssueOutputSchema', () => {
    it('accepts valid output', () => {
      const result = IssueOutputSchema.safeParse({
        _meta: META,
        ok: true,
        jws: 'eyJ.eyJ.sig',
        claimsSummary: {
          iss: 'https://api.example.com',
          kind: 'evidence',
          type: 'org.peacprotocol/payment',
          iat: 1700000000,
          jti: 'test-jti-001',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts output with pillars', () => {
      const result = IssueOutputSchema.safeParse({
        _meta: META,
        ok: true,
        jws: 'eyJ.eyJ.sig',
        claimsSummary: {
          iss: 'https://api.example.com',
          kind: 'evidence',
          type: 'org.peacprotocol/payment',
          iat: 1700000000,
          jti: 'test-jti-002',
          pillars: ['commerce'],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('BundleInputSchema', () => {
    it('accepts minimal input', () => {
      const result = BundleInputSchema.safeParse({
        receipts: ['eyJ.eyJ.sig'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty receipts array', () => {
      const result = BundleInputSchema.safeParse({
        receipts: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects receipt exceeding max length', () => {
      const result = BundleInputSchema.safeParse({
        receipts: ['x'.repeat(16_385)],
      });
      expect(result.success).toBe(false);
    });

    it('rejects output_path exceeding 255 chars', () => {
      const result = BundleInputSchema.safeParse({
        receipts: ['eyJ.eyJ.sig'],
        output_path: 'x'.repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional metadata', () => {
      const result = BundleInputSchema.safeParse({
        receipts: ['eyJ.eyJ.sig'],
        metadata: { source: 'test', tags: ['a', 'b'] },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('BundleOutputSchema', () => {
    it('accepts valid metadata-only output', () => {
      const result = BundleOutputSchema.safeParse({
        _meta: META,
        ok: true,
        bundleId: 'b'.repeat(64),
        bundleName: 'bundle-2024-01-01T00-00-00-000Z-abcd1234',
        receiptCount: 3,
        fileCount: 5,
        totalBytes: 1500,
        createdAt: '2024-01-01T00:00:00.000Z',
        manifestSha256: 'a'.repeat(64),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('no $defs in input schemas (client compatibility)', () => {
    // Some MCP clients fail tools/list when JSON Schema includes $defs/$ref.
    // All input schemas must produce flat JSON Schema without references.
    const inputSchemas = [
      { name: 'VerifyInputSchema', schema: VerifyInputSchema },
      { name: 'InspectInputSchema', schema: InspectInputSchema },
      { name: 'DecodeInputSchema', schema: DecodeInputSchema },
      { name: 'IssueInputSchema', schema: IssueInputSchema },
      { name: 'BundleInputSchema', schema: BundleInputSchema },
    ];

    for (const { name, schema } of inputSchemas) {
      it(`${name} produces no $defs or $ref`, () => {
        // Zod's jsonSchema output (used by MCP SDK) must be free of $defs
        const jsonStr = JSON.stringify(schema);
        expect(jsonStr).not.toContain('"$defs"');
        expect(jsonStr).not.toContain('"$ref"');
      });
    }
  });

  describe('no $defs in output schemas (client compatibility)', () => {
    const outputSchemas = [
      { name: 'VerifyOutputSchema', schema: VerifyOutputSchema },
      { name: 'InspectOutputSchema', schema: InspectOutputSchema },
      { name: 'DecodeOutputSchema', schema: DecodeOutputSchema },
      { name: 'IssueOutputSchema', schema: IssueOutputSchema },
      { name: 'BundleOutputSchema', schema: BundleOutputSchema },
    ];

    for (const { name, schema } of outputSchemas) {
      it(`${name} produces no $defs or $ref`, () => {
        const jsonStr = JSON.stringify(schema);
        expect(jsonStr).not.toContain('"$defs"');
        expect(jsonStr).not.toContain('"$ref"');
      });
    }
  });
});
