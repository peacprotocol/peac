/**
 * RFC 9421 Proof Capture Extension Conformance Tests
 *
 * Validates rfc9421-proof fixtures against:
 * 1. InteractionEvidenceV01Schema (Zod) -- structural validity as interaction evidence
 * 2. Extension JSON Schema (Ajv) -- extension payload matches rfc9421-proof/0.1 schema
 *
 * This ensures the extension schema is not decorative -- CI enforces it.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { InteractionEvidenceV01Schema, validateInteractionOrdered } from '@peac/schema';
import { loadFixtureFile, type BaseFixture, type BaseFixtureFile } from './_harness';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTENSION_KEY = 'org.peacprotocol/rfc9421-proof@0.1';
const EXTENSION_SCHEMA_PATH = join(
  __dirname,
  '..',
  '..',
  'specs',
  'extensions',
  'rfc9421-proof',
  '0.1',
  'schema.json'
);

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

interface Rfc9421Fixture extends BaseFixture {
  type: 'InteractionEvidenceV01';
}

type Rfc9421FixtureFile = BaseFixtureFile<Rfc9421Fixture>;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function loadExtensionSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(EXTENSION_SCHEMA_PATH, 'utf-8'));
}

function createExtensionValidator() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const schema = loadExtensionSchema();
  return ajv.compile(schema);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RFC 9421 Proof Capture Extension Conformance', () => {
  let fixtures: Rfc9421FixtureFile;
  let validateExtension: ReturnType<typeof createExtensionValidator>;

  beforeAll(() => {
    fixtures = loadFixtureFile<Rfc9421Fixture>('interaction', 'rfc9421-proof.json');
    validateExtension = createExtensionValidator();
  });

  it('has fixtures to test', () => {
    expect(fixtures.fixtures.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Layer 1: InteractionEvidenceV01 validation (Zod)
  // -------------------------------------------------------------------------

  describe('InteractionEvidenceV01 Schema (Zod)', () => {
    it('all fixtures pass Zod schema validation', () => {
      for (const fixture of fixtures.fixtures) {
        const result = InteractionEvidenceV01Schema.safeParse(fixture.input);
        expect(
          result.success,
          `${fixture.name} should pass InteractionEvidenceV01Schema but got: ${
            !result.success ? result.error.message : ''
          }`
        ).toBe(true);
      }
    });

    it('all fixtures pass ordered validation', () => {
      for (const fixture of fixtures.fixtures) {
        const result = validateInteractionOrdered(fixture.input);
        expect(
          result.valid,
          `${fixture.name} should pass ordered validation but got: ${(result.errors || []).map((e) => e.code).join(', ')}`
        ).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Layer 2: Extension JSON Schema validation (Ajv)
  // -------------------------------------------------------------------------

  describe('Extension Schema (Ajv)', () => {
    it('extension schema file exists and is valid JSON Schema', () => {
      const schema = loadExtensionSchema();
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('result');
      expect(schema.required).toContain('reason');
      expect(schema.required).toContain('covered_components');
    });

    it('all fixtures have the extension key', () => {
      for (const fixture of fixtures.fixtures) {
        const input = fixture.input as Record<string, unknown>;
        const extensions = input.extensions as Record<string, unknown> | undefined;
        expect(extensions, `${fixture.name} missing extensions block`).toBeDefined();
        expect(
          extensions![EXTENSION_KEY],
          `${fixture.name} missing ${EXTENSION_KEY} extension`
        ).toBeDefined();
      }
    });

    it('all extension payloads pass extension schema validation', () => {
      for (const fixture of fixtures.fixtures) {
        const input = fixture.input as Record<string, unknown>;
        const extensions = input.extensions as Record<string, unknown>;
        const proof = extensions[EXTENSION_KEY];

        const valid = validateExtension(proof);
        expect(
          valid,
          `${fixture.name} extension payload failed schema validation: ${JSON.stringify(validateExtension.errors)}`
        ).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Layer 3: Semantic invariants from the profile spec
  // -------------------------------------------------------------------------

  describe('Profile Semantic Invariants', () => {
    it('all fixtures have kind: "http.request"', () => {
      for (const fixture of fixtures.fixtures) {
        const input = fixture.input as Record<string, unknown>;
        expect(input.kind, `${fixture.name} should have kind http.request`).toBe('http.request');
      }
    });

    it('result-reason invariants are satisfied', () => {
      for (const fixture of fixtures.fixtures) {
        const input = fixture.input as Record<string, unknown>;
        const extensions = input.extensions as Record<string, unknown>;
        const proof = extensions[EXTENSION_KEY] as Record<string, unknown>;

        const result = proof.result as string;
        const reason = proof.reason as string;

        if (result === 'verified') {
          expect(reason, `${fixture.name}: verified must use sig_valid`).toBe('sig_valid');
        } else if (result === 'failed') {
          expect(
            ['sig_expired', 'sig_future', 'sig_alg_unsupported', 'sig_base_mismatch'],
            `${fixture.name}: failed must use a failure reason`
          ).toContain(reason);
        } else if (result === 'unavailable') {
          expect(reason, `${fixture.name}: unavailable must use sig_key_not_found`).toBe(
            'sig_key_not_found'
          );
        }
      }
    });

    it('covered_components contains only names, not values', () => {
      for (const fixture of fixtures.fixtures) {
        const input = fixture.input as Record<string, unknown>;
        const extensions = input.extensions as Record<string, unknown>;
        const proof = extensions[EXTENSION_KEY] as Record<string, unknown>;
        const components = proof.covered_components as string[];

        for (const component of components) {
          // Component identifiers are short names like @method, content-digest
          // NOT full header values like "POST" or "sha-256=:abc...:="
          expect(
            component.length,
            `${fixture.name}: component "${component}" looks like a value, not a name`
          ).toBeLessThan(64);
          // Should not contain spaces (header values often do)
          expect(component, `${fixture.name}: component should not contain spaces`).not.toMatch(
            /\s/
          );
        }
      }
    });

    it('canonical_base_sha256 is valid hex when present', () => {
      for (const fixture of fixtures.fixtures) {
        const input = fixture.input as Record<string, unknown>;
        const extensions = input.extensions as Record<string, unknown>;
        const proof = extensions[EXTENSION_KEY] as Record<string, unknown>;

        if (proof.canonical_base_sha256) {
          expect(proof.canonical_base_sha256, `${fixture.name}: invalid sha256 hex`).toMatch(
            /^[0-9a-f]{64}$/
          );
        }
      }
    });
  });
});
