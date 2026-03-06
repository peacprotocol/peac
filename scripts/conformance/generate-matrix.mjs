#!/usr/bin/env node
/**
 * Generate CONFORMANCE-MATRIX.md from three canonical sources:
 * - specs/conformance/requirement-ids.json (registry)
 * - specs/conformance/fixtures/inventory.json (fixtures)
 * - specs/conformance/test-mappings.json (protocol-level tests)
 *
 * Uses shared core for coverage classification (single-sourced with check-matrix).
 *
 * Usage:
 *   node scripts/conformance/generate-matrix.mjs          # generate
 *   node scripts/conformance/generate-matrix.mjs --check  # compare and fail if stale
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CoverageStatus,
  COVERAGE_LABELS,
  classifyCoverage,
  buildCoveredIds,
  dedupeSort,
} from './core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const registryPath = join(ROOT, 'specs/conformance/requirement-ids.json');
const inventoryPath = join(ROOT, 'specs/conformance/fixtures/inventory.json');
const mappingsPath = join(ROOT, 'specs/conformance/test-mappings.json');
const outputPath = join(ROOT, 'docs/specs/CONFORMANCE-MATRIX.md');

const checkMode = process.argv.includes('--check');

const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf-8'));
const testMappings = JSON.parse(readFileSync(mappingsPath, 'utf-8'));

// Build covered IDs using shared core (single source of truth)
const coveredIds = buildCoveredIds(inventory, testMappings);

// Build fixture detail map: reqId -> { files, statuses } (for matrix display columns)
const fixtureCoverage = new Map();
for (const entry of inventory.entries) {
  if (!entry.requirement_ids) continue;
  for (const id of entry.requirement_ids) {
    if (!fixtureCoverage.has(id)) {
      fixtureCoverage.set(id, { files: new Set(), statuses: new Set() });
    }
    fixtureCoverage.get(id).files.add(`${entry.directory}/${entry.file}`);
    if (entry.status) fixtureCoverage.get(id).statuses.add(entry.status);
  }
}

// Build test mapping detail: reqId -> test files (for matrix display columns)
const testCoverage = new Map();
for (const m of testMappings.mappings) {
  if (!testCoverage.has(m.requirement_id)) {
    testCoverage.set(m.requirement_id, new Set());
  }
  testCoverage.get(m.requirement_id).add(m.test_file);
}

function getFixtureFiles(reqId) {
  const cov = fixtureCoverage.get(reqId);
  if (!cov) return '';
  return dedupeSort([...cov.files]).join(', ');
}

function getTestFiles(reqId) {
  const tests = testCoverage.get(reqId);
  if (!tests) return '';
  return dedupeSort([...tests]).join(', ');
}

// Generate markdown
const lines = [];
lines.push('# PEAC Conformance Matrix');
lines.push('');
lines.push('> **Generated**: Do not edit manually. Source: `node scripts/conformance/generate-matrix.mjs`');
lines.push(`> **Version**: ${registry.version}`);
lines.push('');

// Wire 0.2 section
lines.push('## Wire 0.2 Protocol Requirements');
lines.push('');
lines.push('| ID | Section | Summary | Class | Coverage | Fixture | Test | Error |');
lines.push('|----|---------|---------|-------|----------|---------|------|-------|');

// Track counts using shared enum (single-sourced with check-matrix)
const counts = Object.fromEntries(Object.values(CoverageStatus).map((s) => [s, 0]));

for (const section of registry.sections) {
  for (const req of section.requirements) {
    if (!req.id.startsWith('WIRE02-')) continue;

    const status = classifyCoverage({
      id: req.id,
      enforcement_class: req.enforcement_class,
      section_number: section.section_number,
      coveredIds,
    });
    counts[status]++;

    const fixtureFile = getFixtureFiles(req.id);
    const testFile = getTestFiles(req.id);
    const statusBadge = COVERAGE_LABELS[status];
    const errorCode = req.error_code || '';

    lines.push(
      `| ${req.id} | ${section.section_number} | ${req.summary} | ${req.enforcement_class} | ${statusBadge} | ${fixtureFile} | ${testFile} | ${errorCode} |`
    );
  }
}

lines.push('');

// Carrier section (not in registry; sourced from inventory)
lines.push('## Carrier Contract Requirements');
lines.push('');
lines.push('| ID | Summary | Class | Coverage | Fixture | Error |');
lines.push('|----|---------|-------|----------|---------|-------|');

const carrierReqs = new Map();
for (const entry of inventory.entries) {
  if (!entry.requirement_ids) continue;
  for (const id of entry.requirement_ids) {
    if (!id.startsWith('CARRIER-')) continue;
    if (!carrierReqs.has(id)) {
      carrierReqs.set(id, { files: new Set() });
    }
    carrierReqs.get(id).files.add(`${entry.directory}/${entry.file}`);
  }
}

let carrierCount = 0;
for (const [id] of [...carrierReqs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const files = dedupeSort([...carrierReqs.get(id).files]).join(', ');
  carrierCount++;
  lines.push(
    `| ${id} | Transport boundary check | hard_fail | covered | ${files} | E_CARRIER_SIZE_EXCEEDED |`
  );
}

lines.push('');

// Summary: all 5 coverage states, single-sourced from classifyCoverage()
const totalWire02 = Object.values(counts).reduce((a, b) => a + b, 0);

lines.push('## Summary');
lines.push('');
lines.push('| Metric | Count |');
lines.push('|--------|-------|');
lines.push(`| Wire 0.2 requirements | ${totalWire02} |`);
for (const [status, label] of Object.entries(COVERAGE_LABELS)) {
  lines.push(`| ${label} | ${counts[status]} |`);
}
lines.push(`| Carrier requirements | ${carrierCount} |`);
lines.push('');

const output = lines.join('\n') + '\n';

if (checkMode) {
  if (!existsSync(outputPath)) {
    console.error(
      'FAIL: CONFORMANCE-MATRIX.md does not exist. Run without --check to generate.'
    );
    process.exit(1);
  }
  const existing = readFileSync(outputPath, 'utf-8');
  if (existing !== output) {
    console.error(
      'FAIL: CONFORMANCE-MATRIX.md is stale. Run: node scripts/conformance/generate-matrix.mjs'
    );
    process.exit(1);
  }
  console.log('OK: CONFORMANCE-MATRIX.md is fresh');
} else {
  writeFileSync(outputPath, output);
  console.log(`Matrix written: ${outputPath}`);
  for (const [status, label] of Object.entries(COVERAGE_LABELS)) {
    console.log(`  ${label}: ${counts[status]}`);
  }
  console.log(`  Carrier: ${carrierCount}`);
}
