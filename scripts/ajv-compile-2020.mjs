#!/usr/bin/env node
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fs from 'fs';
import path from 'path';

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

const args = process.argv.slice(2);
const isAll = args.includes('--all');

let schemaFiles = [];

if (isAll) {
  // Find all .json files in schemas directory
  function findSchemas(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findSchemas(fullPath);
      } else if (entry.name.endsWith('.json')) {
        schemaFiles.push(fullPath);
      }
    }
  }
  findSchemas('schemas');
} else {
  schemaFiles = args.filter(f => f.endsWith('.json'));
}

let allValid = true;

for (const file of schemaFiles) {
  try {
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    ajv.compile(schema);
    console.log(`✅ ${file}`);
  } catch (error) {
    console.error(`❌ ${file}: ${error.message}`);
    allValid = false;
  }
}

if (allValid) {
  console.log(`\n✅ All ${schemaFiles.length} schemas valid`);
  process.exit(0);
} else {
  console.log(`\n❌ Schema validation failed`);
  process.exit(1);
}