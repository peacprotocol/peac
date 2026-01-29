/**
 * x402 Adapter Conformance Tests
 *
 * Tests that x402 verification golden fixtures match the expected behavior.
 * Uses the @peac/adapter-x402 package for verification.
 *
 * Fixtures are in specs/conformance/fixtures/x402/
 *
 * Conformance layers:
 * - Structural: Format validation, expiry, version checks
 * - Term-matching: Accept entry binding (NOT acceptIndex)
 *
 * Security invariants tested:
 * - acceptIndex is UNSIGNED and MUST be treated as a hint only
 * - Term-matching MUST be the binding mechanism
 * - Mismatch between acceptIndex entry and signed payload MUST fail
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  verifyOffer,
  type X402PaymentRequired,
  type X402AdapterConfig,
  type OfferVerification,
} from '../../packages/adapters/x402/src';

const FIXTURES_DIR = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures', 'x402');

// ---------------------------------------------------------------------------
// Fixture Types
// ---------------------------------------------------------------------------

interface VerificationFixtureInput {
  offer: {
    payload: {
      version: string;
      validUntil: number;
      network: string;
      asset: string;
      amount: string;
      payTo: string;
      scheme?: string;
    };
    signature: string;
    format: 'eip712' | 'jws';
  };
  accepts: Array<{
    network: string;
    asset: string;
    payTo: string;
    amount: string;
    scheme?: string;
  }>;
  acceptIndex?: number;
  resourceUrl?: string;
}

interface VerificationFixtureExpected {
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
  description: string;
  category: 'valid' | 'invalid' | 'edge-cases';
  threat_model?: string;
  input: VerificationFixtureInput;
  expected: VerificationFixtureExpected;
  notes?: string;
  config?: Partial<X402AdapterConfig>;
}

interface ManifestFile {
  $schema?: string;
  name: string;
  version: string;
  description: string;
  categories: {
    valid: { description: string; vectors: string[] };
    invalid: { description: string; vectors: string[] };
    'edge-cases': { description: string; vectors: string[] };
  };
  binding_rules: {
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

function toPaymentRequired(input: VerificationFixtureInput): X402PaymentRequired {
  return {
    offer: input.offer,
    accepts: input.accepts,
    acceptIndex: input.acceptIndex,
    resourceUrl: input.resourceUrl,
  };
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function assertVerification(
  result: OfferVerification,
  expected: VerificationFixtureExpected,
  fixtureName: string
): void {
  expect(result.valid, `${fixtureName}: validity mismatch`).toBe(expected.valid);

  if (expected.valid) {
    // For valid results, check matched index and hint usage
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
    // For invalid results, check error codes
    expect(result.errors.length, `${fixtureName}: should have errors`).toBeGreaterThan(0);
    if (expected.errors && expected.errors.length > 0) {
      const expectedCodes = expected.errors.map((e) => e.code);
      const actualCodes = result.errors.map((e) => e.code);
      for (const expectedCode of expectedCodes) {
        expect(actualCodes, `${fixtureName}: missing error code ${expectedCode}`).toContain(
          expectedCode
        );
      }
    }
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
      expect(manifest.version).toBe('0.2.0');
      expect(manifest.categories.valid.vectors.length).toBeGreaterThan(0);
      expect(manifest.categories.invalid.vectors.length).toBeGreaterThan(0);
    });

    it('should document binding rules', () => {
      expect(manifest.binding_rules.invariants).toContain(
        'acceptIndex is UNSIGNED and MUST be treated as a hint only'
      );
      expect(manifest.binding_rules.invariants).toContain(
        'Mismatch between acceptIndex entry and signed payload MUST fail'
      );
    });
  });

  describe('Valid Scenarios', () => {
    const validVectors = manifest.categories.valid.vectors;

    it.each(validVectors)('should accept: %s', (filename) => {
      const fixture = loadFixture(filename);
      expect(fixture.category).toBe('valid');

      const input = toPaymentRequired(fixture.input);
      const config: X402AdapterConfig = {
        supportedVersions: ['1'],
        clockSkewSeconds: 60,
        ...fixture.config,
      };

      const result = verifyOffer(input.offer, input.accepts, input.acceptIndex, config);

      assertVerification(result, fixture.expected, fixture.id);
    });
  });

  describe('Invalid Scenarios', () => {
    const invalidVectors = manifest.categories.invalid.vectors;

    it.each(invalidVectors)('should reject: %s', (filename) => {
      const fixture = loadFixture(filename);
      expect(fixture.category).toBe('invalid');

      const input = toPaymentRequired(fixture.input);
      const config: X402AdapterConfig = {
        supportedVersions: ['1'],
        clockSkewSeconds: 60,
        ...fixture.config,
      };

      const result = verifyOffer(input.offer, input.accepts, input.acceptIndex, config);

      assertVerification(result, fixture.expected, fixture.id);
    });
  });

  describe('Edge Cases', () => {
    // Filter out fixtures that require dynamic computation
    // (e.g., clock-skew-tolerance uses __NOW_MINUS_30__ placeholder)
    const DYNAMIC_FIXTURES = ['clock-skew-tolerance.json'];
    const edgeCaseVectors = manifest.categories['edge-cases'].vectors.filter(
      (f) => !DYNAMIC_FIXTURES.includes(f)
    );

    it.each(edgeCaseVectors)('should handle: %s', (filename) => {
      const fixture = loadFixture(filename);
      expect(fixture.category).toBe('edge-cases');

      const input = toPaymentRequired(fixture.input);
      const config: X402AdapterConfig = {
        supportedVersions: ['1'],
        clockSkewSeconds: 60,
        ...fixture.config,
      };

      const result = verifyOffer(input.offer, input.accepts, input.acceptIndex, config);

      assertVerification(result, fixture.expected, fixture.id);
    });

    // Dynamic fixtures that need special handling
    it('clock-skew-tolerance: should accept offer within skew tolerance', () => {
      // This test uses dynamic timestamps - compute now minus 30 seconds
      const now = Math.floor(Date.now() / 1000);
      const fixture = loadFixture('clock-skew-tolerance.json');

      // Override the placeholder with actual timestamp
      const input = toPaymentRequired({
        ...fixture.input,
        offer: {
          ...fixture.input.offer,
          payload: {
            ...fixture.input.offer.payload,
            validUntil: now - 30, // 30 seconds in the past
          },
        },
      });

      const result = verifyOffer(input.offer, input.accepts, input.acceptIndex, {
        supportedVersions: ['1'],
        clockSkewSeconds: 60, // 60 second tolerance
      });

      expect(result.valid).toBe(true);
      expect(result.matchedIndex).toBe(0);
    });
  });

  describe('Security Invariants', () => {
    it('acceptIndex tampering MUST be detected via term-matching', () => {
      // This is the core security property - load the term-mismatch fixture
      const fixture = loadFixture('accept-term-mismatch.json');

      const input = toPaymentRequired(fixture.input);
      const result = verifyOffer(input.offer, input.accepts, input.acceptIndex, {
        supportedVersions: ['1'],
        mismatchPolicy: 'fail', // Default and recommended
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'accept_term_mismatch')).toBe(true);
    });

    it('expired offers MUST be rejected', () => {
      const fixture = loadFixture('expired-offer.json');

      const input = toPaymentRequired(fixture.input);
      const result = verifyOffer(input.offer, input.accepts, input.acceptIndex, {
        supportedVersions: ['1'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'offer_expired')).toBe(true);
    });

    it('ambiguous matches without acceptIndex MUST fail', () => {
      const fixture = loadFixture('accept-ambiguous.json');

      const input = toPaymentRequired(fixture.input);
      const result = verifyOffer(input.offer, input.accepts, undefined, {
        supportedVersions: ['1'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'accept_ambiguous')).toBe(true);
    });
  });

  describe('Cross-Implementation Parity', () => {
    it('should have fixture count matching manifest', () => {
      const totalFixtures =
        manifest.categories.valid.vectors.length +
        manifest.categories.invalid.vectors.length +
        manifest.categories['edge-cases'].vectors.length;

      // Current fixture count: 3 valid + 13 invalid + 3 edge-cases = 19
      expect(totalFixtures).toBeGreaterThanOrEqual(19);
    });

    it('all fixture files should be loadable', () => {
      const allVectors = [
        ...manifest.categories.valid.vectors,
        ...manifest.categories.invalid.vectors,
        ...manifest.categories['edge-cases'].vectors,
      ];

      for (const filename of allVectors) {
        expect(() => loadFixture(filename)).not.toThrow();
      }
    });

    it('no orphan fixture files (all .json files must be in manifest)', () => {
      // Get all .json files in fixtures directory (excluding manifest.json and schema files)
      const allFiles = readdirSync(FIXTURES_DIR).filter(
        (f) => f.endsWith('.json') && f !== 'manifest.json' && !f.endsWith('.schema.json')
      );

      // Get all vectors listed in manifest
      const manifestVectors = new Set([
        ...manifest.categories.valid.vectors,
        ...manifest.categories.invalid.vectors,
        ...manifest.categories['edge-cases'].vectors,
      ]);

      // Find orphan files (in directory but not in manifest)
      const orphans = allFiles.filter((f) => !manifestVectors.has(f));

      expect(orphans, `Orphan fixture files found: ${orphans.join(', ')}`).toHaveLength(0);
    });
  });
});
