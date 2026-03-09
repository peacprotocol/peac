#!/usr/bin/env node
/**
 * validate-fixtures.mjs
 *
 * Validates conformance fixture integrity:
 * - Every fixture-pack file (with a `version` field) MUST have `schema_version`
 * - `schema_version` MUST match the `version` field
 * - Manifest MUST have `manifest_version: "2.0"`
 * - Cross-checks manifest entries against fixture files on disk
 *
 * Run: node scripts/validate-fixtures.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'specs', 'conformance', 'fixtures');
let errors = 0;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  errors++;
}

function ok(msg) {
  console.log(`  OK: ${msg}`);
}

// Recursively find all .json files (excluding node_modules, bundle/vectors)
function findJsonFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip bundle vectors (auto-generated) and node_modules
      if (entry.name === 'vectors' || entry.name === 'node_modules') continue;
      results.push(...findJsonFiles(fullPath));
    } else if (
      entry.name.endsWith('.json') &&
      entry.name !== 'manifest.json' &&
      entry.name !== 'inventory.json' &&
      !entry.name.endsWith('.schema.json')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('=== Fixture Validation ===\n');

// 1. Check manifest version
console.log('Checking manifest...');
const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf-8'));
if (manifest.manifest_version === '2.0') {
  ok('manifest_version is "2.0"');
} else {
  fail(`manifest_version is "${manifest.manifest_version}" (expected "2.0")`);
}

// 2. Validate fixture-pack files have schema_version
console.log('\nChecking fixture-pack files...');
const allFiles = findJsonFiles(FIXTURES_DIR);
let fixturePackCount = 0;
let validatedCount = 0;

for (const file of allFiles) {
  const relPath = relative(FIXTURES_DIR, file);
  try {
    const content = JSON.parse(readFileSync(file, 'utf-8'));

    // Only validate files that have a `version` field (fixture-pack files)
    if (content.version) {
      fixturePackCount++;

      if (!content.schema_version) {
        fail(`${relPath}: missing schema_version (has version: "${content.version}")`);
      } else if (content.schema_version !== content.version) {
        fail(
          `${relPath}: schema_version "${content.schema_version}" !== version "${content.version}"`
        );
      } else {
        validatedCount++;
      }
    }
  } catch (e) {
    fail(`${relPath}: invalid JSON - ${e.message}`);
  }
}

ok(`${validatedCount}/${fixturePackCount} fixture-pack files have valid schema_version`);

// 3. Cross-check manifest entries against disk
console.log('\nCross-checking manifest entries...');
const MANIFEST_CATEGORIES = Object.keys(manifest).filter(
  (k) => !k.startsWith('$') && k !== 'manifest_version'
);

let manifestFiles = 0;
let onDisk = 0;

for (const category of MANIFEST_CATEGORIES) {
  const entries = manifest[category];
  for (const filename of Object.keys(entries)) {
    manifestFiles++;
    const filePath = join(FIXTURES_DIR, category, filename);
    try {
      statSync(filePath);
      onDisk++;
    } catch {
      fail(`${category}/${filename}: listed in manifest but not found on disk`);
    }
  }
}

ok(`${onDisk}/${manifestFiles} manifest entries found on disk`);

// 4. Reverse check: fixture-pack files on disk must appear in the manifest
console.log('\nReverse-checking disk files against manifest...');

// Build a set of category/filename from manifest for fast lookup
const manifestSet = new Set();
for (const category of MANIFEST_CATEGORIES) {
  const entries = manifest[category];
  for (const filename of Object.keys(entries)) {
    manifestSet.add(`${category}/${filename}`);
  }
}

let diskFixturePacks = 0;
let inManifest = 0;

for (const file of allFiles) {
  const relPath = relative(FIXTURES_DIR, file);
  try {
    const content = JSON.parse(readFileSync(file, 'utf-8'));
    // Only check fixture-pack files (those with a `version` field)
    if (!content.version) continue;
    diskFixturePacks++;

    if (manifestSet.has(relPath)) {
      inManifest++;
    } else {
      fail(`${relPath}: fixture-pack on disk but missing from manifest`);
    }
  } catch {
    // Already reported in section 2
  }
}

ok(`${inManifest}/${diskFixturePacks} disk fixture-packs found in manifest`);

// Summary
console.log('\n=== Summary ===');
console.log(`Total fixture files: ${allFiles.length}`);
console.log(`Fixture-pack files: ${fixturePackCount}`);
console.log(`Validated: ${validatedCount}`);
console.log(`Errors: ${errors}`);

if (errors > 0) {
  console.log('\nFAIL: Fixture validation failed');
  process.exit(1);
} else {
  console.log('\nPASS: All fixture checks passed');
}
