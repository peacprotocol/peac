#!/usr/bin/env node
/**
 * Emit pending conformance ID registration report.
 *
 * Reads the PENDING_REGISTRATION set from check-matrix.mjs source,
 * cross-references with requirement-ids.json registry, and produces
 * a deterministic reconciliation artifact.
 *
 * Usage: node scripts/conformance/emit-pending-registration.mjs
 * Output: JSON to stdout (pipe to file if needed)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Extract PENDING_REGISTRATION from check-matrix.mjs source
const checkMatrixSrc = readFileSync(join(__dirname, 'check-matrix.mjs'), 'utf-8');
const match = checkMatrixSrc.match(/PENDING_REGISTRATION\s*=\s*new\s+Set\(\[([^\]]+)\]/s);
if (!match) {
  console.error('ERROR: Could not extract PENDING_REGISTRATION from check-matrix.mjs');
  process.exit(1);
}

const pendingIds = match[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));

// Read current registry
const registry = JSON.parse(
  readFileSync(join(ROOT, 'specs/conformance/requirement-ids.json'), 'utf-8')
);
let registeredCount = 0;
for (const section of registry.sections) {
  registeredCount += section.requirements.length;
}

// Group by namespace
const byNamespace = {};
for (const id of pendingIds) {
  const ns = id.replace(/-\d+$/, '');
  if (!byNamespace[ns]) byNamespace[ns] = [];
  byNamespace[ns].push(id);
}

const report = {
  description:
    'Deterministic reconciliation of pending conformance ID registration. Generated from check-matrix.mjs PENDING_REGISTRATION set.',
  generated_at: new Date().toISOString(),
  current_registered: registeredCount,
  pending_count: pendingIds.length,
  target_post_registration: registeredCount + pendingIds.length,
  namespaces: {},
};

for (const [ns, ids] of Object.entries(byNamespace).sort(([a], [b]) => a.localeCompare(b))) {
  report.namespaces[ns] = {
    count: ids.length,
    ids: ids.sort(),
  };
}

console.log(JSON.stringify(report, null, 2));
