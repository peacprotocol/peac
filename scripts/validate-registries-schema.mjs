/**
 * Validate specs/kernel/registries.json against its JSON Schema (2020-12).
 *
 * Uses Ajv's 2020-12 module for correct draft handling. This is a CI-grade
 * validation step: it runs in guard.sh to ensure the source-of-truth file
 * conforms to its schema before codegen.
 *
 * Exit code 0 on success, 1 on failure.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv2020 from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SPEC_PATH = join(__dirname, '../specs/kernel/registries.json');
const SCHEMA_PATH = join(__dirname, '../specs/kernel/registries.schema.json');

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf-8'));
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);
const valid = validate(spec);

if (valid) {
  console.log('registries.json: JSON Schema 2020-12 validation passed.');
  process.exit(0);
} else {
  console.error('registries.json: JSON Schema 2020-12 validation FAILED:');
  for (const err of validate.errors ?? []) {
    console.error(`  ${err.instancePath || '/'}: ${err.message}`);
  }
  process.exit(1);
}
