/**
 * Workflow Conformance Tests
 *
 * Tests that workflow golden fixtures match the expected validation behavior.
 * Uses Ajv for fixture schema validation and @peac/schema for domain validation.
 *
 * Fixtures are in specs/conformance/fixtures/workflow/
 *
 * Conformance layers:
 * - Fixture schema: JSON structure matches fixtures.schema.json (Ajv)
 * - Domain validation: WorkflowContext uses ordered validator (structural + semantic),
 *   WorkflowSummaryAttestation uses Zod schema
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WorkflowSummaryAttestationSchema, validateWorkflowContextOrdered } from '@peac/schema';

const FIXTURES_DIR = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures', 'workflow');

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

interface Fixture {
  name: string;
  description: string;
  type: 'WorkflowContext' | 'WorkflowSummaryAttestation';
  input: unknown;
  expected: {
    valid: boolean;
    error_code?: string;
    error?: string;
    meta?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

interface FixtureFile {
  $schema?: string;
  $comment?: string;
  version: string;
  fixtures: Fixture[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixtureFile(filename: string): FixtureFile {
  const content = readFileSync(join(FIXTURES_DIR, filename), 'utf8');
  return JSON.parse(content) as FixtureFile;
}

/**
 * Validate a fixture input using the appropriate validator.
 * WorkflowContext uses the ordered validator (catches both structural and
 * semantic violations like self-parent, duplicate parents).
 * WorkflowSummaryAttestation uses the Zod schema.
 */
function validateFixtureInput(fixture: Fixture): {
  valid: boolean;
  error_code?: string;
  error?: string;
} {
  if (fixture.type === 'WorkflowContext') {
    const result = validateWorkflowContextOrdered(fixture.input);
    if (result.valid) {
      return { valid: true };
    }
    return { valid: false, error_code: result.error_code, error: result.error };
  }
  if (fixture.type === 'WorkflowSummaryAttestation') {
    const result = WorkflowSummaryAttestationSchema.safeParse(fixture.input);
    return result.success ? { valid: true } : { valid: false, error: result.error.message };
  }
  return { valid: false, error: `Unknown fixture type: ${fixture.type}` };
}

// ---------------------------------------------------------------------------
// Ajv setup for fixture schema validation
// ---------------------------------------------------------------------------

function createFixtureSchemaValidator() {
  // strict: false because the if/then conditional uses required without
  // re-declaring properties in the then subschema (valid JSON Schema 2020-12,
  // but Ajv strictRequired enforces co-located property definitions)
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const schemaContent = readFileSync(join(FIXTURES_DIR, 'fixtures.schema.json'), 'utf8');
  const schema = JSON.parse(schemaContent);
  return ajv.compile(schema);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Workflow Conformance', () => {
  let validFixtures: FixtureFile;
  let invalidFixtures: FixtureFile;
  let edgeCaseFixtures: FixtureFile;
  let validateFixtureSchema: ReturnType<typeof createFixtureSchemaValidator>;

  beforeAll(() => {
    validFixtures = loadFixtureFile('valid.json');
    invalidFixtures = loadFixtureFile('invalid.json');
    edgeCaseFixtures = loadFixtureFile('edge-cases.json');
    validateFixtureSchema = createFixtureSchemaValidator();
  });

  // -------------------------------------------------------------------------
  // Fixture Schema Validation (Ajv against fixtures.schema.json)
  // -------------------------------------------------------------------------

  describe('Fixture Schema (Ajv)', () => {
    it('valid.json conforms to fixtures.schema.json', () => {
      const result = validateFixtureSchema(validFixtures);
      if (!result) {
        const errors = validateFixtureSchema.errors;
        throw new Error(`valid.json schema errors: ${JSON.stringify(errors, null, 2)}`);
      }
      expect(result).toBe(true);
    });

    it('invalid.json conforms to fixtures.schema.json', () => {
      const result = validateFixtureSchema(invalidFixtures);
      if (!result) {
        const errors = validateFixtureSchema.errors;
        throw new Error(`invalid.json schema errors: ${JSON.stringify(errors, null, 2)}`);
      }
      expect(result).toBe(true);
    });

    it('edge-cases.json conforms to fixtures.schema.json', () => {
      const result = validateFixtureSchema(edgeCaseFixtures);
      if (!result) {
        const errors = validateFixtureSchema.errors;
        throw new Error(`edge-cases.json schema errors: ${JSON.stringify(errors, null, 2)}`);
      }
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Fixture Hygiene
  // -------------------------------------------------------------------------

  describe('Fixture Hygiene', () => {
    it('valid fixture names are unique', () => {
      const names = validFixtures.fixtures.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('invalid fixture names are unique', () => {
      const names = invalidFixtures.fixtures.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('edge-case fixture names are unique', () => {
      const names = edgeCaseFixtures.fixtures.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('fixture versions are consistent across all files', () => {
      expect(validFixtures.version).toBe(invalidFixtures.version);
      expect(validFixtures.version).toBe(edgeCaseFixtures.version);
    });

    it('fixture versions are semver-compatible', () => {
      const semverPattern = /^\d+\.\d+\.\d+$/;
      expect(validFixtures.version).toMatch(semverPattern);
    });

    it('all invalid fixtures have error_code', () => {
      for (const fixture of invalidFixtures.fixtures) {
        expect(
          fixture.expected.error_code,
          `${fixture.name} missing expected.error_code`
        ).toBeDefined();
        expect(fixture.expected.error_code).toMatch(/^E_WORKFLOW_/);
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

    it('all valid fixtures pass validation', () => {
      for (const fixture of validFixtures.fixtures) {
        const result = validateFixtureInput(fixture);
        expect(result.valid, `${fixture.name} should be valid but got: ${result.error}`).toBe(true);
      }
    });

    it('valid fixtures match expected properties', () => {
      for (const fixture of validFixtures.fixtures) {
        const input = fixture.input as Record<string, unknown>;

        if (fixture.expected.is_root_step !== undefined) {
          const parents = input.parent_step_ids as unknown[];
          expect(parents.length === 0, `${fixture.name}: is_root_step mismatch`).toBe(
            fixture.expected.is_root_step
          );
        }

        if (fixture.expected.parent_count !== undefined) {
          const parents = input.parent_step_ids as unknown[];
          expect(parents.length).toBe(fixture.expected.parent_count);
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

    it('WorkflowContext fixtures match error_code', () => {
      const contextFixtures = invalidFixtures.fixtures.filter((f) => f.type === 'WorkflowContext');
      for (const fixture of contextFixtures) {
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
  });

  // -------------------------------------------------------------------------
  // Edge Case Fixtures
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
  });
});
