/**
 * Interaction Evidence Conformance Tests
 *
 * Tests that interaction golden fixtures match the expected validation behavior.
 * Uses @peac/schema for domain validation with ordered validator.
 *
 * Fixtures are in specs/conformance/fixtures/interaction/
 *
 * Conformance layers:
 * - Domain validation: InteractionEvidenceV01 uses ordered validator (structural + semantic)
 * - Error codes: Invalid fixtures must fail with the expected E_INTERACTION_* code
 * - Warnings: Edge cases may produce W_INTERACTION_* warnings while being valid
 *
 * NOTE: Global hygiene checks (manifest count, unique names, versions) are handled
 * by tests/conformance/manifest.spec.ts. This file focuses on domain validation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
import {
  validateInteractionOrdered,
  validateInteraction,
  InteractionEvidenceV01Schema,
} from '@peac/schema';
import {
  CONFORMANCE_ROOT,
  loadFixtureFile,
  assertValidDigests,
  type BaseFixture,
  type BaseFixtureFile,
} from './_harness';

const FIXTURES_DIR = join(CONFORMANCE_ROOT, 'interaction');

// ---------------------------------------------------------------------------
// Fixture types (extends base types with interaction-specific fields)
// ---------------------------------------------------------------------------

interface Warning {
  code: string;
  field?: string;
}

interface InteractionFixture extends BaseFixture {
  type: 'InteractionEvidenceV01';
  expected: {
    valid: boolean;
    error_code?: string;
    error?: string;
    errors?: Array<{ code: string; field?: string }>;
    warnings?: Warning[];
    meta?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

type InteractionFixtureFile = BaseFixtureFile<InteractionFixture>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load an interaction fixture file from the interaction fixtures directory.
 */
function loadInteractionFixtureFile(filename: string): InteractionFixtureFile {
  return loadFixtureFile<InteractionFixture>('interaction', filename);
}

/**
 * Validate a fixture input using the ordered validator.
 * Returns detailed result with errors and warnings.
 */
function validateFixtureInput(fixture: BaseFixture): {
  valid: boolean;
  error_code?: string;
  error?: string;
  warnings?: Warning[];
} {
  const result = validateInteractionOrdered(fixture.input);
  if (result.valid) {
    return {
      valid: true,
      warnings: result.warnings?.map((w) => ({ code: w.code, field: w.field })),
    };
  }
  const firstError = result.errors[0];
  return {
    valid: false,
    error_code: firstError?.code,
    error: firstError?.message,
    warnings: result.warnings?.map((w) => ({ code: w.code, field: w.field })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Interaction Evidence Conformance', () => {
  let validFixtures: InteractionFixtureFile;
  let invalidFixtures: InteractionFixtureFile;
  let edgeCaseFixtures: InteractionFixtureFile;

  beforeAll(() => {
    validFixtures = loadInteractionFixtureFile('valid.json');
    invalidFixtures = loadInteractionFixtureFile('invalid.json');
    edgeCaseFixtures = loadInteractionFixtureFile('edge-cases.json');
  });

  // -------------------------------------------------------------------------
  // Interaction-Specific Hygiene (domain-specific checks not in manifest.spec.ts)
  // -------------------------------------------------------------------------

  describe('Interaction-Specific Hygiene', () => {
    it('all invalid fixtures have E_INTERACTION_* error_code', () => {
      for (const fixture of invalidFixtures.fixtures) {
        expect(
          fixture.expected.error_code,
          `${fixture.name} missing expected.error_code`
        ).toBeDefined();
        expect(fixture.expected.error_code).toMatch(/^E_INTERACTION_/);
      }
    });

    it('valid fixtures have proper 64-char lowercase hex digests', () => {
      // Use shared harness utility for digest validation
      assertValidDigests(validFixtures.fixtures);
    });

    it('valid edge-case fixtures have proper digests', () => {
      // Only check edge-case fixtures that are expected to be valid
      const validEdgeCases = edgeCaseFixtures.fixtures.filter((f) => f.expected.valid === true);
      assertValidDigests(validEdgeCases);
    });
  });

  // -------------------------------------------------------------------------
  // Ordering Lock Enforcement (Precedence Regression Prevention)
  // -------------------------------------------------------------------------

  describe('Ordering Lock Enforcement', () => {
    it('ordering_lock fixtures produce exact error_code from validator', () => {
      // Filter fixtures that have meta.ordering_lock - these pin validation precedence
      const orderingLockFixtures = invalidFixtures.fixtures.filter(
        (f) => f.expected.meta?.ordering_lock
      );

      expect(orderingLockFixtures.length).toBeGreaterThan(0);

      for (const fixture of orderingLockFixtures) {
        const result = validateInteractionOrdered(fixture.input);

        // Must fail validation
        expect(result.valid, `${fixture.name}: ordering_lock fixture should fail validation`).toBe(
          false
        );

        if (!result.valid) {
          // Must produce exact error_code specified in fixture
          const actualCode = result.errors[0]?.code;
          const expectedCode = fixture.expected.error_code;

          expect(
            actualCode,
            `${fixture.name}: ordering_lock violation - expected ${expectedCode} but got ${actualCode}\n` +
              `Lock reason: ${fixture.expected.meta?.ordering_lock}`
          ).toBe(expectedCode);
        }
      }
    });

    it('ordering_lock fixtures document their precedence rule', () => {
      const orderingLockFixtures = invalidFixtures.fixtures.filter(
        (f) => f.expected.meta?.ordering_lock
      );

      for (const fixture of orderingLockFixtures) {
        const lockReason = fixture.expected.meta?.ordering_lock;

        // Lock reason must be a meaningful description
        expect(
          typeof lockReason === 'string' && lockReason.length >= 10,
          `${fixture.name}: ordering_lock must have descriptive reason (>= 10 chars)`
        ).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Valid Fixtures
  // -------------------------------------------------------------------------

  describe('Valid Fixtures', () => {
    it('has fixtures to test', () => {
      expect(validFixtures.fixtures.length).toBeGreaterThan(0);
    });

    it('all valid fixtures pass Zod schema validation', () => {
      for (const fixture of validFixtures.fixtures) {
        const result = InteractionEvidenceV01Schema.safeParse(fixture.input);
        expect(
          result.success,
          `${fixture.name} should pass Zod validation but got: ${
            !result.success ? result.error.message : ''
          }`
        ).toBe(true);
      }
    });

    it('all valid fixtures pass ordered validation', () => {
      for (const fixture of validFixtures.fixtures) {
        const result = validateFixtureInput(fixture);
        expect(result.valid, `${fixture.name} should be valid but got: ${result.error}`).toBe(true);
      }
    });

    it('all valid fixtures pass compat API', () => {
      for (const fixture of validFixtures.fixtures) {
        const result = validateInteraction(fixture.input);
        expect(result.valid, `${fixture.name} should be valid via compat API`).toBe(true);
      }
    });

    it('valid fixtures with warnings have expected warning codes', () => {
      const fixturesWithWarnings = validFixtures.fixtures.filter(
        (f) => f.expected.warnings && f.expected.warnings.length > 0
      );

      for (const fixture of fixturesWithWarnings) {
        const result = validateFixtureInput(fixture);
        expect(result.valid).toBe(true);

        // Check that expected warning codes are present
        const expectedCodes = fixture.expected.warnings!.map((w) => w.code);
        const actualCodes = result.warnings?.map((w) => w.code) || [];

        for (const expectedCode of expectedCodes) {
          expect(actualCodes, `${fixture.name}: expected warning ${expectedCode}`).toContain(
            expectedCode
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invalid Fixtures (must fail with correct error_code)
  // -------------------------------------------------------------------------

  describe('Invalid Fixtures', () => {
    it('has fixtures to test', () => {
      expect(invalidFixtures.fixtures.length).toBeGreaterThan(0);
    });

    it('all invalid fixtures fail validation', () => {
      for (const fixture of invalidFixtures.fixtures) {
        const result = validateFixtureInput(fixture);
        expect(result.valid, `${fixture.name} should be invalid but passed validation`).toBe(false);
      }
    });

    it('invalid fixtures match error_code', () => {
      for (const fixture of invalidFixtures.fixtures) {
        const result = validateFixtureInput(fixture);
        expect(result.valid).toBe(false);

        if (!result.valid && fixture.expected.error_code) {
          expect(
            result.error_code,
            `${fixture.name}: expected ${fixture.expected.error_code} but got ${result.error_code}`
          ).toBe(fixture.expected.error_code);
        }
      }
    });

    it('compat API returns same error_code as ordered validator', () => {
      for (const fixture of invalidFixtures.fixtures) {
        const orderedResult = validateFixtureInput(fixture);
        const compatResult = validateInteraction(fixture.input);

        expect(compatResult.valid).toBe(false);
        expect(
          compatResult.error_code,
          `${fixture.name}: compat API should return ${orderedResult.error_code}`
        ).toBe(orderedResult.error_code);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge Case Fixtures (may be valid with warnings)
  // -------------------------------------------------------------------------

  describe('Edge Case Fixtures', () => {
    it('has fixtures to test', () => {
      expect(edgeCaseFixtures.fixtures.length).toBeGreaterThan(0);
    });

    it('edge cases match expected validation outcome', () => {
      for (const fixture of edgeCaseFixtures.fixtures) {
        if (!fixture.input) continue;

        const result = validateFixtureInput(fixture);

        if (fixture.expected.valid !== undefined) {
          expect(
            result.valid,
            `${fixture.name}: expected valid=${fixture.expected.valid} but got ${result.valid}` +
              (result.error ? ` (${result.error})` : '')
          ).toBe(fixture.expected.valid);
        }
      }
    });

    it('invalid edge cases match error_code', () => {
      const invalidEdgeCases = edgeCaseFixtures.fixtures.filter(
        (f) => f.expected.valid === false && f.input
      );
      for (const fixture of invalidEdgeCases) {
        const result = validateFixtureInput(fixture);
        expect(result.valid).toBe(false);
        if (!result.valid && fixture.expected.error_code) {
          expect(
            result.error_code,
            `${fixture.name}: expected ${fixture.expected.error_code} but got ${result.error_code}`
          ).toBe(fixture.expected.error_code);
        }
      }
    });

    it('valid edge cases with warnings have expected warning codes', () => {
      const validWithWarnings = edgeCaseFixtures.fixtures.filter(
        (f) => f.expected.valid === true && f.expected.warnings && f.expected.warnings.length > 0
      );

      for (const fixture of validWithWarnings) {
        const result = validateFixtureInput(fixture);
        expect(result.valid).toBe(true);

        // Check that expected warning codes are present (by code only, not message)
        const expectedCodes = fixture.expected.warnings!.map((w) => w.code);
        const actualCodes = result.warnings?.map((w) => w.code) || [];

        for (const expectedCode of expectedCodes) {
          expect(actualCodes, `${fixture.name}: expected warning ${expectedCode}`).toContain(
            expectedCode
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Cross-Validation: Schema vs Ordered Validator Equivalence
  // -------------------------------------------------------------------------

  describe('Schema vs Ordered Validator Equivalence', () => {
    it('schema.safeParse and validateInteractionOrdered agree on validity', () => {
      const allFixtures = [
        ...validFixtures.fixtures,
        ...invalidFixtures.fixtures,
        ...edgeCaseFixtures.fixtures.filter((f) => f.input),
      ];

      for (const fixture of allFixtures) {
        const schemaResult = InteractionEvidenceV01Schema.safeParse(fixture.input);
        const orderedResult = validateInteractionOrdered(fixture.input);

        expect(
          schemaResult.success,
          `${fixture.name}: schema and ordered validator disagree on validity. ` +
            `Schema: ${schemaResult.success}, Ordered: ${orderedResult.valid}`
        ).toBe(orderedResult.valid);
      }
    });
  });
});
