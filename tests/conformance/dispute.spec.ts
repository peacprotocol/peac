/**
 * Dispute Conformance Tests
 *
 * Tests that dispute golden fixtures match the expected validation behavior.
 * Uses the @peac/schema package for schema validation.
 *
 * Fixtures are in specs/conformance/fixtures/dispute/
 *
 * Conformance layers:
 * - Schema: JSON structure, types, required fields (this file)
 * - Runtime: State transitions, target resolution, duplicate detection (future)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateDisputeAttestation } from '../../packages/schema/src/dispute';

const FIXTURES_DIR = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures', 'dispute');

// ULID validation: Crockford Base32 (excludes I, L, O, U)
const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

// Fixture file types
interface ValidFixture {
  name: string;
  description: string;
  input: unknown;
  expected: {
    valid: boolean;
    state?: string;
    dispute_type?: string;
    outcome?: string;
    grounds_count?: number;
    has_contact?: boolean;
    has_expiry?: boolean;
    has_window_hint?: boolean;
    has_remediation?: boolean;
    remediation_has_deadline?: boolean;
    contact_method?: string;
    description_length_gte?: number;
    supporting_receipts_count?: number;
    supporting_attributions_count?: number;
    supporting_documents_count?: number;
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
  input?: unknown;
  transition_test?: boolean;
  multi_input?: boolean;
  runtime_test?: boolean;
  from_state?: string;
  to_state?: string;
  inputs?: unknown[];
  test_sequence?: unknown[];
  resolution?: unknown;
  expected: {
    valid?: boolean;
    schema_valid?: boolean;
    runtime_valid?: boolean;
    valid_transition?: boolean;
    all_valid?: boolean;
    state?: string;
    grounds_count?: number;
    description_length?: number;
    to_state?: string;
    requires_resolution?: boolean;
    resolution_cleared?: boolean;
    error_code?: string;
    target_types_count?: number;
    dispute_types_count?: number;
    grounds_codes_count?: number;
    outcomes_count?: number;
    remediation_types_count?: number;
    valid_transitions?: string[];
    note?: string;
    retriable?: boolean;
    success?: boolean;
  };
}

interface FixtureFile<T> {
  $comment: string;
  version: string;
  fixtures: T[];
}

// Load fixture files once
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

describe('Dispute Conformance', () => {
  let validFixtures: FixtureFile<ValidFixture>;
  let invalidFixtures: FixtureFile<InvalidFixture>;
  let edgeCaseFixtures: FixtureFile<EdgeCaseFixture>;

  beforeAll(() => {
    validFixtures = loadValidFixtures();
    invalidFixtures = loadInvalidFixtures();
    edgeCaseFixtures = loadEdgeCaseFixtures();
  });

  describe('Fixture Hygiene', () => {
    it('valid fixture names are unique', () => {
      const names = validFixtures.fixtures.map((f) => f.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('invalid fixture names are unique', () => {
      const names = invalidFixtures.fixtures.map((f) => f.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('edge-case fixture names are unique', () => {
      const names = edgeCaseFixtures.fixtures.map((f) => f.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('all ULIDs in valid fixtures are well-formed', () => {
      for (const fixture of validFixtures.fixtures) {
        const input = fixture.input as { ref?: string };
        if (input.ref) {
          expect(ULID_REGEX.test(input.ref), `Invalid ULID in ${fixture.name}: ${input.ref}`).toBe(
            true
          );
        }
      }
    });

    it('all ULIDs in invalid fixtures are well-formed (except ULID-specific tests)', () => {
      for (const fixture of invalidFixtures.fixtures) {
        // Skip fixtures specifically testing invalid ULIDs
        if (fixture.name.includes('ulid')) continue;

        const input = fixture.input as { ref?: string };
        if (input.ref) {
          expect(ULID_REGEX.test(input.ref), `Invalid ULID in ${fixture.name}: ${input.ref}`).toBe(
            true
          );
        }
      }
    });

    it('fixture versions are semver-compatible', () => {
      const semverPattern = /^\d+\.\d+\.\d+$/;
      expect(validFixtures.version).toMatch(semverPattern);
      expect(invalidFixtures.version).toMatch(semverPattern);
      expect(edgeCaseFixtures.version).toMatch(semverPattern);
    });

    it('fixture versions are consistent across all files', () => {
      expect(validFixtures.version).toBe(invalidFixtures.version);
      expect(validFixtures.version).toBe(edgeCaseFixtures.version);
    });
  });

  describe('Valid Fixtures', () => {
    it('has fixtures to test', () => {
      expect(validFixtures.fixtures.length).toBeGreaterThan(0);
    });

    it('all valid fixtures pass schema validation', () => {
      for (const fixture of validFixtures.fixtures) {
        const result = validateDisputeAttestation(fixture.input);
        expect(
          result.ok,
          `${fixture.name} should be valid but got: ${JSON.stringify(result)}`
        ).toBe(true);

        if (result.ok) {
          // Verify specific expectations when present
          if (fixture.expected.state !== undefined) {
            expect(result.value.evidence.state).toBe(fixture.expected.state);
          }

          if (fixture.expected.dispute_type !== undefined) {
            expect(result.value.evidence.dispute_type).toBe(fixture.expected.dispute_type);
          }

          if (fixture.expected.outcome !== undefined) {
            expect(result.value.evidence.resolution?.outcome).toBe(fixture.expected.outcome);
          }

          if (fixture.expected.grounds_count !== undefined) {
            expect(result.value.evidence.grounds.length).toBe(fixture.expected.grounds_count);
          }

          if (fixture.expected.has_contact) {
            expect(result.value.evidence.contact).toBeDefined();
          }

          if (fixture.expected.has_expiry) {
            expect(result.value.expires_at).toBeDefined();
          }

          if (fixture.expected.has_window_hint) {
            expect(result.value.evidence.window_hint_days).toBeDefined();
          }

          if (fixture.expected.has_remediation) {
            expect(result.value.evidence.resolution?.remediation).toBeDefined();
          }

          if (fixture.expected.remediation_has_deadline) {
            expect(result.value.evidence.resolution?.remediation?.deadline).toBeDefined();
          }

          if (fixture.expected.contact_method !== undefined) {
            expect(result.value.evidence.contact?.method).toBe(fixture.expected.contact_method);
          }

          if (fixture.expected.description_length_gte !== undefined) {
            expect(result.value.evidence.description.length).toBeGreaterThanOrEqual(
              fixture.expected.description_length_gte
            );
          }

          if (fixture.expected.supporting_receipts_count !== undefined) {
            expect(result.value.evidence.supporting_receipts?.length).toBe(
              fixture.expected.supporting_receipts_count
            );
          }

          if (fixture.expected.supporting_attributions_count !== undefined) {
            expect(result.value.evidence.supporting_attributions?.length).toBe(
              fixture.expected.supporting_attributions_count
            );
          }

          if (fixture.expected.supporting_documents_count !== undefined) {
            expect(result.value.evidence.supporting_documents?.length).toBe(
              fixture.expected.supporting_documents_count
            );
          }
        }
      }
    });
  });

  describe('Invalid Fixtures', () => {
    it('has fixtures to test', () => {
      expect(invalidFixtures.fixtures.length).toBeGreaterThan(0);
    });

    it('all invalid fixtures fail schema validation', () => {
      for (const fixture of invalidFixtures.fixtures) {
        const result = validateDisputeAttestation(fixture.input);
        expect(result.ok, `${fixture.name} should be invalid but passed validation`).toBe(false);

        // Verify error contains expected category/path when error_code hints at it
        if (!result.ok && fixture.expected.error_code) {
          // Extract category from error code (e.g., E_DISPUTE_INVALID_FORMAT -> DISPUTE)
          const errorCategory = fixture.expected.error_code.split('_')[1]?.toLowerCase();
          // Just verify we got an error - specific error code matching would require
          // the validator to return structured errors with codes
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Edge Case Fixtures', () => {
    it('has fixtures to test', () => {
      expect(edgeCaseFixtures.fixtures.length).toBeGreaterThan(0);
    });

    it('testable edge cases pass schema validation', () => {
      for (const fixture of edgeCaseFixtures.fixtures) {
        // Skip special test types that don't have standard input
        if (fixture.transition_test || fixture.multi_input || fixture.runtime_test) {
          continue;
        }

        if (!fixture.input) {
          continue;
        }

        const result = validateDisputeAttestation(fixture.input);

        // Edge cases with expected.valid explicitly set
        if (fixture.expected.valid !== undefined) {
          expect(result.ok, `${fixture.name}: expected valid=${fixture.expected.valid}`).toBe(
            fixture.expected.valid
          );
        } else {
          // Default expectation for edge cases with input: should be valid
          expect(
            result.ok,
            `${fixture.name} should be valid but got: ${JSON.stringify(result)}`
          ).toBe(true);
        }

        if (result.ok) {
          if (fixture.expected.grounds_count !== undefined) {
            expect(result.value.evidence.grounds.length).toBe(fixture.expected.grounds_count);
          }

          if (fixture.expected.state !== undefined) {
            expect(result.value.evidence.state).toBe(fixture.expected.state);
          }

          if (fixture.expected.description_length !== undefined) {
            expect(result.value.evidence.description.length).toBe(
              fixture.expected.description_length
            );
          }
        }
      }
    });

    it('transition test fixtures are properly structured', () => {
      const transitionFixtures = edgeCaseFixtures.fixtures.filter((f) => f.transition_test);
      expect(transitionFixtures.length).toBeGreaterThan(0);

      for (const fixture of transitionFixtures) {
        expect(fixture.from_state, `${fixture.name} missing from_state`).toBeDefined();
        expect(fixture.to_state, `${fixture.name} missing to_state`).toBeDefined();
      }
    });

    it('runtime test fixtures are properly structured', () => {
      const runtimeFixtures = edgeCaseFixtures.fixtures.filter((f) => f.runtime_test);
      expect(runtimeFixtures.length).toBeGreaterThan(0);

      for (const fixture of runtimeFixtures) {
        expect(fixture.expected.schema_valid, `${fixture.name} missing schema_valid`).toBe(true);
        expect(fixture.expected.runtime_valid, `${fixture.name} missing runtime_valid`).toBe(false);
      }
    });

    it('multi-input fixtures have inputs array', () => {
      const multiInputFixtures = edgeCaseFixtures.fixtures.filter((f) => f.multi_input);
      expect(multiInputFixtures.length).toBeGreaterThan(0);

      for (const fixture of multiInputFixtures) {
        expect(Array.isArray(fixture.inputs), `${fixture.name} missing inputs array`).toBe(true);
        expect(fixture.inputs!.length).toBeGreaterThan(0);
      }
    });
  });
});
