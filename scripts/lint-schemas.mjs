#!/usr/bin/env node
/**
 * Schema Linting Script
 *
 * Validates all JSON Schema files in specs/wire/ against the JSON Schema meta-schema.
 * This ensures our schemas are valid JSON Schema 2020-12 documents.
 *
 * Usage: node scripts/lint-schemas.mjs
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = join(__dirname, '..', 'specs', 'wire');

// Initialize Ajv with 2020-12 draft support
const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  verbose: true,
  loadSchema: async (uri) => {
    // Handle relative $ref within specs/wire
    if (uri.startsWith('https://www.peacprotocol.org/schemas/wire/0.1/')) {
      const filename = uri.replace('https://www.peacprotocol.org/schemas/wire/0.1/', '');
      const filepath = join(SPECS_DIR, filename);
      try {
        return JSON.parse(readFileSync(filepath, 'utf8'));
      } catch {
        throw new Error(`Cannot load schema: ${uri}`);
      }
    }
    throw new Error(`Cannot load external schema: ${uri}`);
  },
});
addFormats(ajv);

/**
 * Load all schemas first for $ref resolution
 */
function loadAllSchemas() {
  const files = readdirSync(SPECS_DIR).filter((f) => f.endsWith('.schema.json'));
  const schemas = {};

  for (const file of files) {
    const filepath = join(SPECS_DIR, file);
    const content = readFileSync(filepath, 'utf8');
    const schema = JSON.parse(content);
    schemas[file] = schema;

    // Add schema to Ajv for $ref resolution
    if (schema.$id) {
      try {
        ajv.addSchema(schema);
      } catch (_e) {
        // Schema might already be added, ignore
      }
    }
  }

  return { files, schemas };
}

/**
 * Load and validate all schemas in the specs/wire directory
 */
function lintSchemas() {
  console.log('=== PEAC Schema Linting ===\n');

  const { files, schemas } = loadAllSchemas();

  if (files.length === 0) {
    console.error('ERROR: No schema files found in', SPECS_DIR);
    process.exit(1);
  }

  console.log(`Found ${files.length} schema files:\n`);

  let passed = 0;
  let failed = 0;
  const errors = [];

  for (const file of files) {
    try {
      const schema = schemas[file];

      // Check required fields
      if (!schema.$schema) {
        throw new Error('Missing $schema declaration');
      }

      if (!schema.$id) {
        throw new Error('Missing $id declaration');
      }

      // Check $schema is draft 2020-12
      if (!schema.$schema.includes('2020-12')) {
        throw new Error(`$schema must be draft 2020-12, got: ${schema.$schema}`);
      }

      // Check $id format
      const expectedIdPrefix = 'https://www.peacprotocol.org/schemas/wire/0.1/';
      if (!schema.$id.startsWith(expectedIdPrefix)) {
        throw new Error(`$id must start with ${expectedIdPrefix}, got: ${schema.$id}`);
      }

      // Try to compile the schema (validates against meta-schema)
      // This also validates that $refs resolve correctly
      ajv.compile(schema);

      console.log(`  [PASS] ${file}`);
      passed++;
    } catch (err) {
      console.log(`  [FAIL] ${file}`);
      console.log(`         ${err.message}`);
      errors.push({ file, error: err.message });
      failed++;
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n=== Errors ===');
    for (const { file, error } of errors) {
      console.log(`\n${file}:`);
      console.log(`  ${error}`);
    }
    process.exit(1);
  }

  console.log('\nAll schemas valid!\n');
}

lintSchemas();
