#!/usr/bin/env node
/**
 * Commerce conformance coverage gate.
 *
 * Validates that each commerce rail with a conformance fixture manifest
 * meets the minimum vector floor (10 vectors: 3 valid, 4 invalid, 2 edge,
 * 1 security).
 *
 * Rail list derived from specs/kernel/registries.json (canonical source).
 * Fixture manifests discovered from specs/conformance/fixtures/<rail>/manifest.json.
 *
 * Exit 0: all manifested rails meet the floor
 * Exit 1: coverage gap found
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURES_ROOT = join(ROOT, 'specs', 'conformance', 'fixtures');

// ---------------------------------------------------------------------------
// Coverage floor (minimum vectors per category)
// ---------------------------------------------------------------------------
const FLOOR = {
  valid: 3,
  invalid: 4,
  edge: 2,
  security: 1,
};
const FLOOR_TOTAL = Object.values(FLOOR).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Load registered commerce rails from canonical registry
// ---------------------------------------------------------------------------
const registries = JSON.parse(readFileSync(join(ROOT, 'specs/kernel/registries.json'), 'utf-8'));

// Collect rails from payment_rails and commerce-category agent_protocols
const registeredRails = new Set();

for (const rail of registries.payment_rails) {
  registeredRails.add(rail.id);
}

for (const proto of registries.agent_protocols) {
  if (proto.category === 'commerce-protocol') {
    registeredRails.add(proto.id);
  }
}

// ---------------------------------------------------------------------------
// Discover and validate manifested rails
// ---------------------------------------------------------------------------
let bad = 0;
const manifested = [];
const unmanifested = [];

for (const railId of [...registeredRails].sort()) {
  const manifestPath = join(FIXTURES_ROOT, railId, 'manifest.json');

  if (!existsSync(manifestPath)) {
    unmanifested.push(railId);
    continue;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const categories = manifest.categories || {};

  // Category alias mapping: manifest category names -> floor bucket
  const CATEGORY_ALIASES = {
    valid: 'valid',
    invalid: 'invalid',
    edge: 'edge',
    'edge-cases': 'edge',
    security: 'security',
  };

  const counts = { valid: 0, invalid: 0, edge: 0, security: 0 };
  let total = 0;
  const missing = [];

  // Count vectors from all manifest categories, mapping to floor buckets
  for (const [manifestCat, catDef] of Object.entries(categories)) {
    const vectors = catDef?.vectors || [];
    const bucket = CATEGORY_ALIASES[manifestCat];

    for (const vecFile of vectors) {
      const vecPath = join(FIXTURES_ROOT, railId, vecFile);
      if (!existsSync(vecPath)) {
        console.error(`  MISSING FILE: ${railId}/${vecFile}`);
        bad = 1;
      }
      total++;
    }

    if (bucket && counts[bucket] !== undefined) {
      counts[bucket] += vectors.length;
    }
    // Categories not in CATEGORY_ALIASES (e.g., "consistency") count
    // toward total but not toward any specific floor bucket
  }

  for (const [cat, floor] of Object.entries(FLOOR)) {
    if ((counts[cat] || 0) < floor) {
      missing.push(`${cat}: ${counts[cat] || 0}/${floor}`);
    }
  }

  // Eligibility contract:
  // - Manifests with `commerce_rail` (v0.12.5+): enforce per-category floor.
  //   These are rails with dedicated PEAC mapping packages and execution-backed
  //   conformance vectors.
  // - Legacy manifests without `commerce_rail` (e.g., x402 v0.12.3): enforce
  //   total vector count only. These predate the per-category floor and use
  //   different category naming (e.g., "edge-cases", "consistency").
  //   Planned: migrate x402 manifest to commerce_rail format in v0.12.6.
  const enforceFloor = !!manifest.commerce_rail;
  const statusLabel = enforceFloor ? '' : ' (legacy)';
  const status = enforceFloor
    ? missing.length === 0
      ? 'PASS'
      : 'FAIL'
    : total >= FLOOR_TOTAL
      ? 'PASS'
      : 'FAIL';
  if (status === 'FAIL') bad = 1;

  manifested.push({
    rail: railId,
    status,
    statusLabel,
    total,
    counts,
    missing,
    specRevision: manifest.spec_revision || null,
    intentSpecRevision: manifest.intent_spec_revision || null,
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(`Commerce Conformance Coverage Gate`);
console.log(
  `  Floor: ${FLOOR_TOTAL} vectors (${Object.entries(FLOOR)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')})`
);
console.log(`  Registered rails: ${registeredRails.size}`);
console.log(`  Manifested rails: ${manifested.length}`);
console.log(`  Unmanifested rails: ${unmanifested.length}`);
console.log('');

for (const entry of manifested) {
  const specInfo = entry.specRevision ? ` [${entry.specRevision}]` : '';
  const intentInfo = entry.intentSpecRevision ? ` [intent: ${entry.intentSpecRevision}]` : '';
  console.log(
    `  ${entry.status}${entry.statusLabel} ${entry.rail} (${entry.total} vectors)${specInfo}${intentInfo}`
  );
  if (entry.missing.length > 0) {
    for (const m of entry.missing) {
      console.error(`    below floor: ${m}`);
    }
  }
}

if (unmanifested.length > 0) {
  console.log('');
  console.log('  Unmanifested (informational, no fixture directory):');
  for (const rail of unmanifested) {
    console.log(`    - ${rail}`);
  }
}

console.log('');
if (bad === 0) {
  console.log('OK: all manifested commerce rails meet coverage floor.');
} else {
  console.error('FAIL: one or more rails below coverage floor or missing vector files.');
}

process.exit(bad);
