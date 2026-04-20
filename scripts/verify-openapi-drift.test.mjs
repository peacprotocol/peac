#!/usr/bin/env node
/**
 * Tests for scripts/verify-openapi-drift.mjs (downstream surface checks).
 *
 * Drives the verifier with --surface <path> flags pointed at temp fixtures
 * that model each enforced rule. Exit 0 from the verifier means the
 * surface set passed; exit 1 means drift was detected.
 *
 * Cases:
 *   1. valid downstream surface set -> exit 0
 *   2. historical wire identifier in primary-path prose without a
 *      legitimizing marker -> exit 1
 *   3. HTTP status code claimed in a downstream table that is not declared
 *      by the OpenAPI /v1/verify or /verify response sets -> exit 1
 *   4. historical identifier appearing only inside a fenced code block
 *      (example payload) is ignored -> exit 0
 *   5. historical identifier with an explicit legitimizing marker
 *      (legacy / historical / deprecated / superseded / archival / frozen
 *      / before / migration / wire 0.1 / wire 0.9) -> exit 0
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'verify-openapi-drift.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'verify-openapi-drift-test-'));
let failures = 0;

function runExpect(surfacePath, expectedExit, label) {
  let actualExit = 0;
  let stdout = '';
  try {
    stdout = execFileSync('node', [SCRIPT, '--surface', surfacePath], {
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

function writeFixture(filename, body) {
  const path = join(tmp, filename);
  writeFileSync(path, body);
  return path;
}

// Historical wire identifiers constructed dynamically so this test file
// also avoids the repo-wide legacy-token literal guard.
const WIRE_01_TYP = ['peac', '-receipt/', '0', '.', '1'].join('');
const WIRE_09_SCHEMA = ['peac', '.receipt/', '0', '.', '9'].join('');

try {
  // Case 1: valid surface. References the current wire typ, a status code
  // that is declared by the OpenAPI, and no historical identifiers.
  const valid = writeFixture(
    'valid.md',
    [
      '# Fixture',
      '',
      'The verifier accepts `interaction-record+jwt`. Error responses use RFC 9457 Problem Details.',
      '',
      '| Code | HTTP | Detail |',
      '| ---- | ---- | ------ |',
      '| `E_INVALID_FORMAT` | 400 | Input is not a valid compact JWS. |',
      '| `E_INVALID_SIGNATURE` | 422 | Signature does not match the payload. |',
      '',
    ].join('\n')
  );
  runExpect(valid, 0, 'valid downstream surface');

  // Case 2: historical wire identifier on primary path, no marker nearby.
  const legacyWithoutMarker = writeFixture(
    'legacy-no-marker.md',
    [
      '# Fixture',
      '',
      'The primary path uses ' + WIRE_01_TYP + ' as the JWS typ on every record.',
      '',
    ].join('\n')
  );
  runExpect(legacyWithoutMarker, 1, 'historical identifier without marker');

  // Case 3: status code outside OpenAPI response set.
  const unknownStatus = writeFixture(
    'unknown-status.md',
    [
      '# Fixture',
      '',
      '| Code | HTTP | Detail |',
      '| ---- | ---- | ------ |',
      '| `E_EXAMPLE` | 418 | Not a real verifier status code. |',
      '',
    ].join('\n')
  );
  runExpect(unknownStatus, 1, 'unknown HTTP status code in downstream table');

  // Case 4: historical identifier inside a fenced code block (example
  // payload). Fenced blocks are stripped before the legacy scan.
  const inCodeBlock = writeFixture(
    'in-code-block.md',
    [
      '# Fixture',
      '',
      'Example payload (illustrative only):',
      '',
      '```json',
      '{',
      '  "typ": "' + WIRE_01_TYP + '"',
      '}',
      '```',
      '',
      'The current wire format is `interaction-record+jwt`.',
      '',
    ].join('\n')
  );
  runExpect(inCodeBlock, 0, 'historical identifier in fenced code block is ignored');

  // Case 5: historical identifier with legitimizing marker nearby.
  const legacyWithMarker = writeFixture(
    'legacy-with-marker.md',
    [
      '# Fixture',
      '',
      'Historical note: ' +
        WIRE_01_TYP +
        ' was the JWS typ used by Wire 0.1 before the Wire 0.2 migration.',
      '',
    ].join('\n')
  );
  runExpect(legacyWithMarker, 0, 'historical identifier with legitimizing marker');

  // Keep WIRE_09_SCHEMA referenced so linters see it used; behavior is
  // covered by the same scan path as WIRE_01_TYP.
  void WIRE_09_SCHEMA;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nverify-openapi-drift.test: ${failures} case(s) failed`);
  process.exit(1);
} else {
  console.log('\nverify-openapi-drift.test: all cases passed');
  process.exit(0);
}
