/**
 * Schema Conformance Tests
 *
 * Tests that JSON fixtures match the JSON Schema (specs/wire/*.schema.json).
 * Uses Ajv for JSON Schema draft 2020-12 validation.
 *
 * Fixtures are pure receipts with no metadata. Test metadata lives in manifest.json.
 *
 * Conformance layers:
 * - Schema: JSON structure, types, required fields (this file)
 * - Protocol: Signatures, semantics, runtime invariants (protocol.spec.ts)
 */

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SPECS_DIR = join(__dirname, '..', '..', 'specs', 'wire');
const FIXTURES_DIR = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures');

// Initialize Ajv with 2020-12 draft support
const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  verbose: true,
});
addFormats(ajv);

// Manifest types
interface ManifestEntry {
  description: string;
  expected_keyword?: string;
  expected_path?: string;
  expected_valid?: boolean;
  note?: string;
}

interface Manifest {
  valid: Record<string, ManifestEntry>;
  invalid: Record<string, ManifestEntry>;
  edge: Record<string, ManifestEntry>;
}

// Load manifest
function loadManifest(): Manifest {
  const content = readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf8');
  return JSON.parse(content) as Manifest;
}

// Load all schemas for $ref resolution
function loadSchemas() {
  const files = readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith('.schema.json'))
    .sort();

  for (const file of files) {
    const filepath = join(SPECS_DIR, file);
    const schema = JSON.parse(readFileSync(filepath, 'utf8'));
    if (schema.$id) {
      try {
        ajv.addSchema(schema);
      } catch {
        // Schema might already be added
      }
    }
  }
}

// Load fixture (now pure receipt, no metadata to strip)
function loadFixture(filepath: string): unknown {
  return JSON.parse(readFileSync(filepath, 'utf8'));
}

describe('Schema Conformance', () => {
  let validate: ReturnType<typeof ajv.compile>;
  let manifest: Manifest;

  beforeAll(() => {
    loadSchemas();
    manifest = loadManifest();

    // Get the compiled validator for the root schema
    const rootSchemaId =
      'https://www.peacprotocol.org/schemas/wire/0.1/peac-receipt.0.1.schema.json';
    validate = ajv.getSchema(rootSchemaId)!;

    if (!validate) {
      throw new Error(`Root schema not found: ${rootSchemaId}`);
    }
  });

  describe('Valid Fixtures', () => {
    const validDir = join(FIXTURES_DIR, 'valid');
    const files = readdirSync(validDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const file of files) {
      it(`should accept ${file}`, () => {
        const filepath = join(validDir, file);
        const data = loadFixture(filepath);

        const valid = validate(data);

        if (!valid) {
          console.error('Validation errors:', JSON.stringify(validate.errors, null, 2));
        }

        expect(valid).toBe(true);
      });
    }
  });

  describe('Invalid Fixtures', () => {
    const invalidDir = join(FIXTURES_DIR, 'invalid');
    const files = readdirSync(invalidDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const file of files) {
      it(`should reject ${file}`, () => {
        const filepath = join(invalidDir, file);
        const data = loadFixture(filepath);
        const meta = manifest.invalid[file];

        const valid = validate(data);

        expect(valid).toBe(false);
        expect(validate.errors).toBeDefined();
        expect(validate.errors!.length).toBeGreaterThan(0);

        // Check that the error matches the expected keyword from manifest
        if (meta?.expected_keyword) {
          const keywords = validate.errors!.map((e) => e.keyword);
          expect(keywords).toContain(meta.expected_keyword);
        }
      });
    }
  });

  describe('Edge Cases', () => {
    const edgeDir = join(FIXTURES_DIR, 'edge');
    const files = readdirSync(edgeDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    for (const file of files) {
      it(`should handle edge case: ${file}`, () => {
        const filepath = join(edgeDir, file);
        const data = loadFixture(filepath);
        const meta = manifest.edge[file];

        const valid = validate(data);

        // Use manifest's expected_valid if specified
        if (meta?.expected_valid !== undefined) {
          expect(valid).toBe(meta.expected_valid);
        }

        if (valid) {
          expect(validate.errors).toBeNull();
        } else {
          expect(validate.errors).toBeDefined();
        }
      });
    }
  });
});
