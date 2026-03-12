/**
 * x402 Adapter Conformance Tests
 *
 * Tests that x402 verification golden fixtures match the expected behavior.
 * Uses the @peac/adapter-x402 package for verification.
 *
 * Fixtures are in specs/conformance/fixtures/x402/
 *
 * NOTE: Fixtures are v0.12.0 format (version: string, no resourceUrl/scheme).
 * This test bridges them to the v0.12.1 API by adapting fixture data at test time.
 * PR 3 will rewrite all fixtures to v0.12.1 format.
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
  type RawEIP712SignedOffer,
  type RawSignedOffer,
  type AcceptEntry,
  type X402AdapterConfig,
  type OfferVerification,
} from '../../packages/adapters/x402/src';

const FIXTURES_DIR = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures', 'x402');

// ---------------------------------------------------------------------------
// Fixture Types (v0.12.0 format; will be updated in PR 3)
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
  config?: Record<string, unknown>;
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

/**
 * Encode a value as base64url (no padding, per RFC 7515).
 */
function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Bridge v0.12.0 fixture format to v0.12.1 API types.
 *
 * Adapts old fixture data:
 * - version: string -> number
 * - Adds resourceUrl and scheme to offer payload
 * - Adds scheme to accept entries
 * - Creates RawSignedOffer with per-offer acceptIndex
 * - For JWS format: creates a compact JWS with the adapted payload inside
 */
function adaptFixtureToV0121(input: VerificationFixtureInput): {
  offer: RawSignedOffer;
  accepts: AcceptEntry[];
} {
  const scheme = input.offer.payload.scheme ?? 'exact';
  const resourceUrl = input.resourceUrl ?? 'https://fixture.example.com/resource';

  const adaptedPayload = {
    version: Number(input.offer.payload.version),
    validUntil: input.offer.payload.validUntil,
    network: input.offer.payload.network,
    asset: input.offer.payload.asset,
    amount: input.offer.payload.amount,
    payTo: input.offer.payload.payTo,
    resourceUrl,
    scheme,
  };

  let offer: RawSignedOffer;

  if (input.offer.format === 'jws') {
    // For JWS: create a compact JWS with the adapted payload encoded inside
    const header = base64urlEncode(JSON.stringify({ alg: 'ES256' }));
    const payload = base64urlEncode(JSON.stringify(adaptedPayload));
    const sig = base64urlEncode('test-signature');
    const compactJws = `${header}.${payload}.${sig}`;

    offer = {
      format: 'jws',
      signature: compactJws,
      ...(input.acceptIndex !== undefined && { acceptIndex: input.acceptIndex }),
    };
  } else {
    offer = {
      format: 'eip712',
      payload: adaptedPayload,
      signature: input.offer.signature,
      ...(input.acceptIndex !== undefined && { acceptIndex: input.acceptIndex }),
    } as RawEIP712SignedOffer;
  }

  const accepts: AcceptEntry[] = input.accepts.map((a) => ({
    network: a.network,
    asset: a.asset,
    payTo: a.payTo,
    amount: a.amount,
    scheme: a.scheme ?? 'exact',
  }));

  return { offer, accepts };
}

/**
 * Adapt fixture config to v0.12.1 format.
 * Converts supportedVersions from string[] to number[].
 */
function adaptConfig(fixtureConfig?: Record<string, unknown>): X402AdapterConfig {
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
      // Convert string[] to number[]
      const versions = fixtureConfig.supportedVersions as (string | number)[];
      config.supportedVersions = versions.map((v) => Number(v));
    }
    if (fixtureConfig.maxAcceptEntries !== undefined) {
      config.maxAcceptEntries = fixtureConfig.maxAcceptEntries as number;
    }
  }

  return config;
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

      const { offer, accepts } = adaptFixtureToV0121(fixture.input);
      const config = adaptConfig(fixture.config);

      const result = verifyOffer(offer, accepts, config);

      assertVerification(result, fixture.expected, fixture.id);
    });
  });

  describe('Invalid Scenarios', () => {
    const invalidVectors = manifest.categories.invalid.vectors;

    it.each(invalidVectors)('should reject: %s', (filename) => {
      const fixture = loadFixture(filename);
      expect(fixture.category).toBe('invalid');

      const { offer, accepts } = adaptFixtureToV0121(fixture.input);
      const config = adaptConfig(fixture.config);

      const result = verifyOffer(offer, accepts, config);

      assertVerification(result, fixture.expected, fixture.id);
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

      const { offer, accepts } = adaptFixtureToV0121(fixture.input);
      const config = adaptConfig(fixture.config);

      const result = verifyOffer(offer, accepts, config);

      assertVerification(result, fixture.expected, fixture.id);
    });

    it('clock-skew-tolerance: should accept offer within skew tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const fixture = loadFixture('clock-skew-tolerance.json');

      // Override the placeholder with actual timestamp
      const modifiedInput = {
        ...fixture.input,
        offer: {
          ...fixture.input.offer,
          payload: {
            ...fixture.input.offer.payload,
            validUntil: now - 30, // 30 seconds in the past
          },
        },
      };

      const { offer, accepts } = adaptFixtureToV0121(modifiedInput);
      const config = adaptConfig(fixture.config);
      config.clockSkewSeconds = 60; // 60 second tolerance

      const result = verifyOffer(offer, accepts, config);

      expect(result.valid).toBe(true);
      expect(result.matchedIndex).toBe(0);
    });
  });

  describe('Security Invariants', () => {
    it('acceptIndex tampering MUST be detected via term-matching', () => {
      const fixture = loadFixture('accept-term-mismatch.json');

      const { offer, accepts } = adaptFixtureToV0121(fixture.input);
      const config = adaptConfig(fixture.config);
      config.mismatchPolicy = 'fail';

      const result = verifyOffer(offer, accepts, config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'accept_term_mismatch')).toBe(true);
    });

    it('expired offers MUST be rejected', () => {
      const fixture = loadFixture('expired-offer.json');

      const { offer, accepts } = adaptFixtureToV0121(fixture.input);
      const config = adaptConfig(fixture.config);

      const result = verifyOffer(offer, accepts, config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'offer_expired')).toBe(true);
    });

    it('ambiguous matches without acceptIndex MUST fail', () => {
      const fixture = loadFixture('accept-ambiguous.json');

      // Remove acceptIndex for this test
      const modifiedInput = {
        ...fixture.input,
        acceptIndex: undefined,
      };

      const { offer, accepts } = adaptFixtureToV0121(modifiedInput);
      const config = adaptConfig(fixture.config);

      const result = verifyOffer(offer, accepts, config);

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
      const allFiles = readdirSync(FIXTURES_DIR).filter(
        (f) => f.endsWith('.json') && f !== 'manifest.json' && !f.endsWith('.schema.json')
      );

      const manifestVectors = new Set([
        ...manifest.categories.valid.vectors,
        ...manifest.categories.invalid.vectors,
        ...manifest.categories['edge-cases'].vectors,
      ]);

      const orphans = allFiles.filter((f) => !manifestVectors.has(f));

      expect(orphans, `Orphan fixture files found: ${orphans.join(', ')}`).toHaveLength(0);
    });
  });
});
