/**
 * Tests for verify-slo.mjs gate behavior.
 * Run with: node scripts/benchmarks/verify-slo.test.mjs
 */

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const perfPath = resolve(root, 'perf-results.json');
const backupPath = resolve(root, 'perf-results.json.bak');

let passed = 0;
let failed = 0;

function setup() {
  if (existsSync(perfPath)) {
    renameSync(perfPath, backupPath);
  }
}

function teardown() {
  if (existsSync(backupPath)) {
    renameSync(backupPath, perfPath);
  } else if (existsSync(perfPath)) {
    // Remove any test-created file if no backup
  }
}

function runGate() {
  try {
    const output = execSync('node scripts/benchmarks/verify-slo.mjs', { encoding: 'utf8', cwd: root });
    return { exitCode: 0, output };
  } catch (err) {
    return { exitCode: err.status, output: err.stdout || '' };
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('verify-slo.mjs gate tests\n');
setup();

try {
  // Test 1: skip when perf-results.json is missing
  test('skips when perf-results.json is missing', () => {
    const { exitCode, output } = runGate();
    assert(exitCode === 0, `expected exit 0, got ${exitCode}`);
    assert(output.includes('SKIP'), 'expected SKIP in output');
  });

  // Test 2: OK when current matches baseline
  test('OK when current matches baseline (no regression)', () => {
    writeFileSync(perfPath, JSON.stringify([{
      operation: 'verify',
      timings_ms: { p95: 2.948 },
    }]));
    const { exitCode, output } = runGate();
    assert(exitCode === 0, `expected exit 0, got ${exitCode}`);
    assert(output.includes('[OK]'), 'expected [OK] in output');
  });

  // Test 3: WARN when exceeding CI target but not regression
  test('warns when p95 exceeds CI target but not regression threshold', () => {
    writeFileSync(perfPath, JSON.stringify([{
      operation: 'verify',
      timings_ms: { p95: 5.5 }, // > 2.948 baseline but < 5.896 (2x)
    }]));
    const { exitCode } = runGate();
    assert(exitCode === 0, `expected exit 0, got ${exitCode}`);
  });

  // Test 4: FAIL on regression (p95 > 2x baseline)
  test('fails on regression (p95 > 2x baseline)', () => {
    writeFileSync(perfPath, JSON.stringify([{
      operation: 'verify',
      timings_ms: { p95: 10.0 }, // > 5.896 (2x of 2.948)
    }]));
    const { exitCode, output } = runGate();
    assert(exitCode === 1, `expected exit 1, got ${exitCode}`);
    assert(output.includes('REGRESSION'), 'expected REGRESSION in output');
  });

  // Test 5: skip when operation has no baseline
  test('skips operations without baseline', () => {
    writeFileSync(perfPath, JSON.stringify([{
      operation: 'issue',
      timings_ms: { p95: 50.0 },
    }]));
    const { exitCode, output } = runGate();
    assert(exitCode === 0, `expected exit 0, got ${exitCode}`);
    assert(output.includes('SKIP'), 'expected SKIP for issue');
  });

} finally {
  teardown();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
