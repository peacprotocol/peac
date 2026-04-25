#!/usr/bin/env node
/**
 * One-shot script: capture frozen snapshots from the v0.13.0 @peac/disc.parse
 * output for each parity fixture. Snapshots are then committed and consumed
 * by the post-archive parity test (Step 3 of v0.13.1 plan §5.4(vii)).
 *
 * Run BEFORE archiving packages/discovery/. After this writes the snapshots,
 * the workspace can drop @peac/disc and the parity test can replay snapshots
 * instead of importing the live old parser.
 *
 * Snapshot files are deterministic: no timestamps, no environment-derived
 * fields. The only variable content is the parser-output structure itself.
 *
 * Usage:
 *   node packages/cli/__tests__/policy-document-discovery.snapshot-capture.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, 'fixtures', 'policy-document-discovery', 'snapshots');

// Suppress deprecation warnings during capture.
const origEmit = process.emitWarning;
process.emitWarning = () => {};

// Live @peac/disc.parse (still present in the workspace at capture time).
// After archive, this script is inert (the workspace package no longer
// resolves) and snapshots are read by the post-archive parity test.
const { parse: discParse } = await import('@peac/disc');

// Fixture data: imported from the .mjs sibling so this script does not need
// TypeScript transpilation. The .ts file used by the test suite re-exports
// from this .mjs to keep one source of truth.
const { PARITY_FIXTURES } = await import(
  './fixtures/policy-document-discovery/fixtures.mjs'
);

mkdirSync(SNAPSHOTS_DIR, { recursive: true });

let captured = 0;
for (const fixture of PARITY_FIXTURES) {
  const result = discParse(fixture.text);
  const legacyWarningCount = (result.warnings ?? []).filter((w) =>
    /legacy key-discovery field/.test(w),
  ).length;
  const snapshot = {
    fixture: fixture.name,
    description: fixture.description,
    capturedFrom: '@peac/disc.parse (v0.13.0)',
    valid: result.valid,
    data: result.valid ? result.data : undefined,
    errorsCount: result.errors?.length ?? 0,
    legacyWarningCount,
  };
  writeFileSync(
    join(SNAPSHOTS_DIR, `${fixture.name}.snapshot.json`),
    JSON.stringify(snapshot, null, 2) + '\n',
    'utf8',
  );
  captured += 1;
}

process.emitWarning = origEmit;
console.log(`Captured ${captured} snapshot(s) under ${SNAPSHOTS_DIR}`);
