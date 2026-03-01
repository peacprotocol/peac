#!/usr/bin/env node

/**
 * Build PEAC Evidence Pack
 *
 * Generates a zip archive containing:
 * - Evidence: example receipts and verification transcripts
 * - Conformance: deterministic test report
 * - Spec snapshots: pinned normative specification files
 *
 * Usage: node scripts/build-submission-pack.mjs
 * Or via: pnpm evidence-pack
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, cpSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const PACK_DIR = join(ROOT, 'docs/evidence-pack');
const DIST = join(ROOT, 'dist');
const EVIDENCE_DIR = join(PACK_DIR, 'evidence');
const CONFORMANCE_DIR = join(PACK_DIR, 'conformance');
const SPEC_DIR = join(PACK_DIR, 'spec-snapshots');

// Ensure output directories exist
mkdirSync(DIST, { recursive: true });
mkdirSync(EVIDENCE_DIR, { recursive: true });
mkdirSync(CONFORMANCE_DIR, { recursive: true });
mkdirSync(SPEC_DIR, { recursive: true });

console.log('=== Building PEAC Evidence Pack ===\n');

// --- 1. Generate evidence: run hello-world and capture output ---
console.log('1. Generating evidence transcripts...');

try {
  const helloOutput = execSync('pnpm --filter @peac/example-hello-world demo', {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
  });
  writeFileSync(
    join(EVIDENCE_DIR, 'hello-world-transcript.txt'),
    `# Hello World Demo Transcript\n# Generated: ${new Date().toISOString()}\n\n${helloOutput}`
  );
  console.log('   hello-world transcript captured');
} catch {
  console.warn('   WARNING: hello-world demo failed, skipping transcript');
}

// --- 2. Generate conformance report ---
console.log('2. Generating conformance report...');

try {
  const testOutput = execSync('pnpm test 2>&1 || true', {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 120_000,
  });

  // Extract test summary lines
  const summaryLines = testOutput
    .split('\n')
    .filter(
      (line) =>
        line.includes('Test Files') ||
        line.includes('Tests ') ||
        line.includes('passed') ||
        line.includes('failed')
    );

  const report = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    summary: summaryLines.join('\n'),
    raw_length: testOutput.length,
  };

  writeFileSync(join(CONFORMANCE_DIR, 'test-report.json'), JSON.stringify(report, null, 2));
  console.log('   conformance report generated');
} catch {
  console.warn('   WARNING: test suite failed, writing partial report');
}

// --- 3. Copy spec snapshots ---
console.log('3. Copying spec snapshots...');

const specFiles = [
  'docs/specs/PROTOCOL-BEHAVIOR.md',
  'docs/specs/EVIDENCE-CARRIER-CONTRACT.md',
  'docs/specs/KERNEL-CONSTRAINTS.md',
  'docs/specs/PEAC-ISSUER.md',
  'docs/specs/PEAC-TXT.md',
];

for (const specFile of specFiles) {
  const src = join(ROOT, specFile);
  if (existsSync(src)) {
    const filename = specFile.split('/').pop();
    cpSync(src, join(SPEC_DIR, filename));
    console.log(`   ${filename}`);
  } else {
    console.log(`   SKIP: ${specFile} (not found)`);
  }
}

// --- 4. Copy conformance fixtures ---
console.log('4. Including conformance fixtures...');

const fixtureDir = join(ROOT, 'specs/conformance/fixtures');
if (existsSync(fixtureDir)) {
  cpSync(fixtureDir, join(EVIDENCE_DIR, 'conformance-fixtures'), { recursive: true });
  console.log('   conformance fixtures copied');
} else {
  console.log('   SKIP: conformance fixtures not found');
}

// --- 5. Build zip ---
console.log('5. Building zip archive...');

const zipName = 'peac-evidence-pack.zip';
const zipPath = join(DIST, zipName);

try {
  execSync(`cd "${PACK_DIR}" && zip -r "${zipPath}" . -x "*.DS_Store"`, {
    encoding: 'utf-8',
    timeout: 30_000,
  });
  console.log(`\n=== Evidence pack built: dist/${zipName} ===`);
} catch (err) {
  console.error('Failed to build zip archive:', err.message);
  process.exitCode = 1;
}
