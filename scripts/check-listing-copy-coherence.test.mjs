#!/usr/bin/env node
// Negative-path tests for scripts/check-listing-copy-coherence.mjs.
// Verifies the script exits 2 when --canonical-source is supplied but the
// JSON is malformed or missing the required field.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'check-listing-copy-coherence.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'check-listing-copy-test-'));
let failures = 0;

function runExpectExit(args, expectedExit, label) {
  let actualExit = 0;
  let stderr = '';
  try {
    execFileSync('node', [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    actualExit = err.status ?? -1;
    stderr = (err.stderr || '').toString();
  }
  if (actualExit !== expectedExit) {
    failures += 1;
    console.error(`FAIL [${label}]: expected exit ${expectedExit}, got ${actualExit}`);
    if (stderr) console.error(`  stderr: ${stderr.trim()}`);
  } else {
    console.log(`PASS [${label}]: exit ${actualExit}`);
  }
}

try {
  // Case 1: --canonical-source path that does not exist -> exit 2.
  runExpectExit(['--canonical-source', join(tmp, 'no-such-file.json')], 2, 'missing file');

  // Case 2: --canonical-source pointing at non-JSON content -> exit 2.
  const badJson = join(tmp, 'bad.json');
  writeFileSync(badJson, 'not valid json {{{');
  runExpectExit(['--canonical-source', badJson], 2, 'invalid JSON');

  // Case 3: valid JSON but missing locked_strings.canonical_short_description -> exit 2.
  const missingField = join(tmp, 'missing-field.json');
  writeFileSync(missingField, JSON.stringify({ locked_strings: {} }));
  runExpectExit(
    ['--canonical-source', missingField],
    2,
    'missing locked_strings.canonical_short_description'
  );

  // Case 4: valid JSON with empty-string field -> exit 2.
  const emptyField = join(tmp, 'empty-field.json');
  writeFileSync(
    emptyField,
    JSON.stringify({ locked_strings: { canonical_short_description: '' } })
  );
  runExpectExit(['--canonical-source', emptyField], 2, 'empty field value');

  // Case 5: valid JSON with non-string field -> exit 2.
  const wrongTypeField = join(tmp, 'wrong-type-field.json');
  writeFileSync(
    wrongTypeField,
    JSON.stringify({ locked_strings: { canonical_short_description: 123 } })
  );
  runExpectExit(['--canonical-source', wrongTypeField], 2, 'non-string field value');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} negative-path test(s) failed.`);
  process.exit(1);
}
console.log('\nAll negative-path tests passed.');
process.exit(0);
