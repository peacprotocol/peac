#!/usr/bin/env node
/**
 * Tests for scripts/verify-compliance-mappings.mjs.
 *
 * Drives the verifier with --mapping <path> flags pointed at temp fixtures
 * that model each enforced rule. Exit code 0 from the verifier means the
 * fixture passed all checks; exit code 1 means violations were found.
 *
 * Cases:
 *   1. valid fixture -> exit 0
 *   2. broken Artifact-surface link -> exit 1
 *   3. broken Cross-reference link -> exit 1
 *   4. missing stable outward-facing surface -> exit 1
 *   5. missing Verification hint -> exit 1
 *   6. banned claim phrase in body text -> exit 1
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'verify-compliance-mappings.mjs');
const REPO_ROOT = resolve(__dirname, '..');

const tmp = mkdtempSync(join(tmpdir(), 'verify-compliance-mappings-test-'));
let failures = 0;

function runExpect(mappingPath, expectedExit, label) {
  let actualExit = 0;
  let stdout = '';
  try {
    stdout = execFileSync('node', [SCRIPT, '--mapping', mappingPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
  } catch (err) {
    actualExit = err.status ?? -1;
    stdout = ((err.stdout || '') + (err.stderr || '')).toString();
  }
  if (actualExit !== expectedExit) {
    failures += 1;
    console.error(`FAIL [${label}]: expected exit ${expectedExit}, got ${actualExit}`);
    if (stdout) console.error(stdout.split('\n').map((l) => '  ' + l).join('\n'));
  } else {
    console.log(`PASS [${label}]: exit ${actualExit}`);
  }
}

/**
 * Build a mapping-doc fixture with N column headers + N-column data rows.
 * Writes to `tmp/<filename>` and returns the path.
 *
 * Target columns (ISO-style 7-column layout):
 *   Clause | PEAC primitive | Artifact surface | Verification hint |
 *   Coverage qualifier | Non-claim | Cross-reference
 */
function writeFixture(filename, options) {
  const {
    artifactCell,
    hintCell,
    qualifier = 'supports',
    nonClaim = 'operator-owned. PEAC publishes its own surfaces; the operator owns the AIMS change-control process.',
    crossRefCell = 'ISO 42001 Clause 7.5',
    extraPreamble = '',
    extraBody = '',
  } = options;

  // All artifact links inside fixtures resolve relative to <tmp>/<filename>'s
  // directory. We write links as `./<rel>` to real repo files, using the
  // absolute repo root path as the base for an explicit relative form. For
  // simplicity we use absolute paths to a known-good repo file when we want
  // the link to resolve, and to /no-such-file when we want it broken.
  const header = [
    '# Fixture mapping',
    '',
    'Fixture content for compliance-mapping verifier tests.',
    extraPreamble,
    '',
    '## Mapping',
    '',
    '| Clause | PEAC primitive | Artifact surface | Verification hint | Coverage qualifier | Non-claim | Cross-reference |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| 8.1 Op planning | Portable signed record | ${artifactCell} | ${hintCell} | ${qualifier} | ${nonClaim} | ${crossRefCell} |`,
    '',
    extraBody,
    '',
  ].join('\n');

  const path = join(tmp, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFixture._lastPath = path;
  writeFileSync(path, header);
  return path;
}

// Resolve repo-relative links via absolute paths so the verifier's
// resolveRepoPath(docPath, link) produces a real path that exists or not.
// We embed an absolute path into the markdown link target (the verifier
// accepts any non-http scheme and resolves via path.resolve).
const REAL_ABS = resolve(REPO_ROOT, 'docs/SLO.md');
const REAL_ABS_STABLE = resolve(REPO_ROOT, 'docs/STABILITY-CONTRACT.md');
const MISSING_ABS = resolve(tmp, 'no-such-file-ever.md');
// A real repo path that is under packages/adapters/core (an internal src
// surface). Used to test the stable-surface rule: a row with only this as
// its artifact link must fail.
const REAL_ABS_INTERNAL = resolve(REPO_ROOT, 'packages/adapters/core/src/finality.ts');

try {
  // Case 1: valid fixture (exit 0).
  const ok = writeFixture('valid.md', {
    artifactCell: `[\`docs/SLO.md\`](${REAL_ABS})`,
    hintCell: `Inspect [\`docs/SLO.md\`](${REAL_ABS}) and reproduce baseline measurements.`,
    crossRefCell: `[stability](${REAL_ABS_STABLE})`,
  });
  runExpect(ok, 0, 'valid fixture');

  // Case 2: broken artifact-surface link (exit 1).
  const brokenArtifact = writeFixture('broken-artifact.md', {
    artifactCell: `[\`docs/ghost.md\`](${MISSING_ABS})`,
    hintCell: `Inspect the file at [\`docs/ghost.md\`](${MISSING_ABS}).`,
    crossRefCell: `[stability](${REAL_ABS_STABLE})`,
  });
  runExpect(brokenArtifact, 1, 'broken artifact-surface link');

  // Case 3: broken cross-reference link (exit 1).
  const brokenXref = writeFixture('broken-xref.md', {
    artifactCell: `[\`docs/SLO.md\`](${REAL_ABS})`,
    hintCell: `Inspect [\`docs/SLO.md\`](${REAL_ABS}).`,
    crossRefCell: `[ghost](${MISSING_ABS})`,
  });
  runExpect(brokenXref, 1, 'broken cross-reference link');

  // Case 4: missing stable outward-facing surface (exit 1).
  // Only an internal src/ link is provided; no docs/, specs/, contracts/,
  // surfaces/, packages/schema/openapi/, REPO_SURFACE_STATUS.json, or
  // CHANGELOG.md link is present.
  const noStable = writeFixture('no-stable.md', {
    artifactCell: `[\`finality.ts\`](${REAL_ABS_INTERNAL})`,
    hintCell: `Run the finality tests under packages/adapters/core.`,
    crossRefCell: `[stability](${REAL_ABS_STABLE})`,
  });
  runExpect(noStable, 1, 'missing stable outward-facing surface');

  // Case 5: missing verification hint (exit 1).
  const noHint = writeFixture('no-hint.md', {
    artifactCell: `[\`docs/SLO.md\`](${REAL_ABS})`,
    hintCell: '-',
    crossRefCell: `[stability](${REAL_ABS_STABLE})`,
  });
  runExpect(noHint, 1, 'missing verification hint');

  // Case 6: banned claim phrase in body text (exit 1).
  const bannedClaim = writeFixture('banned-claim.md', {
    artifactCell: `[\`docs/SLO.md\`](${REAL_ABS})`,
    hintCell: `Inspect [\`docs/SLO.md\`](${REAL_ABS}).`,
    crossRefCell: `[stability](${REAL_ABS_STABLE})`,
    extraPreamble: 'This project is fully compliant with every requirement.',
  });
  runExpect(bannedClaim, 1, 'banned claim phrase in body');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nverify-compliance-mappings.test: ${failures} case(s) failed`);
  process.exit(1);
} else {
  console.log('\nverify-compliance-mappings.test: all cases passed');
  process.exit(0);
}
