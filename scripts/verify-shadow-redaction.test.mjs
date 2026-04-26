#!/usr/bin/env node
/**
 * Self-test for scripts/verify-shadow-redaction.mjs.
 *
 * Two property classes:
 *
 *   1. POSITIVE: a valid shadow log carrying canonical 64-char hex
 *      hashes, integer byte lengths, ISO 8601 timestamps, and a short
 *      benign `notes` string MUST pass the gate. This is the bug
 *      class that the long-base64 secret pattern previously
 *      false-positive matched on its own hash output.
 *
 *   2. NEGATIVE: a log whose `notes` field carries a Bearer token,
 *      JWS, email, API key, or any other registered secret pattern
 *      MUST fail the gate. Each negative class is asserted
 *      independently so a regression in one class is visible.
 *
 * The test invokes the script as a child process against fixture
 * directories created in OS-temp space, mirroring how the nightly
 * lane invokes it.
 *
 * Convention: standalone Node script (matches scripts/*.test.mjs
 * sibling tests). Run via:
 *
 *   node scripts/verify-shadow-redaction.test.mjs
 *
 * Exit codes:
 *   0  every case passed
 *   1  one or more cases failed
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'verify-shadow-redaction.mjs');

const tempDirs = [];
let failures = 0;
let passes = 0;

function makeFixtureDir(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'peac-shadow-redact-fixture-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'shadow-log.json'), JSON.stringify(entries));
  return dir;
}

function runGate(scanDir) {
  const result = spawnSync(process.execPath, [SCRIPT, '--dir', scanDir], {
    encoding: 'utf8',
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passes += 1;
  } else {
    console.error(`  FAIL: ${label}`);
    if (detail) console.error(`    ${detail}`);
    failures += 1;
  }
}

function expectExit(label, scanDir, expectedCode, expectedStdMatch) {
  const r = runGate(scanDir);
  const codeOk = r.code === expectedCode;
  const stdOk = expectedStdMatch
    ? expectedStdMatch.test(expectedCode === 0 ? r.stdout : r.stderr)
    : true;
  check(
    label,
    codeOk && stdOk,
    !codeOk
      ? `expected exit ${expectedCode}, got ${r.code}; stderr: ${r.stderr.slice(0, 200)}`
      : !stdOk
        ? `expected match ${expectedStdMatch}; got: ${(expectedCode === 0 ? r.stdout : r.stderr).slice(0, 200)}`
        : ''
  );
}

console.log('verify-shadow-redaction: self-test');
console.log('==================================\n');

// -----------------------------------------------------------------------------
// Positive: canonical entries must pass
// -----------------------------------------------------------------------------
console.log('--- Positive ---');
expectExit(
  'valid log with 64-hex hashes, byte counts, ISO timestamp, benign notes passes',
  makeFixtureDir([
    {
      kind: 'output-byte-diff',
      call: 'verifyLocal',
      recordRefHash: 'a'.repeat(64),
      realResultHash: 'b'.repeat(64),
      shadowResultHash: 'c'.repeat(64),
      realByteLen: 1024,
      shadowByteLen: 1024,
      notes: 'canonical-hash-mismatch',
      timestamp: '2026-04-26T00:00:00.000Z',
    },
  ]),
  0,
  /OK/
);

expectExit(
  'error-code-diff entry with realErrorCode passes',
  makeFixtureDir([
    {
      kind: 'error-code-diff',
      call: 'issue',
      recordRefHash: 'd'.repeat(64),
      realErrorCode: 'E_INVALID_FORMAT',
      notes: 'real-errored-shadow-succeeded',
      timestamp: '2026-04-26T00:00:00.000Z',
    },
  ]),
  0
);

expectExit(
  'timing-diff entry with shadowErrorCode SHADOW_TIMEOUT passes',
  makeFixtureDir([
    {
      kind: 'timing-diff',
      call: 'verifyLocal',
      recordRefHash: 'e'.repeat(64),
      shadowErrorCode: 'SHADOW_TIMEOUT',
      notes: 'shadow threw SHADOW_TIMEOUT',
      timestamp: '2026-04-26T00:00:00.000Z',
    },
  ]),
  0
);

const emptyDir = mkdtempSync(join(tmpdir(), 'peac-shadow-redact-empty-'));
tempDirs.push(emptyDir);
expectExit('empty directory passes (nothing to scan)', emptyDir, 0);

expectExit(
  'non-existent directory passes (gate self-installs)',
  '/nonexistent/path/should/not/exist',
  0
);

// -----------------------------------------------------------------------------
// Negative: secret patterns in notes must fail
// -----------------------------------------------------------------------------
console.log('\n--- Negative: notes secret patterns ---');

function entryWithNotes(notes) {
  return {
    kind: 'shadow-error',
    call: 'verifyLocal',
    recordRefHash: '0'.repeat(64),
    notes,
    timestamp: '2026-04-26T00:00:00.000Z',
  };
}

const negatives = [
  { name: 'Bearer token in notes', notes: 'Bearer abc.def.ghi-jkl_mno.pqr-credential' },
  { name: 'compact JWS in notes', notes: 'eyJhbGciOiJFZERTQSIsInR5cCI6Imp3dCJ9.AAAA.BBBB' },
  { name: 'email in notes', notes: 'leaked@example.com' },
  { name: 'AWS access key in notes', notes: 'AKIAIOSFODNN7EXAMPLE' },
  {
    name: 'PEM block in notes',
    notes: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
  },
];

for (const neg of negatives) {
  const safeNotes = neg.notes.length > 100 ? neg.notes.slice(0, 100) : neg.notes;
  expectExit(
    `fails on ${neg.name}`,
    makeFixtureDir([entryWithNotes(safeNotes)]),
    1,
    /notes matches secret pattern/
  );
}

// -----------------------------------------------------------------------------
// Negative: forbidden raw fields
// -----------------------------------------------------------------------------
console.log('\n--- Negative: forbidden fields ---');
expectExit(
  'fails when realResult is present',
  makeFixtureDir([
    {
      kind: 'output-byte-diff',
      call: 'verifyLocal',
      recordRefHash: '0'.repeat(64),
      realResult: { accepted: true },
      notes: 'has-raw-realResult',
      timestamp: '2026-04-26T00:00:00.000Z',
    },
  ]),
  1,
  /forbidden raw field present: realResult/
);

expectExit(
  'fails when shadowResult is present',
  makeFixtureDir([
    {
      kind: 'output-byte-diff',
      call: 'verifyLocal',
      recordRefHash: '0'.repeat(64),
      shadowResult: { accepted: false },
      notes: 'has-raw-shadowResult',
      timestamp: '2026-04-26T00:00:00.000Z',
    },
  ]),
  1,
  /forbidden raw field present: shadowResult/
);

// -----------------------------------------------------------------------------
// Negative: structural failures
// -----------------------------------------------------------------------------
console.log('\n--- Negative: structural ---');
expectExit(
  'fails when recordRefHash is not 64-hex',
  makeFixtureDir([
    {
      kind: 'output-byte-diff',
      call: 'verifyLocal',
      recordRefHash: 'NOT-A-HASH',
      notes: 'bad-hash',
      timestamp: '2026-04-26T00:00:00.000Z',
    },
  ]),
  1,
  /recordRefHash is not a 64-character lowercase hex string/
);

expectExit(
  'fails when notes exceeds 128 UTF-8 bytes',
  makeFixtureDir([
    {
      kind: 'output-byte-diff',
      call: 'verifyLocal',
      recordRefHash: '0'.repeat(64),
      notes: 'x'.repeat(200),
      timestamp: '2026-04-26T00:00:00.000Z',
    },
  ]),
  1,
  /notes exceeds 128 UTF-8 bytes/
);

expectExit(
  'fails when an unknown field carries a secret pattern',
  makeFixtureDir([
    {
      kind: 'output-byte-diff',
      call: 'verifyLocal',
      recordRefHash: '0'.repeat(64),
      notes: 'unknown-leak',
      timestamp: '2026-04-26T00:00:00.000Z',
      extraDebug: 'Bearer abc.def.ghi-jkl-mno-pqr-stuvwxyz',
    },
  ]),
  1,
  /unexpected field extraDebug matches secret pattern/
);

// -----------------------------------------------------------------------------
// Cleanup
// -----------------------------------------------------------------------------
for (const d of tempDirs) {
  try {
    rmSync(d, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

console.log(`\n${passes + failures} cases - ${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
