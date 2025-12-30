#!/usr/bin/env node
/**
 * Lint JSON Schema files in specs/wire/
 * Validates that all schema files are well-formed and can be compiled by Ajv.
 */

const Ajv = require('ajv/dist/2020');
const fs = require('fs');
const path = require('path');

const SPECS_DIR = path.join(__dirname, '..', 'specs', 'wire');

const ajv = new Ajv({ strict: true });

const files = fs
  .readdirSync(SPECS_DIR)
  .filter((f) => f.endsWith('.schema.json'))
  .sort();

let errors = 0;

for (const file of files) {
  const filepath = path.join(SPECS_DIR, file);
  try {
    const schema = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    if (schema.$id) {
      ajv.addSchema(schema);
      console.log('OK:', file);
    }
  } catch (err) {
    console.error('FAIL:', file, '-', err.message);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} schema(s) failed validation`);
  process.exit(1);
}

console.log(`\n${files.length} schema(s) validated successfully`);
