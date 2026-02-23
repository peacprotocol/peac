/**
 * Schema carrier module tests.
 *
 * Tests Zod schemas, computeReceiptRef(), validateCarrierConstraints(),
 * verifyReceiptRefConsistency(), and conformance fixture validation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CARRIER_TRANSPORT_LIMITS,
  CarrierFormatSchema,
  CarrierMetaSchema,
  CompactJwsSchema,
  PeacEvidenceCarrierSchema,
  ReceiptRefSchema,
  computeReceiptRef,
  validateCarrierConstraints,
  verifyReceiptRefConsistency,
} from '../src/carrier';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(__dirname, '../../../specs/conformance/fixtures/carrier');

function loadFixture(name: string): {
  carrier: Record<string, unknown>;
  meta: Record<string, unknown>;
  expected_valid: boolean;
  expected_violation?: string;
} {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// A known JWS for deterministic receipt_ref testing
const TEST_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJkaWQ6a2V5OnoxMjMifQ.c2lnbmF0dXJl';

// ---------------------------------------------------------------------------
// ReceiptRefSchema
// ---------------------------------------------------------------------------

describe('ReceiptRefSchema', () => {
  it('accepts valid sha256 receipt ref', () => {
    const result = ReceiptRefSchema.safeParse(
      'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    );
    expect(result.success).toBe(true);
  });

  it('rejects receipt ref without sha256: prefix', () => {
    const result = ReceiptRefSchema.safeParse(
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    );
    expect(result.success).toBe(false);
  });

  it('rejects receipt ref with wrong length', () => {
    const result = ReceiptRefSchema.safeParse('sha256:a1b2c3');
    expect(result.success).toBe(false);
  });

  it('rejects receipt ref with uppercase hex', () => {
    const result = ReceiptRefSchema.safeParse(
      'sha256:A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2'
    );
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(ReceiptRefSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CompactJwsSchema
// ---------------------------------------------------------------------------

describe('CompactJwsSchema', () => {
  it('accepts valid compact JWS', () => {
    const result = CompactJwsSchema.safeParse(TEST_JWS);
    expect(result.success).toBe(true);
  });

  it('rejects JWS with only two parts', () => {
    const result = CompactJwsSchema.safeParse(
      'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJkaWQ6a2V5OnoxMjMifQ'
    );
    expect(result.success).toBe(false);
  });

  it('rejects JWS with spaces', () => {
    const result = CompactJwsSchema.safeParse('eyJ hbGci.eyJpc3M.sig');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(CompactJwsSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CarrierFormatSchema
// ---------------------------------------------------------------------------

describe('CarrierFormatSchema', () => {
  it('accepts embed', () => {
    expect(CarrierFormatSchema.safeParse('embed').success).toBe(true);
  });

  it('accepts reference', () => {
    expect(CarrierFormatSchema.safeParse('reference').success).toBe(true);
  });

  it('rejects unknown format', () => {
    expect(CarrierFormatSchema.safeParse('inline').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PeacEvidenceCarrierSchema
// ---------------------------------------------------------------------------

describe('PeacEvidenceCarrierSchema', () => {
  it('accepts minimal carrier', () => {
    const result = PeacEvidenceCarrierSchema.safeParse({
      receipt_ref: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    });
    expect(result.success).toBe(true);
  });

  it('accepts full carrier', () => {
    const result = PeacEvidenceCarrierSchema.safeParse({
      receipt_ref: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      receipt_jws: TEST_JWS,
      policy_binding: 'sha256:deadbeef',
      actor_binding: 'did:key:z6Mk',
      request_nonce: 'nonce-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects carrier without receipt_ref', () => {
    const result = PeacEvidenceCarrierSchema.safeParse({
      receipt_jws: TEST_JWS,
    });
    expect(result.success).toBe(false);
  });

  it('rejects carrier with invalid receipt_ref', () => {
    const result = PeacEvidenceCarrierSchema.safeParse({
      receipt_ref: 'not-a-valid-ref',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CarrierMetaSchema
// ---------------------------------------------------------------------------

describe('CarrierMetaSchema', () => {
  it('accepts valid meta', () => {
    const result = CarrierMetaSchema.safeParse({
      transport: 'mcp',
      format: 'embed',
      max_size: 65536,
    });
    expect(result.success).toBe(true);
  });

  it('accepts meta with redaction', () => {
    const result = CarrierMetaSchema.safeParse({
      transport: 'a2a',
      format: 'reference',
      max_size: 8192,
      redaction: ['actor_binding'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects meta with empty transport', () => {
    const result = CarrierMetaSchema.safeParse({
      transport: '',
      format: 'embed',
      max_size: 65536,
    });
    expect(result.success).toBe(false);
  });

  it('rejects meta with negative max_size', () => {
    const result = CarrierMetaSchema.safeParse({
      transport: 'mcp',
      format: 'embed',
      max_size: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects meta with zero max_size', () => {
    const result = CarrierMetaSchema.safeParse({
      transport: 'mcp',
      format: 'embed',
      max_size: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeReceiptRef
// ---------------------------------------------------------------------------

describe('computeReceiptRef', () => {
  it('produces deterministic sha256 output', async () => {
    const ref = await computeReceiptRef(TEST_JWS);
    expect(ref).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces same result for same input', async () => {
    const ref1 = await computeReceiptRef(TEST_JWS);
    const ref2 = await computeReceiptRef(TEST_JWS);
    expect(ref1).toBe(ref2);
  });

  it('produces different result for different input', async () => {
    const ref1 = await computeReceiptRef(TEST_JWS);
    const ref2 = await computeReceiptRef('eyJ.eyJ.different');
    expect(ref1).not.toBe(ref2);
  });

  it('produces valid ReceiptRef format', async () => {
    const ref = await computeReceiptRef(TEST_JWS);
    expect(ReceiptRefSchema.safeParse(ref).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateCarrierConstraints
// ---------------------------------------------------------------------------

describe('validateCarrierConstraints', () => {
  const validCarrier = {
    receipt_ref: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' as const,
  };

  const validMeta = {
    transport: 'mcp' as const,
    format: 'embed' as const,
    max_size: 65536,
  };

  it('validates minimal valid carrier', () => {
    const result = validateCarrierConstraints(validCarrier, validMeta);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('validates full valid carrier', () => {
    const carrier = {
      ...validCarrier,
      receipt_jws: TEST_JWS,
      policy_binding: 'sha256:dead',
      actor_binding: 'did:key:z6Mk',
    };
    const result = validateCarrierConstraints(carrier, validMeta);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid receipt_ref format', () => {
    const carrier = { receipt_ref: 'not-valid' as `sha256:${string}` };
    const result = validateCarrierConstraints(carrier, validMeta);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('receipt_ref'))).toBe(true);
  });

  it('rejects invalid receipt_jws format', () => {
    const carrier = { ...validCarrier, receipt_jws: 'not-a-jws' };
    const result = validateCarrierConstraints(carrier, validMeta);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('receipt_jws'))).toBe(true);
  });

  it('rejects carrier exceeding max_size', () => {
    const result = validateCarrierConstraints(validCarrier, {
      ...validMeta,
      max_size: 10, // very small
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('carrier size'))).toBe(true);
  });

  it('rejects string field exceeding MAX_STRING_LENGTH', () => {
    const carrier = {
      ...validCarrier,
      policy_binding: 'x'.repeat(65537), // > 65536
    };
    const result = validateCarrierConstraints(carrier, { ...validMeta, max_size: 1_000_000 });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('policy_binding'))).toBe(true);
  });

  it('collects multiple violations', () => {
    const carrier = {
      receipt_ref: 'bad-ref' as `sha256:${string}`,
      receipt_jws: 'bad-jws',
    };
    const result = validateCarrierConstraints(carrier, validMeta);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// verifyReceiptRefConsistency
// ---------------------------------------------------------------------------

describe('verifyReceiptRefConsistency', () => {
  it('returns null when no receipt_jws is present', async () => {
    const carrier = {
      receipt_ref:
        'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' as const,
    };
    const result = await verifyReceiptRefConsistency(carrier);
    expect(result).toBeNull();
  });

  it('returns null when receipt_ref matches receipt_jws', async () => {
    const ref = await computeReceiptRef(TEST_JWS);
    const carrier = { receipt_ref: ref, receipt_jws: TEST_JWS };
    const result = await verifyReceiptRefConsistency(carrier);
    expect(result).toBeNull();
  });

  it('returns error when receipt_ref does not match receipt_jws', async () => {
    const carrier = {
      receipt_ref:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const,
      receipt_jws: TEST_JWS,
    };
    const result = await verifyReceiptRefConsistency(carrier);
    expect(result).not.toBeNull();
    expect(result).toContain('mismatch');
  });
});

// ---------------------------------------------------------------------------
// CARRIER_TRANSPORT_LIMITS
// ---------------------------------------------------------------------------

describe('CARRIER_TRANSPORT_LIMITS', () => {
  it('has expected transport entries', () => {
    expect(CARRIER_TRANSPORT_LIMITS.mcp).toBe(65536);
    expect(CARRIER_TRANSPORT_LIMITS.a2a).toBe(65536);
    expect(CARRIER_TRANSPORT_LIMITS.http).toBe(8192);
    expect(CARRIER_TRANSPORT_LIMITS.acp_embed).toBe(65536);
    expect(CARRIER_TRANSPORT_LIMITS.acp_headers).toBe(8192);
    expect(CARRIER_TRANSPORT_LIMITS.ucp).toBe(65536);
    expect(CARRIER_TRANSPORT_LIMITS.x402_embed).toBe(65536);
    expect(CARRIER_TRANSPORT_LIMITS.x402_headers).toBe(8192);
  });
});

// ---------------------------------------------------------------------------
// Conformance fixtures
// ---------------------------------------------------------------------------

describe('conformance fixtures', () => {
  const validFixtures = [
    'valid-minimal.json',
    'valid-full.json',
    'valid-embed-no-optional.json',
    'valid-http-reference.json',
    'valid-with-redaction.json',
  ];

  const invalidFixtures = [
    'invalid-receipt-ref.json',
    'invalid-jws-format.json',
    'invalid-oversize.json',
  ];

  for (const name of validFixtures) {
    it(`validates ${name}`, () => {
      const fixture = loadFixture(name);
      expect(fixture.expected_valid).toBe(true);

      // Validate carrier schema
      const schemaResult = PeacEvidenceCarrierSchema.safeParse(fixture.carrier);
      expect(schemaResult.success).toBe(true);

      // Validate meta schema
      const metaResult = CarrierMetaSchema.safeParse(fixture.meta);
      expect(metaResult.success).toBe(true);

      // Validate constraints
      const constraintResult = validateCarrierConstraints(
        fixture.carrier as Parameters<typeof validateCarrierConstraints>[0],
        fixture.meta as Parameters<typeof validateCarrierConstraints>[1]
      );
      expect(constraintResult.valid).toBe(true);
    });
  }

  for (const name of invalidFixtures) {
    it(`rejects ${name}`, () => {
      const fixture = loadFixture(name);
      expect(fixture.expected_valid).toBe(false);

      // At least one of schema validation or constraint validation should fail
      const schemaResult = PeacEvidenceCarrierSchema.safeParse(fixture.carrier);
      const constraintResult = validateCarrierConstraints(
        fixture.carrier as Parameters<typeof validateCarrierConstraints>[0],
        fixture.meta as Parameters<typeof validateCarrierConstraints>[1]
      );

      const failed = !schemaResult.success || !constraintResult.valid;
      expect(failed).toBe(true);

      // If there's an expected_violation hint, check constraint violations contain it
      if (fixture.expected_violation && !constraintResult.valid) {
        const hasExpected = constraintResult.violations.some((v) =>
          v.includes(fixture.expected_violation!)
        );
        expect(hasExpected).toBe(true);
      }
    });
  }
});
