#!/usr/bin/env node
/**
 * Generate fixture inventory from conformance fixture files.
 * Walks specs/conformance/fixtures/ and produces inventory.json.
 *
 * Usage:
 *   node scripts/conformance/generate-inventory.mjs          # generate
 *   node scripts/conformance/generate-inventory.mjs --check  # compare and fail if stale
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRequirementId } from './core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURES_DIR = join(ROOT, 'specs/conformance/fixtures');
const INVENTORY_PATH = join(FIXTURES_DIR, 'inventory.json');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

const checkMode = process.argv.includes('--check');

function walkDir(dir, base) {
  const entries = [];
  for (const item of readdirSync(dir).sort()) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      entries.push(...walkDir(fullPath, base));
    } else if (item.endsWith('.json') && item !== 'manifest.json' && item !== 'inventory.json' && !item.endsWith('.schema.json')) {
      entries.push(fullPath);
    }
  }
  return entries;
}

const fixtureFiles = walkDir(FIXTURES_DIR, FIXTURES_DIR);
const inventoryEntries = [];

for (const filePath of fixtureFiles) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    const relPath = relative(FIXTURES_DIR, filePath);
    const parts = relPath.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    const file = parts[parts.length - 1];

    const fixtures = data.fixtures || data.test_cases || [];
    for (const f of fixtures) {
      const name = f.name || f.id || 'unnamed';
      const entry = {
        directory: dir,
        file,
        fixture_name: name,
      };
      if (f.description) entry.description = f.description;
      if (f.primary_requirement_id) {
        entry.primary_requirement_id = f.primary_requirement_id;
        entry.requirement_ids = f.requirement_ids || [f.primary_requirement_id];
        entry.status = f.status || 'positive';
        entry.has_requirements = true;
      } else {
        entry.has_requirements = false;
      }
      inventoryEntries.push(entry);
    }
  } catch {
    // Skip non-fixture JSON files
  }
}

// Sort by (directory, file, fixture_name)
inventoryEntries.sort((a, b) => {
  const da = `${a.directory}/${a.file}/${a.fixture_name}`;
  const db = `${b.directory}/${b.file}/${b.fixture_name}`;
  return da.localeCompare(db);
});

const withReqs = inventoryEntries.filter((e) => e.has_requirements).length;

// Namespace-scoped counters for traceability
const namespaceCounts = { wire02: 0, carrier: 0, other: 0 };
for (const entry of inventoryEntries) {
  if (!entry.has_requirements) continue;
  for (const id of entry.requirement_ids) {
    const parsed = parseRequirementId(id);
    if (!parsed) continue;
    if (parsed.namespace === 'WIRE02') namespaceCounts.wire02++;
    else if (parsed.namespace === 'CARRIER') namespaceCounts.carrier++;
    else namespaceCounts.other++;
  }
}

const inventory = {
  $schema: 'https://www.peacprotocol.org/schemas/conformance/inventory.schema.json',
  generated_at: new Date().toISOString(),
  version: PKG.version,
  total_fixtures: inventoryEntries.length,
  total_with_requirements: withReqs,
  wire02_requirement_links: namespaceCounts.wire02,
  carrier_requirement_links: namespaceCounts.carrier,
  entries: inventoryEntries,
};

const output = JSON.stringify(inventory, null, 2) + '\n';

if (checkMode) {
  if (!existsSync(INVENTORY_PATH)) {
    console.error('FAIL: inventory.json does not exist. Run without --check to generate.');
    process.exit(1);
  }
  const existing = readFileSync(INVENTORY_PATH, 'utf-8');
  // Compare without generated_at (timestamp differs each run)
  const normalize = (s) => JSON.parse(s);
  const existingData = normalize(existing);
  const newData = normalize(output);
  // Zero out timestamps for comparison
  existingData.generated_at = '';
  newData.generated_at = '';
  if (JSON.stringify(existingData) !== JSON.stringify(newData)) {
    console.error('FAIL: inventory.json is stale. Run: node scripts/conformance/generate-inventory.mjs');
    console.error(`  Current: ${existingData.total_fixtures} fixtures, ${existingData.total_with_requirements} with requirements`);
    console.error(`  Generated: ${newData.total_fixtures} fixtures, ${newData.total_with_requirements} with requirements`);
    process.exit(1);
  }
  console.log(`OK: inventory.json is fresh (${newData.total_fixtures} fixtures, ${newData.total_with_requirements} with requirements)`);
} else {
  writeFileSync(INVENTORY_PATH, output);
  console.log(`Inventory written: ${INVENTORY_PATH}`);
  console.log(`  Total fixtures: ${inventoryEntries.length}`);
  console.log(`  With requirements: ${withReqs}`);
  console.log(`  Without requirements: ${inventoryEntries.length - withReqs}`);
  console.log(`  WIRE02 requirement links: ${namespaceCounts.wire02}`);
  console.log(`  CARRIER requirement links: ${namespaceCounts.carrier}`);
}
