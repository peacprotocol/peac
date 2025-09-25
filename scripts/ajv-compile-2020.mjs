#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemasDir = path.join(root, 'schemas');

const argvAll = process.argv.includes('--all');
const targets = argvAll
  ? fs.readdirSync(schemasDir, { recursive: true })
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(schemasDir, f))
  : process.argv.slice(2).map(p => path.resolve(root, p));

let failed = 0;
for (const schemaPath of targets) {
  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    ajv.compile(schema);
    console.log(`✅ Valid schema: ${path.relative(root, schemaPath)}`);
  } catch (e) {
    failed++;
    console.error(`❌ Invalid schema: ${path.relative(root, schemaPath)}\n`, e.message || e);
  }
}
if (failed) process.exit(1);