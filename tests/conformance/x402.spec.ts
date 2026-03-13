/**
 * x402 Adapter Conformance Tests
 *
 * Tests that x402 verification golden fixtures match the expected behavior.
 * Uses the @peac/adapter-x402 package for verification.
 *
 * Fixtures are in specs/conformance/fixtures/x402/ (v0.12.1 format).
 * Each fixture has an explicit `kind` field that determines routing:
 * - offer_verification: verifyOffer(offer, accepts, config)
 * - receipt_verification: verifyReceipt(receipt, config)
 * - consistency_verification: verifyOfferReceiptConsistency(offer, receipt, config)
 *
 * Conformance layers:
 * - Structural: Format validation, expiry, version checks
 * - Term-matching: Accept entry binding (NOT acceptIndex)
 * - Placeholder normalization: EIP-712 validUntil:0, transaction:""
 * - Consistency: Offer-receipt resourceUrl, network, freshness
 * - Receipt: Required fields, payer format, issuedAt recency
 *
 * Security invariants tested:
 * - acceptIndex is UNSIGNED and MUST be treated as a hint only
 * - acceptIndex is per-offer (not per-challenge envelope)
 * - Term-matching MUST be the binding mechanism
 * - Mismatch between acceptIndex entry and signed payload MUST fail
 * - JWS hardening: segment count, padding, payload type, size limits
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  verifyOffer,
  verifyReceipt,
  verifyOfferReceiptConsistency,
  toPeacRecord,
  X402_OFFER_RECEIPT_PROFILE,
  type RawSignedOffer,
  type RawSignedReceipt,
  type AcceptEntry,
  type X402AdapterConfig,
  type OfferVerification,
  type ReceiptVerification,
  type NormalizedOfferPayload,
  type NormalizedReceiptPayload,
  type ConsistencyVerification,
  type X402OfferReceiptChallenge,
  type X402SettlementResponse,
  type RawOfferPayload,
  type RawReceiptPayload,
} from '../../packages/adapters/x402/src';

const FIXTURES_DIR = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures', 'x402');
const UPSTREAM_DIR = join(__dirname, '..', '..', 'specs', 'upstream', 'x402');

// ---------------------------------------------------------------------------
// Fixture Types (v0.12.1 native format with explicit kind routing)
// ---------------------------------------------------------------------------

type FixtureKind = 'offer_verification' | 'receipt_verification' | 'consistency_verification';

interface OfferFixtureInput {
  offer: RawSignedOffer;
  accepts: AcceptEntry[];
}

interface ReceiptFixtureInput {
  receipt: RawSignedReceipt;
}

interface ConsistencyFixtureInput {
  offerPayload: NormalizedOfferPayload;
  receiptPayload: NormalizedReceiptPayload;
}

interface FixtureExpected {
  valid: boolean;
  matchedIndex?: number;
  usedHint?: boolean;
  errors?: Array<{
    code: string;
    field?: string;
  }>;
}

interface VerificationFixture {
  $schema?: string;
  id: string;
  kind: FixtureKind;
  description: string;
  category: 'valid' | 'invalid' | 'edge-cases' | 'consistency';
  threat_model?: string;
  input: OfferFixtureInput | ReceiptFixtureInput | ConsistencyFixtureInput;
  expected: FixtureExpected;
  config?: Record<string, unknown>;
  notes?: string;
}

interface ManifestFile {
  $schema?: string;
  name: string;
  version: string;
  description: string;
  profile: string;
  fixture_kinds: string[];
  categories: {
    valid: { description: string; vectors: string[] };
    invalid: { description: string; vectors: string[] };
    'edge-cases': { description: string; vectors: string[] };
    consistency: { description: string; vectors: string[] };
  };
  binding_rules: {
    description: string;
    invariants: string[];
  };
  validation_rules?: {
    description: string;
    invariants: string[];
  };
  placeholder_normalization?: {
    description: string;
    invariants: string[];
  };
  consistency_rules?: {
    description: string;
    invariants: string[];
  };
  jws_hardening_rules?: {
    description: string;
    invariants: string[];
  };
}

// ---------------------------------------------------------------------------
// Fixture Loading
// ---------------------------------------------------------------------------

function loadManifest(): ManifestFile {
  const content = readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf8');
  return JSON.parse(content) as ManifestFile;
}

function loadFixture(filename: string): VerificationFixture {
  const content = readFileSync(join(FIXTURES_DIR, filename), 'utf8');
  return JSON.parse(content) as VerificationFixture;
}

/**
 * Build adapter config from fixture config.
 */
function buildConfig(fixtureConfig?: Record<string, unknown>): X402AdapterConfig {
  const config: X402AdapterConfig = {
    supportedVersions: [1],
    clockSkewSeconds: 60,
  };

  if (fixtureConfig) {
    if (fixtureConfig.clockSkewSeconds !== undefined) {
      config.clockSkewSeconds = fixtureConfig.clockSkewSeconds as number;
    }
    if (fixtureConfig.mismatchPolicy !== undefined) {
      config.mismatchPolicy = fixtureConfig.mismatchPolicy as X402AdapterConfig['mismatchPolicy'];
    }
    if (fixtureConfig.supportedVersions !== undefined) {
      config.supportedVersions = fixtureConfig.supportedVersions as number[];
    }
    if (fixtureConfig.maxAcceptEntries !== undefined) {
      config.maxAcceptEntries = fixtureConfig.maxAcceptEntries as number;
    }
    if (fixtureConfig.offerExpiryPolicy !== undefined) {
      config.offerExpiryPolicy =
        fixtureConfig.offerExpiryPolicy as X402AdapterConfig['offerExpiryPolicy'];
    }
    if (fixtureConfig.receiptRecencySeconds !== undefined) {
      config.receiptRecencySeconds = fixtureConfig.receiptRecencySeconds as number;
    }
    if (fixtureConfig.nowSeconds !== undefined) {
      config.nowSeconds = fixtureConfig.nowSeconds as number;
    }
    if (fixtureConfig.maxCompactJwsBytes !== undefined) {
      config.maxCompactJwsBytes = fixtureConfig.maxCompactJwsBytes as number;
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function assertOfferVerification(
  result: OfferVerification,
  expected: FixtureExpected,
  fixtureName: string
): void {
  expect(result.valid, `${fixtureName}: validity mismatch`).toBe(expected.valid);

  if (expected.valid) {
    if (expected.matchedIndex !== undefined) {
      expect(result.matchedIndex, `${fixtureName}: matchedIndex mismatch`).toBe(
        expected.matchedIndex
      );
    }
    if (expected.usedHint !== undefined) {
      expect(result.usedHint, `${fixtureName}: usedHint mismatch`).toBe(expected.usedHint);
    }
    expect(result.errors, `${fixtureName}: should have no errors`).toHaveLength(0);
  } else {
    expect(result.errors.length, `${fixtureName}: should have errors`).toBeGreaterThan(0);
    assertExpectedErrors(result.errors, expected, fixtureName);
  }
}

function assertReceiptVerification(
  result: ReceiptVerification,
  expected: FixtureExpected,
  fixtureName: string
): void {
  expect(result.valid, `${fixtureName}: validity mismatch`).toBe(expected.valid);

  if (expected.valid) {
    expect(result.errors, `${fixtureName}: should have no errors`).toHaveLength(0);
  } else {
    expect(result.errors.length, `${fixtureName}: should have errors`).toBeGreaterThan(0);
    assertExpectedErrors(result.errors, expected, fixtureName);
  }
}

function assertConsistencyVerification(
  result: ConsistencyVerification,
  expected: FixtureExpected,
  fixtureName: string
): void {
  expect(result.valid, `${fixtureName}: validity mismatch`).toBe(expected.valid);

  if (expected.valid) {
    expect(result.errors, `${fixtureName}: should have no errors`).toHaveLength(0);
  } else {
    expect(result.errors.length, `${fixtureName}: should have errors`).toBeGreaterThan(0);
    assertExpectedErrors(result.errors, expected, fixtureName);
  }
}

function assertExpectedErrors(
  actualErrors: Array<{ code: string }>,
  expected: FixtureExpected,
  fixtureName: string
): void {
  if (expected.errors && expected.errors.length > 0) {
    const actualCodes = actualErrors.map((e) => e.code);
    for (const expectedErr of expected.errors) {
      expect(actualCodes, `${fixtureName}: missing error code ${expectedErr.code}`).toContain(
        expectedErr.code
      );
    }
  }
}

/**
 * Route a fixture to the correct verifier based on its explicit `kind` field.
 * This avoids brittle shape inference.
 */
function runFixture(fixture: VerificationFixture): void {
  const config = buildConfig(fixture.config);

  switch (fixture.kind) {
    case 'offer_verification': {
      const input = fixture.input as OfferFixtureInput;
      const result = verifyOffer(input.offer, input.accepts, config);
      assertOfferVerification(result, fixture.expected, fixture.id);
      break;
    }
    case 'receipt_verification': {
      const input = fixture.input as ReceiptFixtureInput;
      const result = verifyReceipt(input.receipt, config);
      assertReceiptVerification(result, fixture.expected, fixture.id);
      break;
    }
    case 'consistency_verification': {
      const input = fixture.input as ConsistencyFixtureInput;
      const result = verifyOfferReceiptConsistency(
        input.offerPayload,
        input.receiptPayload,
        config
      );
      assertConsistencyVerification(result, fixture.expected, fixture.id);
      break;
    }
    default:
      throw new Error(`Unknown fixture kind: ${(fixture as VerificationFixture).kind}`);
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('x402 Adapter Conformance', () => {
  const manifest = loadManifest();

  describe('Manifest Integrity', () => {
    it('should have valid manifest structure', () => {
      expect(manifest.name).toBe('x402-adapter');
      expect(manifest.version).toBe('0.12.1');
      expect(manifest.profile).toBe('peac-x402-offer-receipt/0.2');
      expect(manifest.categories.valid.vectors.length).toBeGreaterThan(0);
      expect(manifest.categories.invalid.vectors.length).toBeGreaterThan(0);
      expect(manifest.categories.consistency.vectors.length).toBeGreaterThan(0);
    });

    it('should declare supported fixture kinds', () => {
      expect(manifest.fixture_kinds).toContain('offer_verification');
      expect(manifest.fixture_kinds).toContain('receipt_verification');
      expect(manifest.fixture_kinds).toContain('consistency_verification');
    });

    it('should document binding rules', () => {
      expect(manifest.binding_rules.invariants).toContain(
        'acceptIndex is UNSIGNED and MUST be treated as a hint only'
      );
      expect(manifest.binding_rules.invariants).toContain(
        'acceptIndex is per-offer (not per-challenge envelope)'
      );
      expect(manifest.binding_rules.invariants).toContain(
        'Mismatch between acceptIndex entry and signed payload MUST fail'
      );
    });

    it('should document validation rules', () => {
      expect(manifest.validation_rules).toBeDefined();
      expect(manifest.validation_rules!.invariants).toContain(
        'version MUST be a number (not string)'
      );
      expect(manifest.validation_rules!.invariants).toContain(
        'resourceUrl MUST be present and non-empty on offer payload'
      );
      expect(manifest.validation_rules!.invariants).toContain(
        'scheme MUST be present and non-empty on offer payload and accept entries'
      );
    });

    it('should document placeholder normalization rules', () => {
      expect(manifest.placeholder_normalization).toBeDefined();
      expect(manifest.placeholder_normalization!.invariants.length).toBeGreaterThan(0);
    });

    it('should document consistency rules', () => {
      expect(manifest.consistency_rules).toBeDefined();
      expect(manifest.consistency_rules!.invariants.length).toBeGreaterThan(0);
    });

    it('all fixtures must have a valid kind field', () => {
      const allVectors = [
        ...manifest.categories.valid.vectors,
        ...manifest.categories.invalid.vectors,
        ...manifest.categories['edge-cases'].vectors,
        ...manifest.categories.consistency.vectors,
      ];

      for (const filename of allVectors) {
        const fixture = loadFixture(filename);
        expect(
          manifest.fixture_kinds,
          `${filename}: kind '${fixture.kind}' not in manifest fixture_kinds`
        ).toContain(fixture.kind);
      }
    });

    it('all fixtures must have required input keys for their kind', () => {
      const allVectors = [
        ...manifest.categories.valid.vectors,
        ...manifest.categories.invalid.vectors,
        ...manifest.categories['edge-cases'].vectors,
        ...manifest.categories.consistency.vectors,
      ];

      for (const filename of allVectors) {
        const fixture = loadFixture(filename);
        const input = fixture.input as Record<string, unknown>;

        switch (fixture.kind) {
          case 'offer_verification':
            expect(
              input.offer,
              `${filename}: offer_verification must have input.offer`
            ).toBeDefined();
            expect(
              input.accepts,
              `${filename}: offer_verification must have input.accepts`
            ).toBeDefined();
            break;
          case 'receipt_verification':
            expect(
              input.receipt,
              `${filename}: receipt_verification must have input.receipt`
            ).toBeDefined();
            break;
          case 'consistency_verification':
            expect(
              input.offerPayload,
              `${filename}: consistency_verification must have input.offerPayload`
            ).toBeDefined();
            expect(
              input.receiptPayload,
              `${filename}: consistency_verification must have input.receiptPayload`
            ).toBeDefined();
            break;
          default:
            throw new Error(`${filename}: unknown kind '${fixture.kind}'`);
        }
      }
    });
  });

  describe('Valid Scenarios', () => {
    const validVectors = manifest.categories.valid.vectors;

    it.each(validVectors)('should accept: %s', (filename) => {
      const fixture = loadFixture(filename);
      expect(fixture.category).toBe('valid');
      runFixture(fixture);
    });
  });

  describe('Invalid Scenarios', () => {
    const invalidVectors = manifest.categories.invalid.vectors;

    it.each(invalidVectors)('should reject: %s', (filename) => {
      const fixture = loadFixture(filename);
      expect(fixture.category).toBe('invalid');
      runFixture(fixture);
    });
  });

  describe('Edge Cases', () => {
    const DYNAMIC_FIXTURES = ['clock-skew-tolerance.json'];
    const edgeCaseVectors = manifest.categories['edge-cases'].vectors.filter(
      (f) => !DYNAMIC_FIXTURES.includes(f)
    );

    it.each(edgeCaseVectors)('should handle: %s', (filename) => {
      const fixture = loadFixture(filename);
      expect(fixture.category).toBe('edge-cases');
      runFixture(fixture);
    });

    it('clock-skew-tolerance: should accept offer within skew tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const fixture = loadFixture('clock-skew-tolerance.json');

      // Build offer with dynamic timestamp (30 seconds in the past)
      const input = fixture.input as OfferFixtureInput;
      const offer = {
        ...input.offer,
        payload: {
          ...(input.offer as { payload: Record<string, unknown> }).payload,
          validUntil: now - 30,
        },
      } as RawSignedOffer;

      const config = buildConfig(fixture.config);
      config.clockSkewSeconds = 60;

      const result = verifyOffer(offer, input.accepts, config);

      expect(result.valid).toBe(true);
      expect(result.matchedIndex).toBe(0);
    });
  });

  describe('Consistency Verification', () => {
    const consistencyVectors = manifest.categories.consistency.vectors;

    it.each(consistencyVectors)('should verify: %s', (filename) => {
      const fixture = loadFixture(filename);
      expect(fixture.category).toBe('consistency');
      runFixture(fixture);
    });
  });

  describe('Receipt Verification', () => {
    it('should accept a valid receipt', () => {
      const fixture = loadFixture('receipt-valid.json');
      expect(fixture.kind).toBe('receipt_verification');
      runFixture(fixture);
    });

    it('should reject receipt with stale issuedAt', () => {
      const fixture = loadFixture('receipt-stale-issuedat.json');
      expect(fixture.kind).toBe('receipt_verification');
      runFixture(fixture);
    });

    it('should reject receipt with invalid payer', () => {
      const fixture = loadFixture('receipt-invalid-payer.json');
      expect(fixture.kind).toBe('receipt_verification');
      runFixture(fixture);
    });

    it('should reject receipt with unsupported version', () => {
      const fixture = loadFixture('receipt-unsupported-version.json');
      expect(fixture.kind).toBe('receipt_verification');
      runFixture(fixture);
    });

    it('should accept receipt with transaction placeholder normalized', () => {
      const fixture = loadFixture('receipt-placeholder-transaction.json');
      expect(fixture.kind).toBe('receipt_verification');
      runFixture(fixture);
    });
  });

  describe('JWS Hardening', () => {
    it('should reject JWS with wrong segment count', () => {
      const fixture = loadFixture('jws-wrong-segment-count.json');
      runFixture(fixture);
    });

    it('should reject JWS with padded base64url', () => {
      const fixture = loadFixture('jws-padded-base64url.json');
      runFixture(fixture);
    });

    it('should reject JWS with non-object payload', () => {
      const fixture = loadFixture('jws-non-object-payload.json');
      runFixture(fixture);
    });

    it('should reject oversized JWS', () => {
      const fixture = loadFixture('jws-oversize.json');
      runFixture(fixture);
    });
  });

  describe('Security Invariants', () => {
    it('acceptIndex tampering MUST be detected via term-matching', () => {
      const fixture = loadFixture('accept-term-mismatch.json');
      const input = fixture.input as OfferFixtureInput;
      const config = buildConfig(fixture.config);
      config.mismatchPolicy = 'fail';

      const result = verifyOffer(input.offer, input.accepts, config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'accept_term_mismatch')).toBe(true);
    });

    it('expired offers MUST be rejected', () => {
      const fixture = loadFixture('expired-offer.json');
      const input = fixture.input as OfferFixtureInput;
      const config = buildConfig(fixture.config);

      const result = verifyOffer(input.offer, input.accepts, config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'offer_expired')).toBe(true);
    });

    it('ambiguous matches without acceptIndex MUST fail', () => {
      const fixture = loadFixture('accept-ambiguous.json');
      const input = fixture.input as OfferFixtureInput;

      const config = buildConfig(fixture.config);

      const result = verifyOffer(input.offer, input.accepts, config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'accept_ambiguous')).toBe(true);
    });

    it('EIP-712 validUntil:0 MUST be rejected when offerExpiryPolicy is require', () => {
      const fixture = loadFixture('eip712-no-expiry-rejected.json');
      const input = fixture.input as OfferFixtureInput;
      const config = buildConfig(fixture.config);

      const result = verifyOffer(input.offer, input.accepts, config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'offer_no_expiry')).toBe(true);
    });
  });

  describe('Mapping and Proof Preservation', () => {
    const NOW = Math.floor(Date.now() / 1000);

    const sampleOffer: RawSignedOffer = {
      format: 'eip712',
      payload: {
        version: 1,
        resourceUrl: 'https://api.example.com/data',
        scheme: 'exact',
        network: 'eip155:8453',
        asset: 'USDC',
        amount: '100000',
        payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123',
        validUntil: NOW + 3600,
      },
      signature: '0x' + 'ab'.repeat(32) + 'cd'.repeat(32) + '1b',
      acceptIndex: 0,
    };

    const sampleReceipt: RawSignedReceipt = {
      format: 'eip712',
      payload: {
        version: 1,
        network: 'eip155:8453',
        resourceUrl: 'https://api.example.com/data',
        payer: '0xabc1234567890abcdef1234567890abcdef123456',
        issuedAt: NOW,
        transaction: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      },
      signature: '0x' + 'ef'.repeat(32) + '12'.repeat(32) + '1c',
    };

    const sampleAccepts: AcceptEntry[] = [
      {
        scheme: 'exact',
        network: 'eip155:8453',
        asset: 'USDC',
        payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123',
        amount: '100000',
      },
    ];

    const challenge: X402OfferReceiptChallenge = {
      accepts: sampleAccepts,
      offers: [sampleOffer],
      resourceUrl: 'https://api.example.com/data',
    };

    const settlement: X402SettlementResponse = {
      receipt: sampleReceipt,
      resourceUrl: 'https://api.example.com/data',
    };

    it('toPeacRecord preserves raw proofs untouched', () => {
      const record = toPeacRecord(challenge, settlement);

      // Proofs must be exact references to raw artifacts
      expect(record.proofs.x402.offer).toEqual(sampleOffer);
      expect(record.proofs.x402.receipt).toEqual(sampleReceipt);
    });

    it('toPeacRecord maps resourceUrl into evidence', () => {
      const record = toPeacRecord(challenge, settlement);
      expect(record.evidence.resourceUrl).toBe('https://api.example.com/data');
    });

    it('toPeacRecord maps payer and issuedAt into evidence', () => {
      const record = toPeacRecord(challenge, settlement);
      expect(record.evidence.payer).toBe('0xabc1234567890abcdef1234567890abcdef123456');
      expect(record.evidence.issuedAt).toBe(NOW);
    });

    it('toPeacRecord maps transaction (not txHash) into evidence', () => {
      const record = toPeacRecord(challenge, settlement);
      expect(record.evidence.transaction).toBe(
        '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678'
      );
      // Verify old field name is absent
      expect((record.evidence as Record<string, unknown>).txHash).toBeUndefined();
    });

    it('toPeacRecord omits transaction when absent from receipt', () => {
      const receiptNoTx: RawSignedReceipt = {
        format: 'eip712',
        payload: {
          version: 1,
          network: 'eip155:8453',
          resourceUrl: 'https://api.example.com/data',
          payer: '0xabc1234567890abcdef1234567890abcdef123456',
          issuedAt: NOW,
        },
        signature: '0x' + 'ef'.repeat(32) + '12'.repeat(32) + '1c',
      };
      const settlementNoTx: X402SettlementResponse = {
        receipt: receiptNoTx,
        resourceUrl: 'https://api.example.com/data',
      };

      const record = toPeacRecord(challenge, settlementNoTx);
      expect(record.evidence.transaction).toBeUndefined();
    });

    it('toPeacRecord preserves acceptIndex as unsigned hint', () => {
      const record = toPeacRecord(challenge, settlement);
      expect(record.hints.acceptIndex).toEqual({
        value: 0,
        untrusted: true,
      });
    });

    it('toPeacRecord uses correct profile version', () => {
      const record = toPeacRecord(challenge, settlement);
      expect(record.version).toBe(X402_OFFER_RECEIPT_PROFILE);
      expect(record.version).toBe('peac-x402-offer-receipt/0.2');
    });

    it('unknown upstream fields in proofs do not leak into evidence', () => {
      // Add unknown fields to offer and receipt
      const offerWithExtra = {
        ...sampleOffer,
        payload: {
          ...(sampleOffer as { payload: Record<string, unknown> }).payload,
          unknownField: 'should-be-in-proofs-only',
        },
      } as RawSignedOffer;

      const challengeExtra: X402OfferReceiptChallenge = {
        accepts: sampleAccepts,
        offers: [offerWithExtra],
        resourceUrl: 'https://api.example.com/data',
      };

      const record = toPeacRecord(challengeExtra, settlement);

      // Unknown field should be in proofs (raw artifact preserved)
      expect(
        (record.proofs.x402.offer as { payload: Record<string, unknown> }).payload.unknownField
      ).toBe('should-be-in-proofs-only');

      // Unknown field must NOT appear in evidence
      expect((record.evidence as Record<string, unknown>).unknownField).toBeUndefined();
    });
  });

  describe('Cross-Implementation Parity', () => {
    it('should have fixture count matching manifest', () => {
      const totalFixtures =
        manifest.categories.valid.vectors.length +
        manifest.categories.invalid.vectors.length +
        manifest.categories['edge-cases'].vectors.length +
        manifest.categories.consistency.vectors.length;

      expect(totalFixtures).toBeGreaterThanOrEqual(26);
    });

    it('all fixture files should be loadable', () => {
      const allVectors = [
        ...manifest.categories.valid.vectors,
        ...manifest.categories.invalid.vectors,
        ...manifest.categories['edge-cases'].vectors,
        ...manifest.categories.consistency.vectors,
      ];

      for (const filename of allVectors) {
        expect(() => loadFixture(filename)).not.toThrow();
      }
    });

    it('no orphan fixture files (all .json files must be in manifest)', () => {
      const allFiles = readdirSync(FIXTURES_DIR).filter(
        (f) => f.endsWith('.json') && f !== 'manifest.json' && !f.endsWith('.schema.json')
      );

      const manifestVectors = new Set([
        ...manifest.categories.valid.vectors,
        ...manifest.categories.invalid.vectors,
        ...manifest.categories['edge-cases'].vectors,
        ...manifest.categories.consistency.vectors,
      ]);

      const orphans = allFiles.filter((f) => !manifestVectors.has(f));

      expect(orphans, `Orphan fixture files found: ${orphans.join(', ')}`).toHaveLength(0);
    });

    it('profile identifier matches code constant', () => {
      expect(manifest.profile).toBe(X402_OFFER_RECEIPT_PROFILE);
    });
  });

  // -------------------------------------------------------------------------
  // Upstream Type Parity (Lane 1: pinned at commit f2bbb5c)
  // -------------------------------------------------------------------------

  describe('Upstream Type Parity', () => {
    interface FieldSpec {
      type: string;
      required: boolean | string;
    }

    interface TypeSnapshot {
      upstream: { commit: string; spec_version: string };
      offer_payload: { fields: Record<string, FieldSpec> };
      receipt_payload: { fields: Record<string, FieldSpec> };
      signed_artifact: { fields: Record<string, FieldSpec> };
      extension_nesting: { path: string; fields: Record<string, FieldSpec> };
    }

    let snapshot: TypeSnapshot;

    beforeAll(() => {
      snapshot = JSON.parse(readFileSync(join(UPSTREAM_DIR, 'type-snapshot.json'), 'utf8'));
    });

    it('snapshot is pinned to upstream commit f2bbb5c', () => {
      expect(snapshot.upstream.commit).toBe('f2bbb5c');
    });

    it('RawOfferPayload fields match upstream offer payload', () => {
      // Structural parity: verify our RawOfferPayload has exactly the fields
      // documented in the upstream spec at the pinned commit.
      const upstreamFields = Object.keys(snapshot.offer_payload.fields).sort();
      const sample: RawOfferPayload = {
        version: 1,
        resourceUrl: '',
        scheme: '',
        network: '',
        asset: '',
        payTo: '',
        amount: '',
        validUntil: 0,
      };
      const ourFields = Object.keys(sample).sort();
      expect(ourFields).toEqual(upstreamFields);
    });

    it('RawReceiptPayload fields match upstream receipt payload', () => {
      const upstreamFields = Object.keys(snapshot.receipt_payload.fields).sort();
      const sample: RawReceiptPayload = {
        version: 1,
        network: '',
        resourceUrl: '',
        payer: '',
        issuedAt: 0,
        transaction: '',
      };
      const ourFields = Object.keys(sample).sort();
      expect(ourFields).toEqual(upstreamFields);
    });

    it('signed artifact envelope fields match upstream', () => {
      const expected = Object.keys(snapshot.signed_artifact.fields).sort();
      // Our RawEIP712SignedOffer has: format, payload, signature, acceptIndex
      // Our RawJWSSignedOffer has: format, signature, acceptIndex
      // Union covers all: format, payload, signature, acceptIndex
      expect(expected).toEqual(['acceptIndex', 'format', 'payload', 'signature']);
    });

    it('extension nesting path matches upstream', () => {
      expect(snapshot.extension_nesting.path).toBe('extensions["offer-receipt"].info');
    });

    it('offer payload field types match upstream spec', () => {
      const fields = snapshot.offer_payload.fields;
      expect(fields.version.type).toBe('number');
      expect(fields.resourceUrl.type).toBe('string');
      expect(fields.scheme.type).toBe('string');
      expect(fields.network.type).toBe('string');
      expect(fields.asset.type).toBe('string');
      expect(fields.payTo.type).toBe('string');
      expect(fields.amount.type).toBe('string');
      expect(fields.validUntil.type).toBe('number');
    });

    it('receipt payload field types match upstream spec', () => {
      const fields = snapshot.receipt_payload.fields;
      expect(fields.version.type).toBe('number');
      expect(fields.network.type).toBe('string');
      expect(fields.resourceUrl.type).toBe('string');
      expect(fields.payer.type).toBe('string');
      expect(fields.issuedAt.type).toBe('number');
      expect(fields.transaction.type).toBe('string');
      expect(fields.transaction.required).toBe(false);
    });
  });
});
