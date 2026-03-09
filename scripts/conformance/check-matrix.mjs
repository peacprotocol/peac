#!/usr/bin/env node
/**
 * Validate conformance coverage: no orphans, no uncovered gaps.
 * Uses shared core for coverage classification (single-sourced with generate-matrix).
 *
 * Usage: node scripts/conformance/check-matrix.mjs
 * Exit 0: all requirements have coverage or explicit deferral
 * Exit 1: uncovered requirements found
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CoverageStatus,
  COVERAGE_LABELS,
  classifyCoverage,
  buildCoveredIds,
} from './core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const registry = JSON.parse(
  readFileSync(join(ROOT, 'specs/conformance/requirement-ids.json'), 'utf-8')
);
const inventory = JSON.parse(
  readFileSync(join(ROOT, 'specs/conformance/fixtures/inventory.json'), 'utf-8')
);
const testMappings = JSON.parse(
  readFileSync(join(ROOT, 'specs/conformance/test-mappings.json'), 'utf-8')
);

const coveredIds = buildCoveredIds(inventory, testMappings);

// Classify each requirement using shared core
const counts = Object.fromEntries(Object.values(CoverageStatus).map((s) => [s, 0]));
const uncoveredList = [];

for (const section of registry.sections) {
  for (const req of section.requirements) {
    const status = classifyCoverage({
      id: req.id,
      enforcement_class: req.enforcement_class,
      section_number: section.section_number,
      coveredIds,
    });
    counts[status]++;
    if (status === CoverageStatus.UNCOVERED) {
      uncoveredList.push(
        `  ${req.id} (Section ${section.section_number}, ${req.enforcement_class}): ${req.summary}`
      );
    }
  }
}

// Check for orphan requirement IDs in fixtures
const registryIds = new Set();
for (const section of registry.sections) {
  for (const req of section.requirements) {
    registryIds.add(req.id);
  }
}

const orphanIds = [];
for (const id of coveredIds) {
  if (!registryIds.has(id) && !id.startsWith('CARRIER-')) {
    orphanIds.push(id);
  }
}

// Report using shared labels
for (const [status, label] of Object.entries(COVERAGE_LABELS)) {
  console.log(`${label}: ${counts[status]}`);
}

if (orphanIds.length > 0) {
  console.error(`\nOrphan IDs (in fixtures but not in registry):`);
  for (const id of orphanIds.sort()) {
    console.error(`  ${id}`);
  }
}

if (counts[CoverageStatus.UNCOVERED] > 0) {
  console.error(
    `\nFAIL: ${counts[CoverageStatus.UNCOVERED]} requirement(s) have no coverage or explicit deferral:`
  );
  for (const line of uncoveredList) {
    console.error(line);
  }
  process.exit(1);
}

if (orphanIds.length > 0) {
  console.error(`\nFAIL: ${orphanIds.length} orphan requirement ID(s) in fixtures`);
  process.exit(1);
}

console.log(`\nOK: all requirements covered or explicitly deferred`);
