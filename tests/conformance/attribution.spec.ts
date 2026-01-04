/**
 * Attribution Conformance Tests
 *
 * Tests that attribution golden fixtures match the expected validation behavior.
 * Uses the @peac/attribution package for schema validation.
 *
 * Fixtures are in specs/conformance/fixtures/attribution/
 *
 * Conformance layers:
 * - Schema: JSON structure, types, required fields (this file)
 * - Runtime: Hash verification, chain validation (attribution package tests)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateAttributionAttestation } from '../../packages/schema/src/attribution';
import { verifySync } from '../../packages/attribution/src/verify';

const FIXTURES_DIR = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures', 'attribution');

// Fixture file types
interface ValidFixture {
  name: string;
  description: string;
  input: unknown;
  expected: {
    valid: boolean;
    sources_count?: number;
    derivation_type?: string;
    total_weight?: number;
    has_model_id?: boolean;
    has_content_hash?: boolean;
    has_excerpt_hash?: boolean;
    has_output_hash?: boolean;
    has_inference_provider?: boolean;
    has_session_id?: boolean;
    has_metadata?: boolean;
    has_expiration?: boolean;
    has_ref?: boolean;
    has_all_optional_fields?: boolean;
  };
}

interface InvalidFixture {
  name: string;
  description: string;
  input: unknown;
  expected: {
    valid: boolean;
    error_code: string;
  };
}

interface EdgeCaseFixture {
  name: string;
  description: string;
  input: unknown | { $comment: string };
  expected: {
    valid?: boolean;
    sources_count?: number;
    total_weight?: number;
    has_content_hash?: boolean;
    has_excerpt_hash?: boolean;
    has_metadata?: boolean;
    valid_types?: string[];
    valid_usages?: string[];
    $comment?: string;
  };
}

interface FixtureFile<T> {
  $comment: string;
  version: string;
  fixtures: T[];
}

// Load fixture files
function loadValidFixtures(): FixtureFile<ValidFixture> {
  const content = readFileSync(join(FIXTURES_DIR, 'valid.json'), 'utf8');
  return JSON.parse(content) as FixtureFile<ValidFixture>;
}

function loadInvalidFixtures(): FixtureFile<InvalidFixture> {
  const content = readFileSync(join(FIXTURES_DIR, 'invalid.json'), 'utf8');
  return JSON.parse(content) as FixtureFile<InvalidFixture>;
}

function loadEdgeCaseFixtures(): FixtureFile<EdgeCaseFixture> {
  const content = readFileSync(join(FIXTURES_DIR, 'edge-cases.json'), 'utf8');
  return JSON.parse(content) as FixtureFile<EdgeCaseFixture>;
}

describe('Attribution Conformance', () => {
  let validFixtures: FixtureFile<ValidFixture>;
  let invalidFixtures: FixtureFile<InvalidFixture>;
  let edgeCaseFixtures: FixtureFile<EdgeCaseFixture>;

  beforeAll(() => {
    validFixtures = loadValidFixtures();
    invalidFixtures = loadInvalidFixtures();
    edgeCaseFixtures = loadEdgeCaseFixtures();
  });

  describe('Valid Fixtures', () => {
    it('should have fixtures to test', () => {
      expect(validFixtures.fixtures.length).toBeGreaterThan(0);
      expect(validFixtures.version).toBe('0.9.26');
    });

    // We'll use a loop to generate tests for each fixture
    // Since we need beforeAll to run first, we use dynamic test generation
    describe('Schema Validation', () => {
      let fixtures: ValidFixture[];

      beforeAll(() => {
        fixtures = loadValidFixtures().fixtures;
      });

      it.each([
        'single-source-rag',
        'multiple-sources-synthesis',
        'training-input',
        'with-content-hashes',
        'with-excerpt-hash',
        'with-output-hash',
        'embedding-source',
        'with-inference-provider',
        'with-session-id',
        'with-metadata',
        'with-expiration',
        'with-ref-url',
        'mixed-usage-types',
        'url-receipt-refs',
        'urn-receipt-refs',
        'full-attribution',
      ])('should accept valid fixture: %s', (fixtureName) => {
        const fixture = loadValidFixtures().fixtures.find((f) => f.name === fixtureName);
        if (!fixture) {
          throw new Error(`Fixture not found: ${fixtureName}`);
        }

        const result = validateAttributionAttestation(fixture.input);
        expect(result.ok).toBe(true);

        if (result.ok) {
          expect(fixture.expected.valid).toBe(true);

          // Verify specific expectations
          if (fixture.expected.sources_count !== undefined) {
            expect(result.value.evidence.sources.length).toBe(fixture.expected.sources_count);
          }

          if (fixture.expected.derivation_type !== undefined) {
            expect(result.value.evidence.derivation_type).toBe(fixture.expected.derivation_type);
          }

          if (fixture.expected.has_model_id) {
            expect(result.value.evidence.model_id).toBeDefined();
          }

          if (fixture.expected.has_content_hash) {
            expect(result.value.evidence.sources[0].content_hash).toBeDefined();
          }

          if (fixture.expected.has_excerpt_hash) {
            expect(result.value.evidence.sources[0].excerpt_hash).toBeDefined();
          }

          if (fixture.expected.has_output_hash) {
            expect(result.value.evidence.output_hash).toBeDefined();
          }

          if (fixture.expected.has_inference_provider) {
            expect(result.value.evidence.inference_provider).toBeDefined();
          }

          if (fixture.expected.has_session_id) {
            expect(result.value.evidence.session_id).toBeDefined();
          }

          if (fixture.expected.has_metadata) {
            expect(result.value.evidence.metadata).toBeDefined();
          }

          if (fixture.expected.has_expiration) {
            expect(result.value.expires_at).toBeDefined();
          }

          if (fixture.expected.has_ref) {
            expect(result.value.ref).toBeDefined();
          }
        }
      });
    });

    describe('Sync Verification', () => {
      it.each(['single-source-rag', 'multiple-sources-synthesis', 'full-attribution'])(
        'should pass sync verification: %s',
        (fixtureName) => {
          const fixture = loadValidFixtures().fixtures.find((f) => f.name === fixtureName);
          if (!fixture) {
            throw new Error(`Fixture not found: ${fixtureName}`);
          }

          // First validate the schema
          const schemaResult = validateAttributionAttestation(fixture.input);
          expect(schemaResult.ok).toBe(true);

          if (schemaResult.ok) {
            // Then verify synchronously (without chain resolution)
            // Skip time validity checks since fixtures use future timestamps for testing
            const verifyResult = verifySync(schemaResult.value, {
              skipTimeValidityCheck: true,
              skipExpirationCheck: true,
            });
            expect(verifyResult.valid).toBe(true);
          }
        }
      );
    });
  });

  describe('Invalid Fixtures', () => {
    it('should have fixtures to test', () => {
      expect(invalidFixtures.fixtures.length).toBeGreaterThan(0);
      expect(invalidFixtures.version).toBe('0.9.26');
    });

    describe('Schema Validation', () => {
      it.each([
        'missing-sources',
        'missing-type',
        'wrong-type',
        'missing-issuer',
        'missing-issued-at',
        'invalid-issued-at-format',
        'invalid-receipt-ref-format',
        'missing-receipt-ref',
        'invalid-usage',
        'missing-usage',
        'invalid-derivation-type',
        'missing-derivation-type',
        'weight-too-low',
        'weight-too-high',
        'invalid-content-hash-algorithm',
        'invalid-content-hash-encoding',
        'invalid-content-hash-value-length',
        'invalid-content-hash-chars',
        'invalid-ref-url',
        'invalid-inference-provider-url',
      ])('should reject invalid fixture: %s', (fixtureName) => {
        const fixture = loadInvalidFixtures().fixtures.find((f) => f.name === fixtureName);
        if (!fixture) {
          throw new Error(`Fixture not found: ${fixtureName}`);
        }

        const result = validateAttributionAttestation(fixture.input);
        expect(result.ok).toBe(false);
        expect(fixture.expected.valid).toBe(false);
      });

      it('should reject extra unknown fields in strict mode', () => {
        const fixture = loadInvalidFixtures().fixtures.find(
          (f) => f.name === 'extra-unknown-field'
        );
        if (!fixture) {
          throw new Error('Fixture not found: extra-unknown-field');
        }

        const result = validateAttributionAttestation(fixture.input);
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('Edge Case Fixtures', () => {
    it('should have fixtures to test', () => {
      expect(edgeCaseFixtures.fixtures.length).toBeGreaterThan(0);
      expect(edgeCaseFixtures.version).toBe('0.9.26');
    });

    describe('Schema Validation', () => {
      // Skip meta-fixtures that don't have actual input
      const testableEdgeCases = [
        'max-sources',
        'weight-zero',
        'weight-one',
        'unicode-model-id',
        'long-receipt-ref',
        'same-source-multiple-usages',
        'fractional-weights',
        'content-hash-and-excerpt-hash',
        'empty-metadata-object',
        'nested-metadata',
        'mixed-ref-formats',
        'http-receipt-ref',
        'timestamp-milliseconds',
        'minimal-valid-attestation',
      ];

      it.each(testableEdgeCases)('should handle edge case: %s', (fixtureName) => {
        const fixture = loadEdgeCaseFixtures().fixtures.find((f) => f.name === fixtureName);
        if (!fixture) {
          throw new Error(`Fixture not found: ${fixtureName}`);
        }

        // Skip if it's a meta-fixture
        if ('$comment' in fixture.input) {
          return;
        }

        const result = validateAttributionAttestation(fixture.input);
        expect(result.ok).toBe(true);

        if (result.ok) {
          // Verify specific expectations
          if (fixture.expected.sources_count !== undefined) {
            expect(result.value.evidence.sources.length).toBe(fixture.expected.sources_count);
          }

          if (fixture.expected.has_content_hash) {
            expect(result.value.evidence.sources[0].content_hash).toBeDefined();
          }

          if (fixture.expected.has_excerpt_hash) {
            expect(result.value.evidence.sources[0].excerpt_hash).toBeDefined();
          }

          if (fixture.expected.has_metadata) {
            expect(result.value.evidence.metadata).toBeDefined();
          }
        }
      });

      it('should recognize all valid derivation types', () => {
        const metaFixture = loadEdgeCaseFixtures().fixtures.find(
          (f) => f.name === 'all-derivation-types'
        );
        expect(metaFixture).toBeDefined();
        expect(metaFixture?.expected.valid_types).toEqual([
          'training',
          'inference',
          'rag',
          'synthesis',
          'embedding',
        ]);
      });

      it('should recognize all valid usage types', () => {
        const metaFixture = loadEdgeCaseFixtures().fixtures.find(
          (f) => f.name === 'all-usage-types'
        );
        expect(metaFixture).toBeDefined();
        expect(metaFixture?.expected.valid_usages).toEqual([
          'training_input',
          'rag_context',
          'direct_reference',
          'synthesis_source',
          'embedding_source',
        ]);
      });
    });
  });

  describe('Cross-Language Parity', () => {
    it('should have consistent fixture version across all files', () => {
      expect(validFixtures.version).toBe('0.9.26');
      expect(invalidFixtures.version).toBe('0.9.26');
      expect(edgeCaseFixtures.version).toBe('0.9.26');
    });

    it('should have comprehensive fixture coverage', () => {
      // Valid: 16 fixtures
      expect(validFixtures.fixtures.length).toBe(16);

      // Invalid: 21 fixtures
      expect(invalidFixtures.fixtures.length).toBe(21);

      // Edge cases: 16 fixtures
      expect(edgeCaseFixtures.fixtures.length).toBe(16);
    });
  });
});
